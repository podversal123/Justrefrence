/**
 * Coupon validation + discount calculation — pure, no I/O (caller supplies
 * the coupon row and the pre-computed usage counts), unit-tested directly.
 * See docs/database-tables.md §9 and docs/adr/0013-commerce-money-math.md.
 */
import { applyRateBps } from "@/server/domain/commerce/money";

export interface CouponRow {
  code: string;
  discountType: "PERCENT" | "FIXED";
  valuePercentBps: number | null;
  valueFixed: bigint | null;
  minOrderAmount: bigint;
  startsAt: Date;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageLimitPerMember: number;
  deletedAt: Date | null;
}

export interface CouponUsage {
  globalRedemptions: number;
  memberRedemptions: number;
}

export type CouponValidationFailure =
  | "NOT_FOUND"
  | "DELETED"
  | "NOT_STARTED"
  | "EXPIRED"
  | "BELOW_MIN_ORDER"
  | "GLOBAL_LIMIT_REACHED"
  | "MEMBER_LIMIT_REACHED";

export interface CouponValidationResult {
  valid: boolean;
  failure?: CouponValidationFailure;
  /** Discount in paise, computed only when valid. */
  discount?: bigint;
}

const FAILURE_MESSAGES: Record<CouponValidationFailure, string> = {
  NOT_FOUND: "That coupon code doesn't exist.",
  DELETED: "That coupon is no longer available.",
  NOT_STARTED: "That coupon isn't active yet.",
  EXPIRED: "That coupon has expired.",
  BELOW_MIN_ORDER: "Your order doesn't meet this coupon's minimum amount.",
  GLOBAL_LIMIT_REACHED: "This coupon has reached its usage limit.",
  MEMBER_LIMIT_REACHED: "You've already used this coupon the maximum number of times.",
};

export function couponFailureMessage(failure: CouponValidationFailure): string {
  return FAILURE_MESSAGES[failure];
}

export function validateCoupon(
  coupon: CouponRow,
  cartSubtotal: bigint,
  usage: CouponUsage,
  now: Date = new Date(),
): CouponValidationResult {
  if (coupon.deletedAt) return { valid: false, failure: "DELETED" };
  if (now < coupon.startsAt) return { valid: false, failure: "NOT_STARTED" };
  if (coupon.expiresAt && now >= coupon.expiresAt) return { valid: false, failure: "EXPIRED" };
  if (cartSubtotal < coupon.minOrderAmount) return { valid: false, failure: "BELOW_MIN_ORDER" };
  if (coupon.usageLimit !== null && usage.globalRedemptions >= coupon.usageLimit) {
    return { valid: false, failure: "GLOBAL_LIMIT_REACHED" };
  }
  if (usage.memberRedemptions >= coupon.usageLimitPerMember) {
    return { valid: false, failure: "MEMBER_LIMIT_REACHED" };
  }

  const rawDiscount =
    coupon.discountType === "PERCENT"
      ? applyRateBps(cartSubtotal, coupon.valuePercentBps ?? 0)
      : (coupon.valueFixed ?? 0n);

  // A coupon can never discount more than the cart is actually worth.
  const discount = rawDiscount > cartSubtotal ? cartSubtotal : rawDiscount;

  return { valid: true, discount };
}
