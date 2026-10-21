// No "server-only" import — orchestration layer, same rationale as bidding-service.ts
// (its prisma dependency carries the guard).
import { runInTransaction } from "@/server/repositories/transaction";
import {
  cancelAuctionIfAllowed,
  claimAuctionCheckout,
  createAuctionBid,
  extendAuctionClosing,
  findAuctionForClaim,
  findAuctionWithBidCount,
  findAuctionWithVendor,
  findDistinctBidders,
  findTopAuctionBid,
  findTopAuctionBidSummary,
  getAuctionWithVendor,
  insertAuction,
  lockEndedAuction,
  lockOpenAuction,
  setAuctionOutcome,
} from "@/server/repositories/auction/auction-write-repository";
import {
  createCheckedOutCart,
  findCheckoutWithOrders,
} from "@/server/repositories/commerce/checkout-claim-repository";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  createCheckout,
  markCartCheckedOut,
} from "@/server/repositories/commerce/order-repository";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";
import { getPricingConfig } from "@/server/lib/pricing-config";
import { createVendorOrder } from "@/server/domain/commerce/order-creation";
import { generateInvoiceForOrder } from "@/server/domain/commerce/invoice-service";
import {
  canCancel,
  canClaim,
  checkBid,
  decideOutcome,
  formatAuctionNumber,
  nextClosesAt,
  totalFor,
  type AuctionLike,
} from "@/server/domain/auction/rules";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { Auction } from "@/generated/prisma/client";
import type { CatalogItemKind } from "@/generated/prisma/enums";

/**
 * Forward-auction orchestration. Every state change happens in ONE transaction
 * that first "touches" the auction row with a conditional UPDATE — the same
 * atomic-guard pattern bidding-service.ts uses. That UPDATE validates the
 * precondition (still open, still the vendor's, ...) and takes the row lock,
 * so two members bidding at the same instant are handled one after the other
 * and every rule in rules.ts runs against the state the previous bid left.
 */

function asRuleInput(auction: Auction): AuctionLike {
  return {
    status: auction.status,
    closesAt: auction.closesAt,
    quantity: auction.quantity,
    startPrice: auction.startPrice,
    reservePrice: auction.reservePrice,
    minIncrement: auction.minIncrement,
    autoExtendMinutes: auction.autoExtendMinutes,
  };
}

export interface CreateAuctionInput {
  vendorProfileId: string;
  itemType: CatalogItemKind;
  itemId: string;
  description: string | null;
  quantity: number;
  startPrice: bigint;
  reservePrice: bigint | null;
  minIncrement: bigint;
  autoExtendMinutes: number;
  closesAt: Date;
}

/** The vendor may only auction one of their own approved, active listings that has enough stock. */
export async function createAuction(input: CreateAuctionInput) {
  const listing = await getCatalogRepository(input.itemType).getById(input.itemId);
  if (!listing || listing.vendorId !== input.vendorProfileId) {
    throw new NotFoundError("Listing not found.");
  }
  if (listing.approvalStatus !== "APPROVED" || !listing.isActive) {
    throw new ValidationError("Only an approved, active listing can be put up for auction.");
  }
  if (input.itemType === "PRODUCT" && listing.stock < input.quantity) {
    throw new ValidationError(`You only have ${listing.stock} in stock.`);
  }

  return insertAuction({
    vendorId: input.vendorProfileId,
    itemType: input.itemType,
    itemId: input.itemId,
    title: listing.title,
    description: input.description,
    quantity: input.quantity,
    startPrice: input.startPrice,
    reservePrice: input.reservePrice,
    minIncrement: input.minIncrement,
    autoExtendMinutes: input.autoExtendMinutes,
    closesAt: input.closesAt,
  });
}

export interface AuctionEnding {
  auctionId: string;
  number: string;
  title: string;
  vendorUserId: string;
  outcome: "SOLD" | "UNSOLD";
  winnerUserId: string | null;
  winningTotal: bigint | null;
  /** Other members who bid and lost. */
  loserUserIds: string[];
}

