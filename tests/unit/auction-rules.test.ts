import { describe, expect, it } from "vitest";
import {
  canCancel,
  canClaim,
  checkBid,
  decideOutcome,
  formatAuctionNumber,
  hasEnded,
  isAcceptingBids,
  minimumNextBid,
  nextClosesAt,
  reserveState,
  totalFor,
  type AuctionLike,
} from "@/server/domain/auction/rules";

const NOW = new Date("2026-10-14T10:00:00Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

function auction(overrides: Partial<AuctionLike> = {}): AuctionLike {
  return {
    status: "OPEN",
    closesAt: later(60),
    quantity: 10,
    startPrice: 1000n,
    reservePrice: null,
    minIncrement: 50n,
    autoExtendMinutes: 0,
    ...overrides,
  };
}

describe("auction status", () => {
  it("accepts bids only while OPEN and before the deadline", () => {
    expect(isAcceptingBids(auction(), NOW)).toBe(true);
    expect(isAcceptingBids(auction({ closesAt: NOW }), NOW)).toBe(false);
    expect(isAcceptingBids(auction({ status: "CANCELLED" }), NOW)).toBe(false);
  });

  it("treats an OPEN auction past its deadline as ended", () => {
    expect(hasEnded(auction({ closesAt: later(-1) }), NOW)).toBe(true);
    expect(hasEnded(auction(), NOW)).toBe(false);
    expect(hasEnded(auction({ status: "SOLD", closesAt: later(-1) }), NOW)).toBe(false);
  });
});

describe("minimumNextBid", () => {
  it("is the start price before any bid", () => {
    expect(minimumNextBid(auction(), null)).toBe(1000n);
  });
  it("is the top bid plus the increment after a bid", () => {
    expect(minimumNextBid(auction(), 1200n)).toBe(1250n);
  });
  it("still requires a strictly higher bid when the increment is zero", () => {
    expect(minimumNextBid(auction({ minIncrement: 0n }), 1200n)).toBe(1201n);
  });
});

describe("checkBid", () => {
  const base = { auction: auction(), top: null, bidderId: "u1", isSeller: false, now: NOW };

  it("accepts a first bid at the start price", () => {
    expect(checkBid({ ...base, unitPrice: 1000n })).toBeNull();
  });
  it("rejects a first bid below the start price", () => {
    expect(checkBid({ ...base, unitPrice: 999n })?.code).toBe("BID_TOO_LOW");
  });
  it("requires the minimum increment over the top bid", () => {
    const top = { unitPrice: 1200n, bidderId: "u2" };
    expect(checkBid({ ...base, top, unitPrice: 1249n })?.code).toBe("BID_TOO_LOW");
    expect(checkBid({ ...base, top, unitPrice: 1250n })).toBeNull();
  });
  it("rejects bidding after the deadline", () => {
    const ended = auction({ closesAt: later(-1) });
    expect(checkBid({ ...base, auction: ended, unitPrice: 5000n })?.code).toBe("NOT_OPEN");
  });
  it("rejects the seller", () => {
    expect(checkBid({ ...base, isSeller: true, unitPrice: 5000n })?.code).toBe("OWN_AUCTION");
  });
  it("rejects a bidder who is already leading", () => {
    const top = { unitPrice: 1200n, bidderId: "u1" };
    expect(checkBid({ ...base, top, unitPrice: 5000n })?.code).toBe("ALREADY_LEADING");
  });
});

describe("nextClosesAt", () => {
  it("never moves the deadline when auto-extend is off", () => {
    const a = auction({ closesAt: later(1), autoExtendMinutes: 0 });
    expect(nextClosesAt(a, NOW)).toEqual(a.closesAt);
  });
  it("does not extend a bid outside the window", () => {
    const a = auction({ closesAt: later(30), autoExtendMinutes: 5 });
    expect(nextClosesAt(a, NOW)).toEqual(a.closesAt);
  });
  it("extends a bid inside the window to now + window", () => {
    const a = auction({ closesAt: later(2), autoExtendMinutes: 5 });
    expect(nextClosesAt(a, NOW)).toEqual(later(5));
  });
  it("never shortens", () => {
    const a = auction({ closesAt: later(5), autoExtendMinutes: 5 });
    expect(nextClosesAt(a, NOW)).toEqual(later(5));
  });
});

describe("outcome and reserve", () => {
  it("is unsold with no bids", () => {
    expect(decideOutcome({ reservePrice: null }, null)).toBe("UNSOLD");
  });
  it("is sold to the top bid when there is no reserve", () => {
    expect(decideOutcome({ reservePrice: null }, 1000n)).toBe("SOLD");
  });
  it("is unsold when the top bid is below the reserve", () => {
    expect(decideOutcome({ reservePrice: 2000n }, 1999n)).toBe("UNSOLD");
  });
  it("is sold when the top bid equals the reserve", () => {
    expect(decideOutcome({ reservePrice: 2000n }, 2000n)).toBe("SOLD");
  });
  it("reveals only whether the reserve is met", () => {
    expect(reserveState({ reservePrice: null }, 500n)).toBe("NONE");
    expect(reserveState({ reservePrice: 2000n }, null)).toBe("NOT_MET");
    expect(reserveState({ reservePrice: 2000n }, 1999n)).toBe("NOT_MET");
    expect(reserveState({ reservePrice: 2000n }, 2000n)).toBe("MET");
  });
});

describe("claim and cancel", () => {
  it("lets the winner pay only on an unpaid sale", () => {
    expect(canClaim({ status: "SOLD", checkoutId: null })).toBe(true);
    expect(canClaim({ status: "SOLD", checkoutId: "c1" })).toBe(false);
    expect(canClaim({ status: "UNSOLD", checkoutId: null })).toBe(false);
    expect(canClaim({ status: "OPEN", checkoutId: null })).toBe(false);
  });
  it("lets the vendor cancel before any bid", () => {
    expect(canCancel({ status: "OPEN", checkoutId: null }, 0).ok).toBe(true);
    expect(canCancel({ status: "OPEN", checkoutId: null }, 2).ok).toBe(false);
  });
  it("lets the vendor cancel an unpaid sale but not a paid one", () => {
    expect(canCancel({ status: "SOLD", checkoutId: null }, 3).ok).toBe(true);
    expect(canCancel({ status: "SOLD", checkoutId: "c1" }, 3).ok).toBe(false);
  });
  it("refuses a second cancel or an ended unsold auction", () => {
    expect(canCancel({ status: "CANCELLED", checkoutId: null }, 0).ok).toBe(false);
    expect(canCancel({ status: "UNSOLD", checkoutId: null }, 0).ok).toBe(false);
  });
});

describe("formatting and totals", () => {
  it("pads the auction number", () => {
    expect(formatAuctionNumber(12n)).toBe("AUC-000012");
  });
  it("multiplies in exact paise", () => {
    expect(totalFor(150050n, 3)).toBe(450150n);
  });
});
