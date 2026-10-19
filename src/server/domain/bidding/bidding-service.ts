// No "server-only" import — orchestration layer, same rationale as
// checkout-service.ts (its prisma dependency carries the guard).
import { prisma } from "@/server/lib/prisma";
import {
  canAward,
  checkBid,
  effectiveStatus,
  nextClosesAt,
  rankBids,
  totalFor,
  type RequirementLike,
} from "@/server/domain/bidding/rules";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/lib/errors";
import {
  createCheckout,
  markCartCheckedOut,
} from "@/server/repositories/commerce/order-repository";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";
import { getPricingConfig } from "@/server/lib/pricing-config";
import { createVendorOrder } from "@/server/domain/commerce/order-creation";
import { generateInvoiceForOrder } from "@/server/domain/commerce/invoice-service";
import { formatRequirementNumber } from "@/server/domain/bidding/rules";
import { logger } from "@/server/lib/logger";
import type { Requirement } from "@/generated/prisma/client";

/**
 * Bidding and reverse-auction orchestration. Every state change happens in
 * ONE transaction that first "touches" the requirement row with a
 * conditional UPDATE — the same atomic-guard pattern the payment and stock
 * code use. That UPDATE both validates the precondition (still open, still
 * the buyer's, ...) and takes the row lock, so two vendors bidding at the
 * same instant are processed one after the other and every rule in rules.ts
 * is evaluated against the state the previous bid left behind.
 */

function asRuleInput(requirement: Requirement): RequirementLike {
  return {
    type: requirement.type,
    status: requirement.status,
    closesAt: requirement.closesAt,
    quantity: requirement.quantity,
    minDecrement: requirement.minDecrement,
    autoExtendMinutes: requirement.autoExtendMinutes,
    estimatedValue: requirement.estimatedValue,
  };
}

export interface CreateRequirementInput {
  title: string;
  description: string;
  itemKind: "PRODUCT" | "SERVICE" | "PROJECT";
  categoryLabel: string | null;
  quantity: number;
  unit: string;
  deliveryCity: string | null;
  estimatedValue: bigint | null;
  type: "TENDER" | "REVERSE_AUCTION";
  closesAt: Date;
  minDecrement: bigint;
  autoExtendMinutes: number;
}

export async function createRequirement(buyerId: string, input: CreateRequirementInput) {
  return prisma.requirement.create({
    data: { ...input, buyerId },
    select: { id: true, reqSeq: true },
  });
}

/** Persists OPEN -> CLOSED once the deadline has passed. Safe to call any time, any number of times. */
export async function closeIfExpired(requirementId: string, now = new Date()): Promise<boolean> {
  const result = await prisma.requirement.updateMany({
    where: { id: requirementId, status: "OPEN", closesAt: { lte: now } },
    data: { status: "CLOSED" },
  });
  return result.count > 0;
}

export interface PlaceBidInput {
  requirementId: string;
  vendorProfileId: string;
  vendorUserId: string;
  unitPrice: bigint;
  deliveryDays: number;
  note: string | null;
}

export interface PlaceBidResult {
  bidId: string;
  buyerId: string;
  reqSeq: bigint;
  title: string;
  totalPrice: bigint;
  rank: number;
  isFirstBid: boolean;
  /** Set when an auction's closing time was pushed out by this bid. */
  extendedTo: Date | null;
  /** The vendor who was L1 until this bid took the lead (reverse auctions), if any. */
  outbidVendorUserId: string | null;
}