/**
 * Persists OPEN -> SOLD/UNSOLD once the deadline has passed. Safe to call any time, any number of
 * times; returns the ending details ONLY to the one call that actually made the change, so the
 * notifications that follow go out exactly once.
 */
export async function finalizeIfEnded(
  auctionId: string,
  now = new Date(),
): Promise<AuctionEnding | null> {
  return runInTransaction(async (tx) => {
    const moved = await lockEndedAuction(tx, auctionId, now);
    if (moved === 0) return null;

    const auction = await getAuctionWithVendor(tx, auctionId);
    const top = await findTopAuctionBid(tx, auctionId);
    const outcome = decideOutcome(auction, top?.unitPrice ?? null);

    await setAuctionOutcome(tx, auctionId, outcome, outcome === "SOLD" && top ? top.id : null);

    const bidders = await findDistinctBidders(tx, auctionId);
    const winnerUserId = outcome === "SOLD" && top ? top.bidderId : null;
    return {
      auctionId,
      number: formatAuctionNumber(auction.auctionSeq),
      title: auction.title,
      vendorUserId: auction.vendor.userId,
      outcome,
      winnerUserId,
      winningTotal: outcome === "SOLD" && top ? top.totalPrice : null,
      loserUserIds: bidders.map((b) => b.bidderId).filter((id) => id !== winnerUserId),
    };
  });
}

export interface PlaceAuctionBidResult {
  bidId: string;
  number: string;
  title: string;
  vendorUserId: string;
  totalPrice: bigint;
  isFirstBid: boolean;
  /** The member who was leading until this bid, if it was someone else. */
  outbidUserId: string | null;
  /** Set when this bid pushed the closing time out. */
  extendedTo: Date | null;
}

export async function placeAuctionBid(input: {
  auctionId: string;
  bidderId: string;
  unitPrice: bigint;
}): Promise<PlaceAuctionBidResult> {
  const now = new Date();

  return runInTransaction(async (tx) => {
    // Lock + precondition: only an OPEN auction whose deadline hasn't passed.
    const lockedCount = await lockOpenAuction(tx, input.auctionId, now);
    const auction = await findAuctionWithVendor(tx, input.auctionId);
    if (!auction) throw new NotFoundError("Auction not found.");
    if (lockedCount === 0) throw new ConflictError("Bidding on this auction is closed.");

    const top = await findTopAuctionBidSummary(tx, input.auctionId);

    const violation = checkBid({
      auction: asRuleInput(auction),
      unitPrice: input.unitPrice,
      top,
      bidderId: input.bidderId,
      isSeller: auction.vendor.userId === input.bidderId,
      now,
    });
    if (violation) throw new ValidationError(violation.message, { code: violation.code });

    const totalPrice = totalFor(input.unitPrice, auction.quantity);
    const bid = await createAuctionBid(tx, {
      auctionId: input.auctionId,
      bidderId: input.bidderId,
      unitPrice: input.unitPrice,
      totalPrice,
    });

    const closesAt = nextClosesAt(auction, now);
    const extended = closesAt.getTime() > auction.closesAt.getTime();
    if (extended) {
      await extendAuctionClosing(tx, auction.id, closesAt);
    }

    return {
      bidId: bid.id,
      number: formatAuctionNumber(auction.auctionSeq),
      title: auction.title,
      vendorUserId: auction.vendor.userId,
      totalPrice,
      isFirstBid: top === null,
      outbidUserId: top && top.bidderId !== input.bidderId ? top.bidderId : null,
      extendedTo: extended ? closesAt : null,
    };
  });
}

