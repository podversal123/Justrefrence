import { describe, expect, it } from "vitest";
import { validateCoupon, type CouponRow } from "@/server/domain/commerce/coupon";

const NOW = new Date("2026-06-15T00:00:00Z");

function coupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    code: "SAVE10",
    discountType: "PERCENT",
    valuePercentBps: 1000, // 10%
    valueFixed: null,
    minOrderAmount: 0n,
    startsAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    usageLimit: null,
    usageLimitPerMember: 1,
    deletedAt: null,
    ...overrides,
  };
}

const NO_USAGE = { globalRedemptions: 0, memberRedemptions: 0 };

describe("validateCoupon — invalid coupon scenarios", () => {
  it("rejects a soft-deleted coupon", () => {
    const result = validateCoupon(coupon({ deletedAt: new Date() }), 10000n, NO_USAGE, NOW);
    expect(result).toEqual({ valid: false, failure: "DELETED" });
  });

  it("rejects a coupon that hasn't started yet", () => {
    const result = validateCoupon(
      coupon({ startsAt: new Date("2027-01-01T00:00:00Z") }),
      10000n,
      NO_USAGE,
      NOW,
    );
    expect(result).toEqual({ valid: false, failure: "NOT_STARTED" });
  });

  it("rejects an expired coupon", () => {
    const result = validateCoupon(
      coupon({ expiresAt: new Date("2026-01-01T00:00:00Z") }),
      10000n,
      NO_USAGE,
      NOW,
    );
    expect(result).toEqual({ valid: false, failure: "EXPIRED" });
  });

  it("rejects when the cart is below the minimum order amount", () => {
    const result = validateCoupon(coupon({ minOrderAmount: 50000n }), 10000n, NO_USAGE, NOW);
    expect(result).toEqual({ valid: false, failure: "BELOW_MIN_ORDER" });
  });

  it("rejects once the global usage limit is reached", () => {
    const result = validateCoupon(
      coupon({ usageLimit: 5 }),
      10000n,
      { globalRedemptions: 5, memberRedemptions: 0 },
      NOW,
    );
    expect(result).toEqual({ valid: false, failure: "GLOBAL_LIMIT_REACHED" });
  });

  it("rejects once the per-member usage limit is reached", () => {
    const result = validateCoupon(
      coupon({ usageLimitPerMember: 1 }),
      10000n,
      { globalRedemptions: 0, memberRedemptions: 1 },
      NOW,
    );
    expect(result).toEqual({ valid: false, failure: "MEMBER_LIMIT_REACHED" });
  });
});

describe("validateCoupon — valid coupon discount calculation", () => {
  it("computes a PERCENT discount", () => {
    const result = validateCoupon(coupon({ valuePercentBps: 1000 }), 10000n, NO_USAGE, NOW);
    expect(result).toEqual({ valid: true, discount: 1000n });
  });

  it("computes a FIXED discount", () => {
    const result = validateCoupon(
      coupon({ discountType: "FIXED", valuePercentBps: null, valueFixed: 500n }),
      10000n,
      NO_USAGE,
      NOW,
    );
    expect(result).toEqual({ valid: true, discount: 500n });
  });

  it("caps a FIXED discount at the cart subtotal", () => {
    const result = validateCoupon(
      coupon({ discountType: "FIXED", valuePercentBps: null, valueFixed: 99999n }),
      1000n,
      NO_USAGE,
      NOW,
    );
    expect(result).toEqual({ valid: true, discount: 1000n });
  });

  it("allows a coupon exactly at its start instant", () => {
    const startsAt = new Date("2026-06-15T00:00:00Z");
    const result = validateCoupon(coupon({ startsAt }), 10000n, NO_USAGE, startsAt);
    expect(result.valid).toBe(true);
  });
});