export async function placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Lock + precondition: only an OPEN requirement whose deadline hasn't passed.
    const locked = await tx.requirement.updateMany({
      where: { id: input.requirementId, status: "OPEN", closesAt: { gt: now } },
      data: { updatedAt: now },
    });
    const requirement = await tx.requirement.findUnique({ where: { id: input.requirementId } });
    if (!requirement) throw new NotFoundError("Requirement not found.");
    if (locked.count === 0) throw new ConflictError("Bidding on this requirement is closed.");
    if (requirement.buyerId === input.vendorUserId) {
      throw new AuthorizationError("You can't bid on your own requirement.");
    }

    const existing = await tx.bid.findUnique({
      where: {
        requirementId_vendorId: {
          requirementId: input.requirementId,
          vendorId: input.vendorProfileId,
        },
      },
    });
    // A withdrawn tender bid starts fresh; only an ACTIVE bid constrains the new price.
    const live = existing && existing.status === "ACTIVE" ? existing : null;

    const violation = checkBid({
      requirement: asRuleInput(requirement),
      unitPrice: input.unitPrice,
      deliveryDays: input.deliveryDays,
      existing: live ? { unitPrice: live.unitPrice, deliveryDays: live.deliveryDays } : null,
      now,
    });
    if (violation) throw new ValidationError(violation.message, { code: violation.code });

    const before = await tx.bid.findMany({
      where: { requirementId: input.requirementId, status: { not: "WITHDRAWN" } },
      select: { id: true, vendorId: true, totalPrice: true, priceSetAt: true },
    });
    const previousLeader = rankBids(before)[0] ?? null;

    const totalPrice = totalFor(input.unitPrice, requirement.quantity);
    const priceChanged = !live || live.unitPrice !== input.unitPrice;
    const priceSetAt = priceChanged || !existing ? now : existing.priceSetAt;

    const data = {
      unitPrice: input.unitPrice,
      totalPrice,
      deliveryDays: input.deliveryDays,
      note: input.note,
      status: "ACTIVE" as const,
      priceSetAt,
    };
    const bid = existing
      ? await tx.bid.update({ where: { id: existing.id }, data })
      : await tx.bid.create({
          data: { ...data, requirementId: input.requirementId, vendorId: input.vendorProfileId },
        });

    // Append-only history: every submit and every revision.
    await tx.bidRevision.create({
      data: {
        bidId: bid.id,
        unitPrice: input.unitPrice,
        totalPrice,
        deliveryDays: input.deliveryDays,
      },
    });

    const closesAt = nextClosesAt(asRuleInput(requirement), now);
    const extended = closesAt.getTime() > requirement.closesAt.getTime();
    if (extended) {
      await tx.requirement.update({ where: { id: requirement.id }, data: { closesAt } });
    }

    const after = rankBids(
      await tx.bid.findMany({
        where: { requirementId: input.requirementId, status: { not: "WITHDRAWN" } },
        select: { id: true, vendorId: true, totalPrice: true, priceSetAt: true },
      }),
    );
    const mine = after.find((entry) => entry.id === bid.id);

    let outbidVendorUserId: string | null = null;
    if (
      requirement.type === "REVERSE_AUCTION" &&
      previousLeader &&
      previousLeader.vendorId !== input.vendorProfileId &&
      after[0]?.id === bid.id
    ) {
      const leaderVendor = await tx.vendorProfile.findUnique({
        where: { id: previousLeader.vendorId },
        select: { userId: true },
      });
      outbidVendorUserId = leaderVendor?.userId ?? null;
    }

    return {
      bidId: bid.id,
      buyerId: requirement.buyerId,
      reqSeq: requirement.reqSeq,
      title: requirement.title,
      totalPrice,
      rank: mine?.rank ?? 1,
      isFirstBid: before.length === 0,
      extendedTo: extended ? closesAt : null,
      outbidVendorUserId,
    };
  });
}

/** Sealed-tender vendors may withdraw until the deadline; an auction bid is final. */
export async function withdrawBid(input: { requirementId: string; vendorProfileId: string }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const locked = await tx.requirement.updateMany({
      where: { id: input.requirementId, status: "OPEN", closesAt: { gt: now }, type: "TENDER" },
      data: { updatedAt: now },
    });
    if (locked.count === 0) {
      const requirement = await tx.requirement.findUnique({
        where: { id: input.requirementId },
        select: { type: true },
      });
      if (!requirement) throw new NotFoundError("Requirement not found.");
      if (requirement.type === "REVERSE_AUCTION") {
        throw new ConflictError("A bid in a reverse auction can't be withdrawn.");
      }
      throw new ConflictError(
        "Bidding on this requirement is closed, so the bid can't be withdrawn.",
      );
    }
    const result = await tx.bid.updateMany({
      where: {
        requirementId: input.requirementId,
        vendorId: input.vendorProfileId,
        status: "ACTIVE",
      },
      data: { status: "WITHDRAWN" },
    });
    if (result.count === 0)
      throw new NotFoundError("You don't have an active bid on this requirement.");
  });
}

