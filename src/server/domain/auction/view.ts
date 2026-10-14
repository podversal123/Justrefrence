import {
  minimumNextBid,
  reserveState,
  type AuctionLike,
  type AuctionStatus,
} from "@/server/domain/auction/rules";

/**
 * What each viewer may see of a forward auction — kept pure so every case is
 * unit-tested (tests/unit/auction-view.test.ts). The page and the live-polling
 * API both call buildAuctionView(); nothing else decides what a viewer sees.
 *
 *   Everyone     current top price, number of bids, bid history under
 *                anonymous labels ("Bidder 1"), and only whether the
 *                reserve has been reached (never the reserve amount).
 *   The seller   the same, plus the reserve amount they set themselves.
 *   Staff        everything, with real bidder names.
 *   A bidder     is told when they are leading and what the next bid must be.
 */

export interface AuctionBidRow {
  id: string;
  bidderId: string;
  bidderName: string;
  unitPrice: bigint;
  totalPrice: bigint;
  createdAt: Date;
}

export interface AuctionViewer {
  userId: string | null;
  isStaff: boolean;
}

export interface VisibleAuctionBid {
  bidderLabel: string;
  unitPrice: bigint;
  totalPrice: bigint;
  createdAt: Date;
  isMine: boolean;
}

export interface AuctionViewModel {
  status: AuctionStatus;
  isSeller: boolean;
  isStaff: boolean;
  bidCount: number;
  topUnitPrice: bigint | null;
  topTotal: bigint | null;
  /** The lowest unit price the next bid may be, while bidding is open. */
  minimumBid: bigint | null;
  reserve: "NONE" | "NOT_MET" | "MET";
  /** Only the seller and staff ever receive the reserve amount. */
  reservePrice: bigint | null;
  isLeading: boolean;
  isWinner: boolean;
  /** Newest first. */
  bids: VisibleAuctionBid[];
}

export const MAX_VISIBLE_BIDS = 30;

export function buildAuctionView(input: {
  auction: Pick<AuctionLike, "status" | "startPrice" | "reservePrice" | "minIncrement"> & {
    sellerUserId: string;
    winnerUserId: string | null;
  };
  bids: AuctionBidRow[];
  viewer: AuctionViewer;
  now: Date;
}): AuctionViewModel {
  const { auction, bids, viewer } = input;
  const isSeller = viewer.userId !== null && viewer.userId === auction.sellerUserId;
  const open = auction.status === "OPEN";

  // Each bidder keeps one stable label, numbered by who bid first.
  const firstSeen = new Map<string, number>();
  for (const bid of [...bids].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!firstSeen.has(bid.bidderId)) firstSeen.set(bid.bidderId, firstSeen.size + 1);
  }

  const newestFirst = [...bids].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
  );
  const top = bids.reduce<AuctionBidRow | null>(
    (best, bid) => (best === null || bid.unitPrice > best.unitPrice ? bid : best),
    null,
  );

  return {
    status: auction.status,
    isSeller,
    isStaff: viewer.isStaff,
    bidCount: bids.length,
    topUnitPrice: top?.unitPrice ?? null,
    topTotal: top?.totalPrice ?? null,
    minimumBid: open ? minimumNextBid(auction, top?.unitPrice ?? null) : null,
    reserve: reserveState(auction, top?.unitPrice ?? null),
    reservePrice: isSeller || viewer.isStaff ? auction.reservePrice : null,
    isLeading: open && viewer.userId !== null && top?.bidderId === viewer.userId,
    isWinner:
      auction.status === "SOLD" && viewer.userId !== null && auction.winnerUserId === viewer.userId,
    bids: newestFirst.slice(0, MAX_VISIBLE_BIDS).map((bid) => ({
      bidderLabel: viewer.isStaff ? bid.bidderName : `Bidder ${firstSeen.get(bid.bidderId)}`,
      unitPrice: bid.unitPrice,
      totalPrice: bid.totalPrice,
      createdAt: bid.createdAt,
      isMine: viewer.userId !== null && bid.bidderId === viewer.userId,
    })),
  };
}

/** JSON-safe live snapshot (BigInt prices as strings) shared by the polling API and the first paint. */
export function toAuctionSnapshot(auction: { closesAt: Date }, view: AuctionViewModel, now: Date) {
  return {
    status: view.status,
    closesAt: auction.closesAt.toISOString(),
    serverNow: now.toISOString(),
    bidCount: view.bidCount,
    topUnitPrice: view.topUnitPrice?.toString() ?? null,
    topTotal: view.topTotal?.toString() ?? null,
    minimumBid: view.minimumBid?.toString() ?? null,
    reserve: view.reserve,
    isLeading: view.isLeading,
    isWinner: view.isWinner,
  };
}

export type AuctionSnapshot = ReturnType<typeof toAuctionSnapshot>;
