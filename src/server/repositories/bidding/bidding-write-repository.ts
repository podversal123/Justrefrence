// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. Bidding is tested
// against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
//
// Most functions take the `tx` of one database transaction: the bidding rules lock the requirement row with a
// guarded update first, then read and write everything else in the same transaction, so two vendors bidding at
// the same instant are handled one after the other.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/repositories/transaction";

const BID_RANK_SELECT = { id: true, vendorId: true, totalPrice: true, priceSetAt: true } as const;

// ------------------------------------------------------------------ requirements
export function insertRequirement(data: Prisma.RequirementUncheckedCreateInput) {
  return prisma.requirement.create({ data, select: { id: true, reqSeq: true } });
}

/** Moves OPEN to CLOSED once the deadline has passed. Returns how many rows changed. */
export async function closeRequirementIfExpired(requirementId: string, now: Date): Promise<number> {
  const result = await prisma.requirement.updateMany({
    where: { id: requirementId, status: "OPEN", closesAt: { lte: now } },
    data: { status: "CLOSED" },
  });
  return result.count;
}

export function findRequirement(tx: Tx, requirementId: string) {
  return tx.requirement.findUnique({ where: { id: requirementId } });
}

/** Locks an open requirement whose deadline has not passed (a guarded no-op update). Returns rows matched. */
export async function lockOpenRequirement(tx: Tx, requirementId: string, now: Date): Promise<number> {
  const locked = await tx.requirement.updateMany({
    where: { id: requirementId, status: "OPEN", closesAt: { gt: now } },
    data: { updatedAt: now },
  });
  return locked.count;
}

/** Same lock, for sealed tenders only (an auction bid cannot be withdrawn). */
export async function lockOpenTender(tx: Tx, requirementId: string, now: Date): Promise<number> {
  const locked = await tx.requirement.updateMany({
    where: { id: requirementId, status: "OPEN", closesAt: { gt: now }, type: "TENDER" },
    data: { updatedAt: now },
  });
  return locked.count;
}

export function findRequirementType(tx: Tx, requirementId: string) {
  return tx.requirement.findUnique({ where: { id: requirementId }, select: { type: true } });
}

export function extendRequirementClosing(tx: Tx, requirementId: string, closesAt: Date) {
  return tx.requirement.update({ where: { id: requirementId }, data: { closesAt } });
}

/** Marks a requirement awarded, only while it is still the buyer's, open or closed, and past its deadline. */
export async function markRequirementAwarded(
  tx: Tx,
  input: { requirementId: string; buyerId: string; bidId: string; now: Date },
): Promise<number> {
  const moved = await tx.requirement.updateMany({
    where: {
      id: input.requirementId,
      buyerId: input.buyerId,
      status: { in: ["OPEN", "CLOSED"] },
      closesAt: { lte: input.now },
    },
    data: { status: "AWARDED", awardedBidId: input.bidId },
  });
  return moved.count;
}

/** Cancels a requirement, only while it is the buyer's and not yet awarded or cancelled. */
export async function cancelOpenRequirement(
  tx: Tx,
  input: { requirementId: string; buyerId: string; reason: string },
): Promise<number> {
  const moved = await tx.requirement.updateMany({
    where: {
      id: input.requirementId,
      buyerId: input.buyerId,
      status: { in: ["OPEN", "CLOSED"] },
    },
    data: { status: "CANCELLED", cancelledReason: input.reason },
  });
  return moved.count;
}

export function findRequirementOwnerAndStatus(tx: Tx, requirementId: string) {
  return tx.requirement.findUnique({
    where: { id: requirementId },
    select: { buyerId: true, status: true },
  });
}

export function getRequirementHeader(tx: Tx, requirementId: string) {
  return tx.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    select: { reqSeq: true, title: true },
  });
}

// ------------------------------------------------------------------ bids
export function findVendorBid(tx: Tx, requirementId: string, vendorId: string) {
  return tx.bid.findUnique({
    where: { requirementId_vendorId: { requirementId, vendorId } },
  });
}

/** Every bid that still counts (not withdrawn), with just what ranking needs. */
export function findRankableBids(tx: Tx, requirementId: string) {
  return tx.bid.findMany({
    where: { requirementId, status: { not: "WITHDRAWN" } },
    select: BID_RANK_SELECT,
  });
}

export function updateBid(tx: Tx, bidId: string, data: Prisma.BidUncheckedUpdateInput) {
  return tx.bid.update({ where: { id: bidId }, data });
}

export function createBid(tx: Tx, data: Prisma.BidUncheckedCreateInput) {
  return tx.bid.create({ data });
}

/** Append-only history: every submit and every revision. */
export function createBidRevision(tx: Tx, data: Prisma.BidRevisionUncheckedCreateInput) {
  return tx.bidRevision.create({ data });
}

export function findVendorUserId(tx: Tx, vendorProfileId: string) {
  return tx.vendorProfile.findUnique({ where: { id: vendorProfileId }, select: { userId: true } });
}

/** Withdraws the vendor's active bid. Returns how many rows changed. */
export async function withdrawActiveBid(
  tx: Tx,
  requirementId: string,
  vendorId: string,
): Promise<number> {
  const result = await tx.bid.updateMany({
    where: { requirementId, vendorId, status: "ACTIVE" },
    data: { status: "WITHDRAWN" },
  });
  return result.count;
}

export function findBidForAward(tx: Tx, bidId: string, requirementId: string) {
  return tx.bid.findFirst({
    where: { id: bidId, requirementId },
    select: { id: true, status: true, totalPrice: true, vendor: { select: { userId: true } } },
  });
}

export function acceptBid(tx: Tx, bidId: string) {
  return tx.bid.update({ where: { id: bidId }, data: { status: "ACCEPTED" } });
}

/** The other active bids on a requirement, with their vendors' user ids. */
export function findOtherActiveBids(tx: Tx, requirementId: string, exceptBidId: string) {
  return tx.bid.findMany({
    where: { requirementId, status: "ACTIVE", id: { not: exceptBidId } },
    select: { id: true, vendor: { select: { userId: true } } },
  });
}

export function findActiveBidders(tx: Tx, requirementId: string) {
  return tx.bid.findMany({
    where: { requirementId, status: "ACTIVE" },
    select: { id: true, vendor: { select: { userId: true } } },
  });
}

export function rejectBids(tx: Tx, bidIds: string[]) {
  return tx.bid.updateMany({ where: { id: { in: bidIds } }, data: { status: "REJECTED" } });
}

// ------------------------------------------------------------------ paying for an awarded bid
export function findRequirementForClaim(requirementId: string) {
  return prisma.requirement.findUnique({
    where: { id: requirementId },
    include: {
      awardedBid: {
        select: { id: true, unitPrice: true, vendorId: true, vendor: { select: { userId: true } } },
      },
    },
  });
}

/** Records the checkout on the requirement only if it is still awarded and unpaid. Returns rows changed. */
export async function claimRequirementCheckout(
  tx: Tx,
  input: { requirementId: string; buyerId: string; checkoutId: string },
): Promise<number> {
  const claimed = await tx.requirement.updateMany({
    where: {
      id: input.requirementId,
      buyerId: input.buyerId,
      status: "AWARDED",
      checkoutId: null,
    },
    data: { checkoutId: input.checkoutId },
  });
  return claimed.count;
}