export interface AwardResult {
  reqSeq: bigint;
  title: string;
  winnerUserId: string;
  winningTotal: bigint;
  rejectedUserIds: string[];
}

/** Awards to one ACTIVE bid after bidding has ended; every other active bid becomes REJECTED. Exactly once. */
export async function awardBid(input: {
  requirementId: string;
  bidId: string;
  buyerId: string;
}): Promise<AwardResult> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const requirement = await tx.requirement.findUnique({ where: { id: input.requirementId } });
    if (!requirement) throw new NotFoundError("Requirement not found.");
    // Ownership is checked here, separately from the permission the action already checked.
    if (requirement.buyerId !== input.buyerId) throw new NotFoundError("Requirement not found.");

    const bid = await tx.bid.findFirst({
      where: { id: input.bidId, requirementId: input.requirementId },
      select: { id: true, status: true, totalPrice: true, vendor: { select: { userId: true } } },
    });
    if (!bid) throw new NotFoundError("Bid not found.");

    const check = canAward(requirement, bid.status, now);
    if (!check.ok) throw new ConflictError(check.message ?? "This requirement can't be awarded.");

    // Atomic: only one request can move it to AWARDED.
    const moved = await tx.requirement.updateMany({
      where: {
        id: requirement.id,
        buyerId: input.buyerId,
        status: { in: ["OPEN", "CLOSED"] },
        closesAt: { lte: now },
      },
      data: { status: "AWARDED", awardedBidId: bid.id },
    });
    if (moved.count === 0)
      throw new ConflictError("This requirement has already been awarded or cancelled.");

    await tx.bid.update({ where: { id: bid.id }, data: { status: "ACCEPTED" } });
    const others = await tx.bid.findMany({
      where: { requirementId: requirement.id, status: "ACTIVE", id: { not: bid.id } },
      select: { id: true, vendor: { select: { userId: true } } },
    });
    if (others.length > 0) {
      await tx.bid.updateMany({
        where: { id: { in: others.map((o) => o.id) } },
        data: { status: "REJECTED" },
      });
    }
    return {
      reqSeq: requirement.reqSeq,
      title: requirement.title,
      winnerUserId: bid.vendor.userId,
      winningTotal: bid.totalPrice,
      rejectedUserIds: others.map((o) => o.vendor.userId),
    };
  });
}

/** The buyer may cancel any time before awarding; every active bid is released. */
export async function cancelRequirement(input: {
  requirementId: string;
  buyerId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.requirement.updateMany({
      where: {
        id: input.requirementId,
        buyerId: input.buyerId,
        status: { in: ["OPEN", "CLOSED"] },
      },
      data: { status: "CANCELLED", cancelledReason: input.reason },
    });
    if (moved.count === 0) {
      const requirement = await tx.requirement.findUnique({
        where: { id: input.requirementId },
        select: { buyerId: true, status: true },
      });
      if (!requirement || requirement.buyerId !== input.buyerId)
        throw new NotFoundError("Requirement not found.");
      throw new ConflictError(
        requirement.status === "AWARDED"
          ? "An awarded requirement can't be cancelled."
          : "This requirement is already cancelled.",
      );
    }
    const bidders = await tx.bid.findMany({
      where: { requirementId: input.requirementId, status: "ACTIVE" },
      select: { id: true, vendor: { select: { userId: true } } },
    });
    if (bidders.length > 0) {
      await tx.bid.updateMany({
        where: { id: { in: bidders.map((b) => b.id) } },
        data: { status: "REJECTED" },
      });
    }
    const requirement = await tx.requirement.findUniqueOrThrow({
      where: { id: input.requirementId },
      select: { reqSeq: true, title: true },
    });
    return { ...requirement, bidderUserIds: bidders.map((b) => b.vendor.userId) };
  });
}

export { effectiveStatus };

export interface ClaimBidResult {
  checkoutId: string;
  orderId: string;
  number: string;
  title: string;
  vendorUserId: string;
}

