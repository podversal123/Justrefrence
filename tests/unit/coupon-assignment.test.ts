import { describe, expect, it } from "vitest";
import { validateCoupon, type CouponRow } from "@/server/domain/commerce/coupon";

const NOW = new Date("2026-06-15T00:00:00Z");
const NO_USAGE = { globalRedemptions: 0, memberRedemptions: 0 };

function coupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    code: "RWD-ABCDEFGH",
    discountType: "FIXED",
    valuePercentBps: null,
    valueFixed: 20000n,
    minOrderAmount: 0n,
    startsAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    usageLimit: 1,
    usageLimitPerMember: 1,
    deletedAt: null,
    assignedMemberId: "member-a",
    ...overrides,
  };
}

describe("a coupon assigned to one member", () => {
  it("works for that member", () => {
    const result = validateCoupon(coupon(), 100000n, NO_USAGE, NOW, "member-a");
    expect(result).toEqual({ valid: true, discount: 20000n });
  });

  it("is reported as not found to any other member", () => {
    const result = validateCoupon(coupon(), 100000n, NO_USAGE, NOW, "member-b");
    expect(result).toEqual({ valid: false, failure: "NOT_FOUND" });
  });

  it("is reported as not found when no member is given", () => {
    expect(validateCoupon(coupon(), 100000n, NO_USAGE, NOW)).toEqual({
      valid: false,
      failure: "NOT_FOUND",
    });
  });

  it("stops working once used", () => {
    const used = { globalRedemptions: 1, memberRedemptions: 1 };
    const result = validateCoupon(coupon(), 100000n, used, NOW, "member-a");
    expect(result.valid).toBe(false);
  });
});

describe("a normal coupon", () => {
  it("is unaffected by who is checking out", () => {
    const open = coupon({ assignedMemberId: null, usageLimit: null });
    expect(validateCoupon(open, 100000n, NO_USAGE, NOW, "member-b").valid).toBe(true);
    expect(validateCoupon(open, 100000n, NO_USAGE, NOW).valid).toBe(true);
  });
});
