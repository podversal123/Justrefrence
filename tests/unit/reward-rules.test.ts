import { describe, expect, it } from "vitest";
import {
  canMarkGiven,
  formatRewardNumber,
  rewardCouponCode,
  rewardStatus,
  type RewardFacts,
} from "@/server/domain/rewards/rules";

const NOW = new Date("2026-10-14T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const coupon = (over: Partial<NonNullable<RewardFacts["coupon"]>> = {}) => ({
  expiresAt: day(5),
  deletedAt: null,
  redeemed: false,
  ...over,
});

describe("rewardStatus", () => {
  it("treats cash as used the moment it is paid", () => {
    expect(rewardStatus({ type: "CASH", expiresAt: null, usedAt: NOW, coupon: null }, NOW)).toBe(
      "USED",
    );
  });

  it("keeps a coupon unused until it is redeemed or runs out", () => {
    const base = { type: "COUPON" as const, expiresAt: null, usedAt: null };
    expect(rewardStatus({ ...base, coupon: coupon() }, NOW)).toBe("UNUSED");
    expect(rewardStatus({ ...base, coupon: coupon({ redeemed: true }) }, NOW)).toBe("USED");
    expect(rewardStatus({ ...base, coupon: coupon({ expiresAt: day(-1) }) }, NOW)).toBe("EXPIRED");
    expect(rewardStatus({ ...base, coupon: coupon({ expiresAt: NOW }) }, NOW)).toBe("EXPIRED");
    expect(rewardStatus({ ...base, coupon: coupon({ deletedAt: NOW }) }, NOW)).toBe("EXPIRED");
  });

  it("calls a coupon used even if its date has since passed", () => {
    const facts: RewardFacts = {
      type: "COUPON",
      expiresAt: null,
      usedAt: null,
      coupon: coupon({ redeemed: true, expiresAt: day(-3) }),
    };
    expect(rewardStatus(facts, NOW)).toBe("USED");
  });

  it("treats a coupon with no linked coupon as expired", () => {
    expect(rewardStatus({ type: "COUPON", expiresAt: null, usedAt: null, coupon: null }, NOW)).toBe(
      "EXPIRED",
    );
  });

  it("handles a gift: unused, given, or past its date", () => {
    const base = { type: "OTHER" as const, coupon: null };
    expect(rewardStatus({ ...base, expiresAt: null, usedAt: null }, NOW)).toBe("UNUSED");
    expect(rewardStatus({ ...base, expiresAt: day(2), usedAt: null }, NOW)).toBe("UNUSED");
    expect(rewardStatus({ ...base, expiresAt: day(2), usedAt: NOW }, NOW)).toBe("USED");
    expect(rewardStatus({ ...base, expiresAt: day(-1), usedAt: null }, NOW)).toBe("EXPIRED");
    // Given before it expired stays used.
    expect(rewardStatus({ ...base, expiresAt: day(-1), usedAt: day(-2) }, NOW)).toBe("USED");
  });
});

describe("canMarkGiven", () => {
  const gift = (over: Partial<RewardFacts> = {}): RewardFacts => ({
    type: "OTHER",
    expiresAt: null,
    usedAt: null,
    coupon: null,
    ...over,
  });

  it("allows an unused gift", () => {
    expect(canMarkGiven(gift(), NOW).ok).toBe(true);
  });
  it("refuses a gift already given or expired", () => {
    expect(canMarkGiven(gift({ usedAt: NOW }), NOW).ok).toBe(false);
    expect(canMarkGiven(gift({ expiresAt: day(-1) }), NOW).ok).toBe(false);
  });
  it("refuses cash and coupons", () => {
    expect(canMarkGiven(gift({ type: "CASH" }), NOW).ok).toBe(false);
    expect(canMarkGiven(gift({ type: "COUPON", coupon: coupon() }), NOW).ok).toBe(false);
  });
});

describe("numbers and codes", () => {
  it("pads the reward number", () => {
    expect(formatRewardNumber(7n)).toBe("RWD-000007");
  });
  it("builds a readable code from random bytes", () => {
    const code = rewardCouponCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toBe("RWD-ABCDEFGH");
    expect(code).toMatch(/^RWD-[A-Z2-9]{8}$/);
  });
  it("never uses look-alike characters", () => {
    const all = rewardCouponCode(new Uint8Array(Array.from({ length: 8 }, (_, i) => i * 4)));
    expect(all).not.toMatch(/[01OI]/);
  });
});
