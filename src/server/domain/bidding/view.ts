import {
  buyerCanSeeBids,
  effectiveStatus,
  rankBids,
  type RequirementLike,
  type RequirementStatus,
} from "@/server/domain/bidding/rules";

/**
 * Who may see which bids — the privacy core of sealed tenders and live
 * auctions, kept pure so every combination is unit-tested
 * (tests/unit/bidding-view.test.ts). The page and the live-polling API both
 * call buildRequirementView(); nothing else decides what a viewer sees.
 *
 *   TENDER (sealed)   buyer: bid COUNT until the deadline, then everything.
 *                     vendors: only their own bid.
 *   REVERSE_AUCTION   buyer: live ranking with anonymous bidder labels.
 *                     vendors: their own rank + the current L1 price.
 *   Staff             always everything (audit / dispute handling).
 *   Anyone else       just the number of bids.
 */

export type StoredBidStatus = "ACTIVE" | "WITHDRAWN" | "ACCEPTED" | "REJECTED";

export interface BidRow {
  id: string;
  vendorId: string;
  vendorName: string;
  unitPrice: bigint;
  totalPrice: bigint;
  deliveryDays: number;
  note: string | null;
  status: StoredBidStatus;
  priceSetAt: Date;
  createdAt: Date;
}

export interface ViewerContext {
  userId: string | null;
  vendorProfileId: string | null;
  isStaff: boolean;
}

export interface VisibleBid {
  rank: number;
  /** Real vendor name, or "Bidder N" while identities are hidden. */
  bidderLabel: string;
  unitPrice: bigint;
  totalPrice: bigint;
  deliveryDays: number;
  status: StoredBidStatus;
  /** Present only when the viewer may act on this bid (the buyer, after close). */
  bidId: string | null;
  isMine: boolean;
}

export interface MyBidView {
  id: string;
  unitPrice: bigint;
  totalPrice: bigint;
  deliveryDays: number;
  note: string | null;
  status: StoredBidStatus;
  /** Rank among all non-withdrawn bids, shown only when the viewer is allowed to know it. */
  rank: number | null;
}

export interface RequirementViewModel {
  status: RequirementStatus;
  isOwner: boolean;
  isStaff: boolean;
  /** Non-withdrawn bids. */
  bidCount: number;
  myBid: MyBidView | null;
  /** The current lowest total, when this viewer is allowed to see it. */
  l1Total: bigint | null;
  visibleBids: VisibleBid[];
  /** "ALL" | "ANONYMOUS_LIVE" | "COUNT_ONLY" for the owner/staff; "NONE" for everyone else. */
  listMode: "ALL" | "ANONYMOUS_LIVE" | "COUNT_ONLY" | "NONE";
}

export function buildRequirementView(input: {
  requirement: Pick<RequirementLike, "type" | "status" | "closesAt"> & { buyerId: string };
  bids: BidRow[];
  viewer: ViewerContext;
  now: Date;
}): RequirementViewModel {
  const { requirement, bids, viewer, now } = input;
  const status = effectiveStatus(requirement, now);
  const isOwner = viewer.userId !== null && viewer.userId === requirement.buyerId;
  const countable = bids.filter((bid) => bid.status !== "WITHDRAWN");
  const ranked = rankBids(countable);
  const open = status === "OPEN";

  const mine = viewer.vendorProfileId
    ? bids.find((bid) => bid.vendorId === viewer.vendorProfileId)
    : undefined;
  const mineRanked = mine ? ranked.find((bid) => bid.id === mine.id) : undefined;

  // A bidder learns their rank during a live auction, and after bidding ends for any type.
  const mayKnowRank = requirement.type === "REVERSE_AUCTION" || !open;
  const myBid: MyBidView | null = mine
    ? {
        id: mine.id,
        unitPrice: mine.unitPrice,
        totalPrice: mine.totalPrice,
        deliveryDays: mine.deliveryDays,
        note: mine.note,
        status: mine.status,
        rank: mine.status !== "WITHDRAWN" && mineRanked && mayKnowRank ? mineRanked.rank : null,
      }
    : null;

  const l1 = ranked[0]?.totalPrice ?? null;

  let listMode: RequirementViewModel["listMode"] = "NONE";
  let visibleBids: VisibleBid[] = [];
  let l1Total: bigint | null = null;

  if (viewer.isStaff || isOwner) {
    listMode = viewer.isStaff ? "ALL" : buyerCanSeeBids(requirement, now);
    if (listMode === "ALL" || listMode === "ANONYMOUS_LIVE") {
      const creationOrder = [...countable].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1),
      );
      const anonymousIndex = new Map(creationOrder.map((bid, index) => [bid.id, index + 1]));
      visibleBids = ranked.map((bid) => ({
        rank: bid.rank,
        bidderLabel: listMode === "ALL" ? bid.vendorName : `Bidder ${anonymousIndex.get(bid.id)}`,
        unitPrice: bid.unitPrice,
        totalPrice: bid.totalPrice,
        deliveryDays: bid.deliveryDays,
        status: bid.status,
        // Only after bidding has ended may the buyer act on a bid; the id is never sent earlier.
        bidId: isOwner && !open ? bid.id : null,
        isMine: bid.id === mine?.id,
      }));
      l1Total = l1;
    }
  } else if (myBid && myBid.status !== "WITHDRAWN") {
    // A participating vendor: the live auction shows the current best price; a tender only reveals it once awarded.
    if (requirement.type === "REVERSE_AUCTION" || status === "AWARDED") l1Total = l1;
  }

  return {
    status,
    isOwner,
    isStaff: viewer.isStaff,
    bidCount: countable.length,
    myBid,
    l1Total,
    visibleBids,
    listMode,
  };
}
