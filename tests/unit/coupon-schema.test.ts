import { describe, expect, it } from "vitest";
import { createCouponSchema } from "@/lib/schemas/coupon";
import { couponState, describeDiscount } from "@/lib/coupon-display";

const base = {
  code: "welcome10",
  discountType: "PERCENT",
  percent: "10",
  startsOn: "2026-10-01",
} as const;

describe("createCouponSchema", () => {
  it("uppercases the code and converts percent to basis points", () => {
    const parsed = createCouponSchema.parse(base);
    expect(parsed.code).toBe("WELCOME10");
    expect(parsed.valuePercentBps).toBe(1000);
    expect(parsed.valueFixed).toBeNull();
    expect(parsed.usageLimitPerMember).toBe(1);
    expect(parsed.minOrderAmount).toBe(0n);
  });

  it.each([
    ["7.5", 750],
    ["100", 10000],
    ["0.01", 1],
  ])("percent %s -> %i bps", (percent, bps) => {
    expect(createCouponSchema.parse({ ...base, percent }).valuePercentBps).toBe(bps);
  });

  it.each(["0", "100.01", "abc", "", "-5"])("rejects percent %j", (percent) => {
    expect(createCouponSchema.safeParse({ ...base, percent }).success).toBe(false);
  });

  it("converts a fixed rupee amount to exact paise and the minimum order too", () => {
    const parsed = createCouponSchema.parse({
      code: "FLAT200",
      discountType: "FIXED",
      fixedRupees: "199.50",
      minOrderRupees: "1000",
      startsOn: "2026-10-01",
    });
    expect(parsed.valueFixed).toBe(19950n);
    expect(parsed.minOrderAmount).toBe(100000n);
    expect(parsed.valuePercentBps).toBeNull();
  });

  it("rejects a zero fixed discount, a bad code, and an expiry before the start", () => {
    expect(
      createCouponSchema.safeParse({
        code: "FLAT",
        discountType: "FIXED",
        fixedRupees: "0",
        startsOn: "2026-10-01",
      }).success,
    ).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, code: "ab" }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, code: "has space" }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, expiresOn: "2026-09-30" }).success).toBe(false);
  });

  it("treats the expiry date as valid THROUGH that day", () => {
    const parsed = createCouponSchema.parse({ ...base, expiresOn: "2026-10-31" });
    expect(parsed.expiresAt?.toISOString()).toBe("2026-10-31T23:59:59.999Z");
  });
});

describe("coupon display helpers", () => {
  const coupon = {
    discountType: "PERCENT" as const,
    valuePercentBps: 750,
    valueFixed: null,
    minOrderAmount: 0n,
    startsAt: new Date("2026-10-01T00:00:00Z"),
    expiresAt: new Date("2026-10-31T23:59:59Z"),
    usageLimit: 2,
    usageLimitPerMember: 1,
    deletedAt: null,
    _count: { redemptions: 0 },
  };

  it("describes percent and fixed discounts", () => {
    expect(describeDiscount(coupon)).toBe("7.50% off");
    expect(describeDiscount({ ...coupon, valuePercentBps: 1000 })).toBe("10% off");
    expect(
      describeDiscount({ discountType: "FIXED", valuePercentBps: null, valueFixed: 20000n }),
    ).toContain("200");
  });

  it("derives the lifecycle state", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    expect(couponState(coupon, now)).toBe("ACTIVE");
    expect(couponState(coupon, new Date("2026-09-01T00:00:00Z"))).toBe("SCHEDULED");
    expect(couponState(coupon, new Date("2026-11-02T00:00:00Z"))).toBe("EXPIRED");
    expect(couponState({ ...coupon, _count: { redemptions: 2 } }, now)).toBe("USED_UP");
    expect(couponState({ ...coupon, deletedAt: new Date() }, now)).toBe("DEACTIVATED");
  });
});
