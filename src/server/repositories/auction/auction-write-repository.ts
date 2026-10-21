// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. Auctions are tested
// against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
//
// Most functions take the `tx` of one database transaction: the auction rules lock the auction row with a guarded
// update first, then read and write everything else in the same transaction.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/repositories/transaction";

export function insertAuction(data: Prisma.AuctionUncheckedCreateInput) {
  return prisma.auction.create({ data, select: { id: true, auctionSeq: true } });
}

/** Locks an open auction whose deadline has passed (a guarded no-op update). Returns rows matched. */
export async function lockEndedAuction(tx: Tx, auctionId: string, now: Date): Promise<number> {
  const moved = await tx.auction.updateMany({
    where: { id: auctionId, status: "OPEN", closesAt: { lte: now } },
    data: { updatedAt: now },
  });
  return moved.count;
}

/** Locks an open auction whose deadline has not passed. Returns rows matched. */
export async function lockOpenAuction(tx: Tx, auctionId: string, now: Date): Promise<number> {
  const locked = await tx.auction.updateMany({
    where: { id: auctionId, status: "OPEN", closesAt: { gt: now } },
    data: { updatedAt: now },
  });
  return locked.count;
}

export function getAuctionWithVendor(tx: Tx, auctionId: string) {
  return tx.auction.findUniqueOrThrow({
    where: { id: auctionId },
    include: { vendor: { select: { userId: true } } },
  });
}

export function findAuctionWithVendor(tx: Tx, auctionId: string) {
  return tx.auction.findUnique({
    where: { id: auctionId },
    include: { vendor: { select: { userId: true } } },
  });
}

/** The highest bid (the earliest of equal ones), in full. */
export function findTopAuctionBid(tx: Tx, auctionId: string) {
  return tx.auctionBid.findFirst({
    where: { auctionId },
    orderBy: [{ unitPrice: "desc" }, { createdAt: "asc" }],
  });
}

/** The highest bid, with only what the bid rules compare against. */
export function findTopAuctionBidSummary(tx: Tx, auctionId: string) {
  return tx.auctionBid.findFirst({
    where: { auctionId },
    orderBy: [{ unitPrice: "desc" }, { createdAt: "asc" }],
    select: { unitPrice: true, bidderId: true },
  });
}

export function setAuctionOutcome(
  tx: Tx,
  auctionId: string,
  status: "SOLD" | "UNSOLD",
  winningBidId: string | null,
) {
  return tx.auction.update({ where: { id: auctionId }, data: { status, winningBidId } });
}

/** Every member who bid on the auction, once each. */
export function findDistinctBidders(tx: Tx, auctionId: string) {
  return tx.auctionBid.findMany({
    where: { auctionId },
    distinct: ["bidderId"],
    select: { bidderId: true },
  });
}

export function createAuctionBid(tx: Tx, data: Prisma.AuctionBidUncheckedCreateInput) {
  return tx.auctionBid.create({ data });
}

export function extendAuctionClosing(tx: Tx, auctionId: string, closesAt: Date) {
  return tx.auction.update({ where: { id: auctionId }, data: { closesAt } });
}

export function findAuctionWithBidCount(tx: Tx, auctionId: string) {
  return tx.auction.findUnique({
    where: { id: auctionId },
    include: { _count: { select: { bids: true } } },
  });
}

/**
 * Cancels an auction, re-checking the exact rule in the update itself (still open with no bids, or sold and
 * not yet paid for), so a bid or payment that landed since the read makes this match nothing. Returns rows changed.
 */
export async function cancelAuctionIfAllowed(
  tx: Tx,
  input: { auctionId: string; vendorId: string; reason: string },
): Promise<number> {
  const moved = await tx.auction.updateMany({
    where: {
      id: input.auctionId,
      vendorId: input.vendorId,
      OR: [
        { status: "OPEN", bids: { none: {} } },
        { status: "SOLD", checkoutId: null },
      ],
    },
    data: { status: "CANCELLED", cancelledReason: input.reason },
  });
  return moved.count;
}

export function findAuctionForClaim(auctionId: string) {
  return prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      winningBid: { select: { id: true, bidderId: true, unitPrice: true } },
      vendor: { select: { userId: true } },
    },
  });
}

/** Records the checkout on the auction only if it is still sold and unpaid. Returns rows changed. */
export async function claimAuctionCheckout(
  tx: Tx,
  input: { auctionId: string; checkoutId: string },
): Promise<number> {
  const claimed = await tx.auction.updateMany({
    where: { id: input.auctionId, status: "SOLD", checkoutId: null },
    data: { checkoutId: input.checkoutId },
  });
  return claimed.count;
}
