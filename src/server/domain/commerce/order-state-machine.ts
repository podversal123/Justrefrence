/**
 * Pure order status state machine — see docs/adr/0008-explicit-state-machines.md
 * and docs/business-rules.md Q-26. No I/O, no "server-only": fully
 * unit-testable. The only code path allowed to change `Order.status` is
 * assertOrderTransition() below, called from
 * src/server/domain/commerce/order-service.ts, which writes the new status
 * AND an OrderStatusHistory row in the same transaction.
 */
import { ConflictError } from "@/server/lib/errors";

export const ORDER_STATUSES = [
  "PLACED",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderActorRole = "ADMIN" | "FINANCE" | "VENDOR" | "CUSTOMER" | "SYSTEM";

export interface OrderActor {
  role: OrderActorRole;
  /**
   * Required (and checked) when role is VENDOR or CUSTOMER: must be true to
   * transition THIS specific order — i.e. the caller already verified this
   * VENDOR owns the order, or this CUSTOMER is its buyer. Ignored for
   * ADMIN/FINANCE/SYSTEM, who act platform-wide. This function has no DB
   * access, so it trusts the caller resolved ownership correctly — see
   * docs/rbac.md §4 ("order:update_status ... own, vendor-controlled
   * transitions only"; "order:cancel ... own, pre-ship").
   */
  isOwner?: boolean;
}

interface TransitionRule {
  to: OrderStatus;
  roles: OrderActorRole[];
}

/**
 * PLACED -> PAID is normally SYSTEM-triggered (a future payment-gateway
 * webhook) — see docs/adr/0013-commerce-money-math.md on why there's no
 * live payment integration yet. ADMIN/FINANCE can also force it (manual
 * reconciliation). "Pre-ship" cancellation (docs/rbac.md) means CANCELLED
 * is only reachable from PLACED/PAID/PROCESSING, never after SHIPPED.
 */
const ORDER_TRANSITIONS: Record<OrderStatus, TransitionRule[]> = {
  PLACED: [
    { to: "PAID", roles: ["ADMIN", "FINANCE", "SYSTEM"] },
    { to: "CANCELLED", roles: ["ADMIN", "VENDOR", "CUSTOMER"] },
  ],
  PAID: [
    { to: "PROCESSING", roles: ["ADMIN", "VENDOR"] },
    { to: "CANCELLED", roles: ["ADMIN", "VENDOR", "CUSTOMER"] },
    // SYSTEM: Phase 8's payment-service.ts applies this status change
    // itself once Razorpay confirms a refund (initiated by ADMIN/FINANCE,
    // applied by the verified server-side event) — same split as PLACED ->
    // PAID above.
    { to: "REFUNDED", roles: ["ADMIN", "FINANCE", "SYSTEM"] },
  ],
  PROCESSING: [
    { to: "SHIPPED", roles: ["ADMIN", "VENDOR"] },
    { to: "CANCELLED", roles: ["ADMIN", "VENDOR", "CUSTOMER"] },
  ],
  SHIPPED: [{ to: "DELIVERED", roles: ["ADMIN", "VENDOR"] }],
  // The buyer confirming receipt is their own prerogative, independent of
  // the generic order:update_status permission (which CUSTOMER never
  // holds) — see docs/rbac.md §4.
  DELIVERED: [{ to: "COMPLETED", roles: ["ADMIN", "CUSTOMER"] }],
  COMPLETED: [{ to: "REFUNDED", roles: ["ADMIN", "FINANCE", "SYSTEM"] }],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  const rule = ORDER_TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) return false;
  if (!rule.roles.includes(actor.role)) return false;
  if ((actor.role === "VENDOR" || actor.role === "CUSTOMER") && !actor.isOwner) return false;
  return true;
}

/** Every status this actor could legally move `from` to right now — drives the order-detail page's action buttons. */
export function getAvailableTransitions(from: OrderStatus, actor: OrderActor): OrderStatus[] {
  return ORDER_TRANSITIONS[from]
    .filter((rule) => canTransitionOrder(from, rule.to, actor))
    .map((rule) => rule.to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): OrderStatus {
  if (!canTransitionOrder(from, to, actor)) {
    throw new ConflictError(`Cannot move an order from ${from} to ${to}.`);
  }
  return to;
}