/**
 * The buyer pays for the awarded bid: turns the award into a normal order (same pricing, commission and
 * invoice as a cart checkout) at the WINNING unit price and the requested quantity, and the buyer then
 * pays it through the usual payment screen. Exactly once per requirement: the unique checkout key and the
 * conditional update both guard it, so a double click or a retry returns the order already made.
 */
export async function claimAwardedBid(input: {
  requirementId: string;
  buyerUserId: string;
  memberId: string;
}): Promise<ClaimBidResult> {
  const idempotencyKey = scopedIdempotencyKey(
    "requirement",
    input.buyerUserId,
    input.requirementId,
  );

  const requirement = await prisma.requirement.findUnique({
    where: { id: input.requirementId },
    include: {
      awardedBid: {
        select: { id: true, unitPrice: true, vendorId: true, vendor: { select: { userId: true } } },
      },
    },
  });
  // Same answer for "no such requirement" and "not yours", so ids cannot be probed.
  if (!requirement || requirement.buyerId !== input.buyerUserId) {
    throw new NotFoundError("Requirement not found.");
  }
  const number = formatRequirementNumber(requirement.reqSeq);
  const bid = requirement.awardedBid;

  // Idempotent replay: a double click or retry returns the order already made.
  const existing = await prisma.checkout.findUnique({
    where: { idempotencyKey },
    include: { orders: { select: { id: true } } },
  });
  if (existing?.orders[0] && bid) {
    return {
      checkoutId: existing.id,
      orderId: existing.orders[0].id,
      number,
      title: requirement.title,
      vendorUserId: bid.vendor.userId,
    };
  }
  if (requirement.status !== "AWARDED" || !bid) {
    throw new ConflictError("There is no awarded offer to pay for on this requirement.");
  }
  if (requirement.checkoutId) {
    throw new ConflictError("This requirement has already been paid for.");
  }

  const pricingConfig = await getPricingConfig();

  let result: { checkoutId: string; orderId: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.create({
        data: { ownerUserId: input.buyerUserId, status: "CHECKED_OUT" },
      });
      const checkout = await createCheckout(tx, {
        cartId: cart.id,
        buyerId: input.buyerUserId,
        couponId: null,
        idempotencyKey,
      });

      // Once-only guard: only the call that moves checkoutId from null wins.
      const claimed = await tx.requirement.updateMany({
        where: {
          id: requirement.id,
          buyerId: input.buyerUserId,
          status: "AWARDED",
          checkoutId: null,
        },
        data: { checkoutId: checkout.id },
      });
      if (claimed.count === 0) {
        throw new ConflictError("This requirement has already been paid for.");
      }

      const created = await createVendorOrder(tx, {
        checkoutId: checkout.id,
        vendorId: bid.vendorId,
        buyerId: input.buyerUserId,
        memberId: input.memberId,
        lines: [
          {
            itemType: requirement.itemKind,
            itemId: requirement.id,
            title: requirement.title,
            unitPrice: bid.unitPrice,
            qty: requirement.quantity,
            trackStock: false,
          },
        ],
        discount: 0n,
        couponId: null,
        gstRateBps: pricingConfig.gstRateBps,
        platformFeeRateBps: pricingConfig.platformFeeRateBps,
      });
      await markCartCheckedOut(tx, cart.id);
      return { checkoutId: checkout.id, orderId: created.orderId };
    });
  } catch (error) {
    // Concurrent same-key claim: the unique index rejected the loser; answer with the winner's order.
    if (isUniqueConstraintViolation(error)) {
      const winner = await prisma.checkout.findUnique({
        where: { idempotencyKey },
        include: { orders: { select: { id: true } } },
      });
      if (winner?.orders[0]) {
        return {
          checkoutId: winner.id,
          orderId: winner.orders[0].id,
          number,
          title: requirement.title,
          vendorUserId: bid.vendor.userId,
        };
      }
    }
    throw error;
  }

  try {
    await generateInvoiceForOrder(result.orderId);
  } catch (error) {
    // Same boundary as cart checkout: a failed invoice never undoes the order.
    logger.error("invoice_generation_failed", {
      orderId: result.orderId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { ...result, number, title: requirement.title, vendorUserId: bid.vendor.userId };
}
