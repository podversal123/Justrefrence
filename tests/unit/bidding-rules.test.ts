import { describe, expect, it } from "vitest";
import {
  buyerCanSeeBids,
  canAward,
  checkBid,
  effectiveStatus,
  formatRank,
  formatRequirementNumber,
  isAcceptingBids,
  nextClosesAt,
  rankBids,
  totalFor,
  type RequirementLike,
} from "@/server/domain/bidding/rules";

const NOW = new Date("2026-10-10T10:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

function requirement(overrides: Partial<RequirementLike> = {}): RequirementLike {
  return {
    type: "TENDER",
    status: "OPEN",
    closesAt: minutes(60),
    quantity: 10,
    minDecrement: 0n,
    autoExtendMinutes: 0,
    estimatedValue: null,
    ...overrides,
  };
}

describe("effectiveStatus / isAcceptingBids", () => {
  it("is OPEN before the deadline and CLOSED from the deadline on, even if the row still says OPEN", () => {
    expect(effectiveStatus({ status: "OPEN", closesAt: minutes(1) }, NOW)).toBe("OPEN");
    expect(effectiveStatus({ status: "OPEN", closesAt: NOW }, NOW)).toBe("CLOSED");
    expect(effectiveStatus({ status: "OPEN", closesAt: minutes(-5) }, NOW)).toBe("CLOSED");
  });
  it("never reopens a finished requirement", () => {
    expect(effectiveStatus({ status: "AWARDED", closesAt: minutes(60) }, NOW)).toBe("AWARDED");
    expect(effectiveStatus({ status: "CANCELLED", closesAt: minutes(60) }, NOW)).toBe("CANCELLED");
    expect(isAcceptingBids({ status: "CANCELLED", closesAt: minutes(60) }, NOW)).toBe(false);
  });
});

describe("totals and labels", () => {
  it("computes the total from integer paise exactly", () => {
    expect(totalFor(12_345n, 7)).toBe(86_415n);
    expect(totalFor(99_999_999_999n, 1000)).toBe(99_999_999_999_000n);
  });
  it("formats the requirement number and rank", () => {
    expect(formatRequirementNumber(42n)).toBe("REQ-000042");
    expect(formatRank(1)).toBe("L1");
  });
});

describe("rankBids", () => {
  const bid = (id: string, total: bigint, at: number) => ({
    id,
    totalPrice: total,
    priceSetAt: minutes(at),
  });

  it("ranks by lowest total, L1 first", () => {
    const ranked = rankBids([bid("a", 300n, 0), bid("b", 100n, 1), bid("c", 200n, 2)]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });
  it("breaks a price tie in favour of whoever set that price first, then by id", () => {
    const ranked = rankBids([
      bid("late", 100n, 5),
      bid("early", 100n, 1),
      bid("same-time-b", 100n, 9),
      bid("same-time-a", 100n, 9),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["early", "late", "same-time-a", "same-time-b"]);
  });
  it("does not mutate its input", () => {
    const input = [bid("a", 2n, 0), bid("b", 1n, 0)];
    rankBids(input);
    expect(input.map((b) => b.id)).toEqual(["a", "b"]);
  });
});

describe("checkBid — common rules", () => {
  it("rejects bids once the deadline has passed", () => {
    const violation = checkBid({
      requirement: requirement({ closesAt: minutes(-1) }),
      unitPrice: 100n,
      deliveryDays: 5,
      now: NOW,
    });
    expect(violation?.code).toBe("NOT_OPEN");
  });
  it("rejects a zero/negative price and an out-of-range delivery time", () => {
    expect(
      checkBid({ requirement: requirement(), unitPrice: 0n, deliveryDays: 5, now: NOW })?.code,
    ).toBe("INVALID_PRICE");
    expect(
      checkBid({ requirement: requirement(), unitPrice: -5n, deliveryDays: 5, now: NOW })?.code,
    ).toBe("INVALID_PRICE");
    expect(
      checkBid({ requirement: requirement(), unitPrice: 100n, deliveryDays: 0, now: NOW })?.code,
    ).toBe("INVALID_DELIVERY");
    expect(
      checkBid({ requirement: requirement(), unitPrice: 100n, deliveryDays: 366, now: NOW })?.code,
    ).toBe("INVALID_DELIVERY");
    expect(
      checkBid({ requirement: requirement(), unitPrice: 100n, deliveryDays: 2.5, now: NOW })?.code,
    ).toBe("INVALID_DELIVERY");
  });
  it("enforces the maximum budget on the TOTAL (unit x quantity)", () => {
    const req = requirement({ quantity: 10, estimatedValue: 1_000n });
    expect(checkBid({ requirement: req, unitPrice: 100n, deliveryDays: 5, now: NOW })).toBeNull(); // 1000 == budget
    expect(checkBid({ requirement: req, unitPrice: 101n, deliveryDays: 5, now: NOW })?.code).toBe(
      "ABOVE_BUDGET",
    );
  });
  it("accepts a normal first bid", () => {
    expect(
      checkBid({ requirement: requirement(), unitPrice: 100n, deliveryDays: 7, now: NOW }),
    ).toBeNull();
  });
});

describe("checkBid — tender revisions", () => {
  const existing = { unitPrice: 100n, deliveryDays: 7 };
  it("lets a vendor revise in either direction before the deadline", () => {
    expect(
      checkBid({ requirement: requirement(), unitPrice: 90n, deliveryDays: 7, existing, now: NOW }),
    ).toBeNull();
    expect(
      checkBid({
        requirement: requirement(),
        unitPrice: 130n,
        deliveryDays: 7,
        existing,
        now: NOW,
      }),
    ).toBeNull();
  });
  it("refuses a revision that changes nothing", () => {
    expect(
      checkBid({ requirement: requirement(), unitPrice: 100n, deliveryDays: 7, existing, now: NOW })
        ?.code,
    ).toBe("NO_CHANGE");
  });
});

describe("checkBid — reverse auction", () => {
  const auction = requirement({ type: "REVERSE_AUCTION", minDecrement: 5n });
  const existing = { unitPrice: 100n, deliveryDays: 7 };

  it("only accepts a LOWER price", () => {
    expect(
      checkBid({ requirement: auction, unitPrice: 100n, deliveryDays: 5, existing, now: NOW })
        ?.code,
    ).toBe("PRICE_NOT_LOWER");
    expect(
      checkBid({ requirement: auction, unitPrice: 120n, deliveryDays: 7, existing, now: NOW })
        ?.code,
    ).toBe("PRICE_NOT_LOWER");
  });
  it("requires the minimum decrement", () => {
    expect(
      checkBid({ requirement: auction, unitPrice: 97n, deliveryDays: 7, existing, now: NOW })?.code,
    ).toBe("DECREMENT_TOO_SMALL");
    expect(
      checkBid({ requirement: auction, unitPrice: 95n, deliveryDays: 7, existing, now: NOW }),
    ).toBeNull();
  });
  it("with no minimum decrement, any strictly lower price works", () => {
    const free = requirement({ type: "REVERSE_AUCTION", minDecrement: 0n });
    expect(
      checkBid({ requirement: free, unitPrice: 99n, deliveryDays: 7, existing, now: NOW }),
    ).toBeNull();
  });
  it("a first bid has no decrement to satisfy", () => {
    expect(
      checkBid({ requirement: auction, unitPrice: 500n, deliveryDays: 7, now: NOW }),
    ).toBeNull();
  });
});

describe("nextClosesAt (anti-sniping)", () => {
  const auction = (autoExtendMinutes: number, closesInMin: number) => ({
    type: "REVERSE_AUCTION" as const,
    autoExtendMinutes,
    closesAt: minutes(closesInMin),
  });

  it("extends to now + N minutes when a bid lands inside the last N minutes", () => {
    expect(nextClosesAt(auction(5, 2), NOW).getTime()).toBe(minutes(5).getTime());
    expect(nextClosesAt(auction(5, 5), NOW).getTime()).toBe(
      minutes(5).getTime() > minutes(5).getTime() ? minutes(5).getTime() : minutes(5).getTime(),
    );
  });
  it("leaves the close time alone outside the window, when off, and for tenders", () => {
    expect(nextClosesAt(auction(5, 30), NOW).getTime()).toBe(minutes(30).getTime());
    expect(nextClosesAt(auction(0, 1), NOW).getTime()).toBe(minutes(1).getTime());
    expect(
      nextClosesAt({ type: "TENDER", autoExtendMinutes: 5, closesAt: minutes(1) }, NOW).getTime(),
    ).toBe(minutes(1).getTime());
  });
  it("never shortens the auction", () => {
    // 10-minute window, closes in 8 minutes -> extended to +10, which is later, fine; closes in 10 -> stays at +10.
    expect(nextClosesAt(auction(10, 8), NOW).getTime()).toBe(minutes(10).getTime());
    expect(nextClosesAt(auction(10, 10), NOW).getTime()).toBe(minutes(10).getTime());
  });
});

describe("buyerCanSeeBids", () => {
  it("tender: only the count while open; everything after", () => {
    expect(buyerCanSeeBids({ type: "TENDER", status: "OPEN", closesAt: minutes(10) }, NOW)).toBe(
      "COUNT_ONLY",
    );
    expect(buyerCanSeeBids({ type: "TENDER", status: "OPEN", closesAt: minutes(-1) }, NOW)).toBe(
      "ALL",
    );
  });
  it("auction: anonymous live ranking while open; everything after", () => {
    expect(
      buyerCanSeeBids({ type: "REVERSE_AUCTION", status: "OPEN", closesAt: minutes(10) }, NOW),
    ).toBe("ANONYMOUS_LIVE");
    expect(
      buyerCanSeeBids({ type: "REVERSE_AUCTION", status: "CLOSED", closesAt: minutes(-1) }, NOW),
    ).toBe("ALL");
  });
});

describe("canAward", () => {
  it("only after bidding closes, and only to an ACTIVE bid", () => {
    expect(canAward({ status: "OPEN", closesAt: minutes(5) }, "ACTIVE", NOW).ok).toBe(false);
    expect(canAward({ status: "OPEN", closesAt: minutes(-1) }, "ACTIVE", NOW).ok).toBe(true);
    expect(canAward({ status: "CLOSED", closesAt: minutes(-1) }, "WITHDRAWN", NOW).ok).toBe(false);
    expect(canAward({ status: "CLOSED", closesAt: minutes(-1) }, "REJECTED", NOW).ok).toBe(false);
  });
  it("never twice, never after cancellation", () => {
    expect(canAward({ status: "AWARDED", closesAt: minutes(-1) }, "ACTIVE", NOW).ok).toBe(false);
    expect(canAward({ status: "CANCELLED", closesAt: minutes(-1) }, "ACTIVE", NOW).ok).toBe(false);
  });
});
