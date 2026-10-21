import { describe, expect, it } from "vitest";
import { grantRewardSchema } from "@/lib/schemas/reward";

const USER = "3f2b1c9e-8a4d-4e6b-9c1a-2d5e7f8a9b0c";
const KEY = "8a1d7f6e-2b3c-4d5e-8f90-a1b2c3d4e5f6";
const istDay = (offsetDays: number) =>
  new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const future = () => istDay(10);
const past = () => istDay(-2);

const base = {
  userId: USER,
  title: "Diwali bonus",
  reason: "Top referrer of the month",
  idempotencyKey: KEY,
};

describe("grantRewardSchema: coupon", () => {
  it("accepts a percentage coupon with a future last day", () => {
    const r = grantRewardSchema.safeParse({
      ...base,
      discountType: "PERCENT",
      percent: "10",
      minOrderRupees: "500",
      expiresOn: future(),
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.valuePercentBps).toBe(1000);
      expect(r.data.valueFixed).toBeNull();
      expect(r.data.minOrderAmount).toBe(50000n);
      expect(r.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });
  it("accepts a fixed-amount coupon", () => {
    const r = grantRewardSchema.safeParse({
      ...base,
      discountType: "FIXED",
      fixedRupees: "200",
      expiresOn: future(),
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.valueFixed).toBe(20000n);
      expect(r.data.valuePercentBps).toBeNull();
    }
  });
  it("needs a discount type, a value and a last day", () => {
    const coupon = { ...base };
    expect(grantRewardSchema.safeParse(coupon).success).toBe(false);
    expect(
      grantRewardSchema.safeParse({ ...coupon, discountType: "PERCENT", expiresOn: future() })
        .success,
    ).toBe(false);
    expect(
      grantRewardSchema.safeParse({ ...coupon, discountType: "PERCENT", percent: "10" }).success,
    ).toBe(false);
  });
  it("refuses a percentage over 100 and a date in the past", () => {
    const coupon = { ...base, discountType: "PERCENT", expiresOn: future() };
    expect(grantRewardSchema.safeParse({ ...coupon, percent: "150" }).success).toBe(false);
    expect(
      grantRewardSchema.safeParse({ ...coupon, percent: "10", expiresOn: past() }).success,
    ).toBe(false);
  });
});

describe("last day", () => {
  const coupon = { ...base, discountType: "FIXED", fixedRupees: "100" };
  it("ends at the close of that day in IST", () => {
    const r = grantRewardSchema.safeParse({ ...coupon, expiresOn: "2099-03-05" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expiresAt.toISOString()).toBe("2099-03-05T18:29:59.999Z");
  });
  it("accepts today (IST) as the last day", () => {
    expect(grantRewardSchema.safeParse({ ...coupon, expiresOn: istDay(0) }).success).toBe(true);
  });
});

describe("grantRewardSchema: common rules", () => {
  const coupon = { ...base, discountType: "FIXED", fixedRupees: "100", expiresOn: future() };
  it("needs a reason, a name, a member and a key", () => {
    expect(grantRewardSchema.safeParse({ ...coupon, reason: "ok" }).success).toBe(false);
    expect(grantRewardSchema.safeParse({ ...coupon, title: "x" }).success).toBe(false);
    expect(grantRewardSchema.safeParse({ ...coupon, userId: "nope" }).success).toBe(false);
    expect(grantRewardSchema.safeParse({ ...coupon, idempotencyKey: "nope" }).success).toBe(false);
  });
  it("is always a coupon: a cash or gift request is read as a coupon request", () => {
    const r = grantRewardSchema.safeParse({ ...coupon, type: "CASH", amountRupees: "100" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("amount");
      expect(r.data.valueFixed).toBe(10000n);
    }
    // No discount details, so a cash-style request alone is refused.
    expect(
      grantRewardSchema.safeParse({ ...base, type: "CASH", amountRupees: "100" }).success,
    ).toBe(false);
  });
});