/** The vendor may cancel before any bid, or after a sale that hasn't been paid for yet. */
export async function cancelAuction(input: {
  auctionId: string;
  vendorProfileId: string;
  reason: string;
}) {
  return runInTransaction(async (tx) => {
    const auction = await findAuctionWithBidCount(tx, input.auctionId);
    if (!auction || auction.vendorId !== input.vendorProfileId) {
      throw new NotFoundError("Auction not found.");
    }
    const check = canCancel(auction, auction._count.bids);
    if (!check.ok) throw new ConflictError(check.message ?? "This auction can't be cancelled.");

    // Atomic: the WHERE re-checks the exact rule, so a bid or payment that landed since the
    // read above makes this update match nothing instead of cancelling a live sale.
    const moved = await cancelAuctionIfAllowed(tx, {
      auctionId: auction.id,
      vendorId: input.vendorProfileId,
      reason: input.reason,
    });
    if (moved === 0) {
      throw new ConflictError("This auction just changed and can't be cancelled any more.");
    }

    const bidders = await findDistinctBidders(tx, auction.id);
    return {
      number: formatAuctionNumber(auction.auctionSeq),
      title: auction.title,
      bidderUserIds: bidders.map((b) => b.bidderId),
    };
  });
}

export interface ClaimResult {
  checkoutId: string;
  orderId: string;
  number: string;
  title: string;
  vendorUserId: string;
}

/**
 * The winner pays: turns the sale into a normal order (same pricing, commission and invoice as a
 * cart checkout) at the WINNING price, then the member pays it through the usual payment screen.
 * Exactly once per auction: the unique checkout key and the conditional update both guard it.
 */
export async function claimAuction(input: {
  auctionId: string;
  winnerUserId: string;
  memberId: string;
}): Promise<ClaimResult> {
  const idempotencyKey = scopedIdempotencyKey("auction", input.winnerUserId, input.auctionId);

  const auction = await findAuctionForClaim(input.auctionId);
  if (!auction || !auction.winningBid || auction.winningBid.bidderId !== input.winnerUserId) {
    throw new NotFoundError("Auction not found.");
  }
  const number = formatAuctionNumber(auction.auctionSeq);

  // Idempotent replay: a double click or retry returns the order already made.
  const existing = await findCheckoutWithOrders(idempotencyKey);
  if (existing?.orders[0]) {
    return {
      checkoutId: existing.id,
      orderId: existing.orders[0].id,
      number,
      title: auction.title,
      vendorUserId: auction.vendor.userId,
    };
  }
  if (!canClaim(auction)) {
    throw new ConflictError(
      auction.status === "SOLD"
        ? "This auction has already been paid for."
        : "This auction can't be paid for.",
    );
  }

  const pricingConfig = await getPricingConfig();
  const winningUnitPrice = auction.winningBid.unitPrice;

  let result: { checkoutId: string; orderId: string };
  try {
    result = await runInTransaction(async (tx) => {
      const cart = await createCheckedOutCart(tx, input.winnerUserId);
      const checkout = await createCheckout(tx, {
        cartId: cart.id,
        buyerId: input.winnerUserId,
        couponId: null,
        idempotencyKey,
      });

      // Once-only guard: only the call that moves checkoutId from null wins.
      const claimed = await claimAuctionCheckout(tx, {
        auctionId: auction.id,
        checkoutId: checkout.id,
      });
      if (claimed === 0) throw new ConflictError("This auction has already been paid for.");

      const created = await createVendorOrder(tx, {
        checkoutId: checkout.id,
        vendorId: auction.vendorId,
        buyerId: input.winnerUserId,
        memberId: input.memberId,
        lines: [
          {
            itemType: auction.itemType,
            itemId: auction.itemId,
            title: auction.title,
            unitPrice: winningUnitPrice,
            qty: auction.quantity,
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
      const winner = await findCheckoutWithOrders(idempotencyKey);
      if (winner?.orders[0]) {
        return {
          checkoutId: winner.id,
          orderId: winner.orders[0].id,
          number,
          title: auction.title,
          vendorUserId: auction.vendor.userId,
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

  return {
    ...result,
    number,
    title: auction.title,
    vendorUserId: auction.vendor.userId,
  };
}
