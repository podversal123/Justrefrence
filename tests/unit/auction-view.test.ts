import { describe, expect, it } from "vitest";
import {
  buildAuctionView,
  toAuctionSnapshot,
  type AuctionBidRow,
} from "@/server/domain/auction/view";

const NOW = new Date("2026-10-14T10:00:00Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const auction = {
  status: "OPEN" as const,
  startPrice: 1000n,
  reservePrice: 2000n,
  minIncrement: 50n,
  sellerUserId: "seller",
  winnerUserId: null as string | null,
};

function bid(id: string, bidderId: string, unitPrice: bigint, minutes: number): AuctionBidRow {
  return {
    id,
    bidderId,
    bidderName: `Name of ${bidderId}`,
    unitPrice,
    totalPrice: unitPrice * 10n,
    createdAt: at(minutes),
  };
}

const bids = [bid("b1", "ann", 1000n, 1), bid("b2", "raj", 1100n, 2), bid("b3", "ann", 1200n, 3)];

describe("buildAuctionView", () => {
  it("shows the top price, bid count and next minimum to anyone", () => {
    const view = buildAuctionView({
      auction,
      bids,
      viewer: { userId: null, isStaff: false },
      now: NOW,
    });
    expect(view.bidCount).toBe(3);
    expect(view.topUnitPrice).toBe(1200n);
    expect(view.topTotal).toBe(12000n);
    expect(view.minimumBid).toBe(1250n);
  });

  it("starts at the start price when nobody has bid", () => {
    const view = buildAuctionView({
      auction,
      bids: [],
      viewer: { userId: null, isStaff: false },
      now: NOW,
    });
    expect(view.topUnitPrice).toBeNull();
    expect(view.minimumBid).toBe(1000n);
  });

  it("hides real names and keeps one stable label per bidder", () => {
    const view = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "raj", isStaff: false },
      now: NOW,
    });
    expect(view.bids.map((b) => b.bidderLabel)).toEqual(["Bidder 1", "Bidder 2", "Bidder 1"]);
    expect(view.bids.map((b) => b.isMine)).toEqual([false, true, false]);
  });

  it("shows real names to staff only", () => {
    const view = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "admin", isStaff: true },
      now: NOW,
    });
    expect(view.bids[0]?.bidderLabel).toBe("Name of ann");
  });

  it("never reveals the reserve amount to bidders, only whether it is met", () => {
    const bidder = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "raj", isStaff: false },
      now: NOW,
    });
    expect(bidder.reservePrice).toBeNull();
    expect(bidder.reserve).toBe("NOT_MET");

    const met = buildAuctionView({
      auction,
      bids: [...bids, bid("b4", "raj", 2000n, 4)],
      viewer: { userId: "raj", isStaff: false },
      now: NOW,
    });
    expect(met.reserve).toBe("MET");
    expect(met.reservePrice).toBeNull();
  });

  it("shows the reserve amount to the seller and staff", () => {
    const seller = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "seller", isStaff: false },
      now: NOW,
    });
    expect(seller.isSeller).toBe(true);
    expect(seller.reservePrice).toBe(2000n);
    const staff = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "admin", isStaff: true },
      now: NOW,
    });
    expect(staff.reservePrice).toBe(2000n);
  });

  it("tells the leader they are leading", () => {
    const leader = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "ann", isStaff: false },
      now: NOW,
    });
    expect(leader.isLeading).toBe(true);
    const other = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "raj", isStaff: false },
      now: NOW,
    });
    expect(other.isLeading).toBe(false);
  });

  it("marks only the winner of a sold auction, and drops the minimum bid", () => {
    const sold = { ...auction, status: "SOLD" as const, winnerUserId: "ann" };
    const winner = buildAuctionView({
      auction: sold,
      bids,
      viewer: { userId: "ann", isStaff: false },
      now: NOW,
    });
    expect(winner.isWinner).toBe(true);
    expect(winner.minimumBid).toBeNull();
    expect(winner.isLeading).toBe(false);
    const loser = buildAuctionView({
      auction: sold,
      bids,
      viewer: { userId: "raj", isStaff: false },
      now: NOW,
    });
    expect(loser.isWinner).toBe(false);
  });

  it("turns into a JSON-safe snapshot", () => {
    const view = buildAuctionView({
      auction,
      bids,
      viewer: { userId: "ann", isStaff: false },
      now: NOW,
    });
    const snapshot = toAuctionSnapshot({ closesAt: at(30) }, view, NOW);
    expect(snapshot.topUnitPrice).toBe("1200");
    expect(snapshot.minimumBid).toBe("1250");
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });
});
