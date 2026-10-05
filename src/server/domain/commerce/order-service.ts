// No "server-only" import — orchestration layer, same rationale as
// checkout-service.ts.
import { prisma } from "@/server/lib/prisma";
import {
  createOrderStatusHistory,
  getOrderDetail,
  updateOrderStatus,
} from "@/server/repositories/commerce/order-repository";
import {
  assertOrderTransition,
  type OrderActorRole,
  type OrderStatus,
} from "@/server/domain/commerce/order-state-machine";
import {
  promoteCommissionsForCompletedOrder,
  reverseOrCancelCommissionsForOrder,
} from "@/server/domain/commission/commission-service";
import { recordAudit } from "@/server/domain/audit/record";
import { AuthorizationError, NotFoundError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/**
 * Deliberately decoupled from AuthSession (src/server/auth/session.ts,
 * which is "server-only") — the Server Action layer builds this from the
 * resolved session, keeping this service testable without pulling in
 * Supabase/Prisma session resolution.
 */
export interface OrderActorContext {
  userId: string;
  roles: string[];
  vendorProfileId: string | null;
}

export function resolveActorRole(
  actor: OrderActorContext,
  order: { vendorId: string; buyerId: string; vendor: { userId: string } },
): { role: OrderActorRole; isOwner: boolean } {
  if (actor.roles.includes("SUPER_ADMIN") || actor.roles.includes("ADMIN")) {
    return { role: "ADMIN", isOwner: true };
  }
  if (actor.roles.includes("FINANCE")) {
    return { role: "FINANCE", isOwner: true };
  }
  if (actor.vendorProfileId && actor.vendorProfileId === order.vendorId) {
    return { role: "VENDOR", isOwner: true };
  }
  if (actor.userId === order.buyerId) {
    return { role: "CUSTOMER", isOwner: true };
  }
  // A real role/relationship, just not one with any standing on THIS order.
  throw new AuthorizationError("You don't have access to this order.");
}

async function applyTransition(
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  actorId: string | null,
  reason: string | null,
) {
  await prisma.$transaction(async (tx) => {
    await updateOrderStatus(tx, orderId, toStatus);
    await createOrderStatusHistory(tx, { orderId, fromStatus, toStatus, actorId, reason });
  });

  await recordAudit({
    actorId,
    action: "ORDER_STATUS_CHANGED",
    entityType: "orders",
    entityId: orderId,
    before: { status: fromStatus },
    after: { status: toStatus, reason },
  });

  // Phase 6: commission lifecycle follows the order's own lifecycle —
  // COMPLETED confirms accrued commissions (Q-06), CANCELLED/REFUNDED
  // reverses them (Q-07). Run after the order's own transaction commits,
  // same "log and continue" boundary as invoice generation in
  // checkout-service.ts — a commission-processing failure must never make
  // the order status update itself fail or appear to roll back.
  try {
    if (toStatus === "COMPLETED") {
      await promoteCommissionsForCompletedOrder(orderId);
    } else if (toStatus === "CANCELLED" || toStatus === "REFUNDED") {
      await reverseOrCancelCommissionsForOrder(orderId, actorId, reason ?? `Order moved to ${toStatus}`);
    }
  } catch (error) {
    logger.error("commission_processing_failed", {
      orderId,
      toStatus,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return getOrderDetail(orderId);
}

export async function transitionOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  actor: OrderActorContext,
  reason?: string,
) {
  const order = await getOrderDetail(orderId);
  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  const resolved = resolveActorRole(actor, order);
  assertOrderTransition(order.status, toStatus, { role: resolved.role, isOwner: resolved.isOwner });

  return applyTransition(orderId, order.status, toStatus, actor.userId, reason ?? null);
}

/**
 * The SYSTEM-triggered path — Phase 8's payment-service.ts (PLACED -> PAID
 * on a verified capture, PAID/COMPLETED -> REFUNDED on a confirmed refund)
 * and Phase 4's/5's own earlier hooks all go through here instead of
 * transitionOrderStatus(), since there's no human session/ownership to
 * resolve for a webhook- or cron-driven change. actorId is null (the
 * audit/history convention this codebase already uses for genuine system
 * actions — see AuditLog.actorId).
 */
export async function transitionOrderStatusBySystem(
  orderId: string,
  toStatus: OrderStatus,
  reason?: string,
) {
  const order = await getOrderDetail(orderId);
  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  assertOrderTransition(order.status, toStatus, { role: "SYSTEM" });

  return applyTransition(orderId, order.status, toStatus, null, reason ?? null);
}

/** Ownership check for order:read (own) — see docs/rbac.md §4. */
export function canViewOrder(
  actor: OrderActorContext,
  order: { vendorId: string; buyerId: string },
): boolean {
  if (actor.roles.some((r) => ["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"].includes(r))) return true;
  if (actor.vendorProfileId && actor.vendorProfileId === order.vendorId) return true;
  return actor.userId === order.buyerId;
}
