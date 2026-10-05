import { describe, expect, it } from "vitest";
import {
  buildRequirementView,
  type BidRow,
  type ViewerContext,
} from "@/server/domain/bidding/view";

const NOW = new Date("2026-10-10T10:00:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const BUYER = "buyer-user";
const STRANGER: ViewerContext = { userId: "someone-else", vendorProfileId: null, isStaff: false };
const OWNER: ViewerContext = { userId: BUYER, vendorProfileId: null, isStaff: false };
const STAFF: ViewerContext = { userId: "staff-user", vendorProfileId: null, isStaff: true };
const vendorViewer = (vendorProfileId: string): ViewerContext => ({
  userId: `u-${vendorProfileId}`,
  vendorProfileId,
  isStaff: false,
});

function bid(id: string, vendorId: string, total: number, overrides: Partial<BidRow> = {}): BidRow {
  return {
    id,
    vendorId,
    vendorName: `Vendor ${vendorId.toUpperCase()}`,
    unitPrice: BigInt(total),
    totalPrice: BigInt(total),
    deliveryDays: 7,
    note: null,
    status: "ACTIVE",
    priceSetAt: at(-30),
    createdAt: at(-60),
    ...overrides,
  };
}

const bids = [
  bid("b1", "a", 300, { createdAt: at(-50) }),
  bid("b2", "b", 100, { createdAt: at(-40) }),
  bid("b3", "c", 200, { createdAt: at(-30) }),
  bid("b4", "d", 50, { status: "WITHDRAWN" }),
];

const open = (type: "TENDER" | "REVERSE_AUCTION") => ({
  type,
  status: "OPEN" as const,
  closesAt: at(30),
  buyerId: BUYER,
});
const closed = (
  type: "TENDER" | "REVERSE_AUCTION",
  status: "OPEN" | "CLOSED" | "AWARDED" = "CLOSED",
) => ({ type, status, closesAt: at(-5), buyerId: BUYER });

describe("withdrawn bids", () => {
  it("never count and never rank", () => {
    const view = buildRequirementView({
      requirement: closed("TENDER"),
      bids,
      viewer: STAFF,
      now: NOW,
    });
    expect(view.bidCount).toBe(3);
    expect(view.visibleBids.map((b) => b.rank)).toEqual([1, 2, 3]);
    expect(view.l1Total).toBe(100n);
  });
});

describe("sealed TENDER", () => {
  it("while open: the buyer sees only the count — no prices, no names, no bid ids", () => {
    const view = buildRequirementView({
      requirement: open("TENDER"),
      bids,
      viewer: OWNER,
      now: NOW,
    });
    expect(view.listMode).toBe("COUNT_ONLY");
    expect(view.bidCount).toBe(3);
    expect(view.visibleBids).toEqual([]);
    expect(view.l1Total).toBeNull();
  });
  it("while open: a vendor sees only their own bid, with no rank and no L1", () => {
    const view = buildRequirementView({
      requirement: open("TENDER"),
      bids,
      viewer: vendorViewer("a"),
      now: NOW,
    });
    expect(view.myBid?.totalPrice).toBe(300n);
    expect(view.myBid?.rank).toBeNull();
    expect(view.l1Total).toBeNull();
    expect(view.visibleBids).toEqual([]);
  });
  it("after the deadline: the buyer sees every bid ranked, with names and the ids needed to award", () => {
    const view = buildRequirementView({
      requirement: closed("TENDER"),
      bids,
      viewer: OWNER,
      now: NOW,
    });
    expect(view.listMode).toBe("ALL");
    expect(view.visibleBids.map((b) => [b.rank, b.bidderLabel, b.bidId])).toEqual([
      [1, "Vendor B", "b2"],
      [2, "Vendor C", "b3"],
      [3, "Vendor A", "b1"],
    ]);
  });
  it("after the deadline: a vendor learns only their own rank, never rivals' prices", () => {
    const view = buildRequirementView({
      requirement: closed("TENDER"),
      bids,
      viewer: vendorViewer("a"),
      now: NOW,
    });
    expect(view.myBid?.rank).toBe(3);
    expect(view.visibleBids).toEqual([]);
    expect(view.l1Total).toBeNull();
  });
  it("once awarded, a participating vendor can see the winning total", () => {
    const view = buildRequirementView({
      requirement: closed("TENDER", "AWARDED"),
      bids,
      viewer: vendorViewer("a"),
      now: NOW,
    });
    expect(view.l1Total).toBe(100n);
  });
});

describe("live REVERSE_AUCTION", () => {
  it("the buyer sees a live ranking but bidders are anonymous and bid ids are withheld", () => {
    const view = buildRequirementView({
      requirement: open("REVERSE_AUCTION"),
      bids,
      viewer: OWNER,
      now: NOW,
    });
    expect(view.listMode).toBe("ANONYMOUS_LIVE");
    expect(view.visibleBids.map((b) => b.rank)).toEqual([1, 2, 3]);
    for (const row of view.visibleBids) {
      expect(row.bidderLabel).toMatch(/^Bidder \d$/);
      expect(row.bidderLabel).not.toContain("Vendor");
      expect(row.bidId).toBeNull();
    }
    expect(view.l1Total).toBe(100n);
  });
  it("anonymous labels follow bid CREATION order, so they don't shift as prices move", () => {
    const view = buildRequirementView({
      requirement: open("REVERSE_AUCTION"),
      bids,
      viewer: OWNER,
      now: NOW,
    });
    // a was first (Bidder 1) but is last-ranked now; b was second (Bidder 2) and leads.
    expect(view.visibleBids.map((b) => b.bidderLabel)).toEqual([
      "Bidder 2",
      "Bidder 3",
      "Bidder 1",
    ]);
  });
  it("a participating vendor sees their live rank and the current L1 price", () => {
    const view = buildRequirementView({
      requirement: open("REVERSE_AUCTION"),
      bids,
      viewer: vendorViewer("c"),
      now: NOW,
    });
    expect(view.myBid?.rank).toBe(2);
    expect(view.l1Total).toBe(100n);
    expect(view.visibleBids).toEqual([]); // but not the rivals' rows
  });
  it("a vendor who has not bid learns nothing about prices", () => {
    const view = buildRequirementView({
      requirement: open("REVERSE_AUCTION"),
      bids,
      viewer: vendorViewer("zzz"),
      now: NOW,
    });
    expect(view.myBid).toBeNull();
    expect(view.l1Total).toBeNull();
    expect(view.bidCount).toBe(3);
  });
  it("after the auction closes, the buyer sees real names and can act on bids", () => {
    const view = buildRequirementView({
      requirement: closed("REVERSE_AUCTION"),
      bids,
      viewer: OWNER,
      now: NOW,
    });
    expect(view.visibleBids[0]).toMatchObject({ bidderLabel: "Vendor B", bidId: "b2" });
  });
});

describe("staff and strangers", () => {
  it("staff always see names and prices (even live), but never get action ids", () => {
    const view = buildRequirementView({
      requirement: open("TENDER"),
      bids,
      viewer: STAFF,
      now: NOW,
    });
    expect(view.listMode).toBe("ALL");
    expect(view.visibleBids[0]).toMatchObject({
      bidderLabel: "Vendor B",
      totalPrice: 100n,
      bidId: null,
    });
  });
  it("anyone else sees only how many bids there are", () => {
    for (const type of ["TENDER", "REVERSE_AUCTION"] as const) {
      const view = buildRequirementView({
        requirement: open(type),
        bids,
        viewer: STRANGER,
        now: NOW,
      });
      expect(view).toMatchObject({ bidCount: 3, listMode: "NONE", l1Total: null, myBid: null });
      expect(view.visibleBids).toEqual([]);
    }
  });
  it("an anonymous (signed-out) visitor is treated the same", () => {
    const view = buildRequirementView({
      requirement: open("REVERSE_AUCTION"),
      bids,
      viewer: { userId: null, vendorProfileId: null, isStaff: false },
      now: NOW,
    });
    expect(view.l1Total).toBeNull();
    expect(view.listMode).toBe("NONE");
  });
});

describe("status", () => {
  it("reports the EFFECTIVE status (an OPEN row past its deadline reads as CLOSED)", () => {
    expect(
      buildRequirementView({
        requirement: closed("TENDER", "OPEN"),
        bids,
        viewer: STRANGER,
        now: NOW,
      }).status,
    ).toBe("CLOSED");
  });
  it("marks the viewer's own row", () => {
    const view = buildRequirementView({
      requirement: closed("TENDER"),
      bids,
      viewer: { userId: BUYER, vendorProfileId: "a", isStaff: false },
      now: NOW,
    });
    expect(view.visibleBids.filter((b) => b.isMine).map((b) => b.bidId)).toEqual(["b1"]);
  });
});
