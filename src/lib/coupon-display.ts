import { formatPaise } from "@/lib/money";

interface CouponForDisplay {
  discountType: "PERCENT" | "FIXED";
  valuePercentBps: number | null;
  valueFixed: bigint | null;
  minOrderAmount: bigint;
  startsAt: Date;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageLimitPerMember: number;
  deletedAt: Date | null;
  _count: { redemptions: number };
}

export function describeDiscount(
  coupon: Pick<CouponForDisplay, "discountType" | "valuePercentBps" | "valueFixed">,
): string {
  if (coupon.discountType === "PERCENT") {
    const bps = coupon.valuePercentBps ?? 0;
    const percent = bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2);
    return `${percent}% off`;
  }
  return `${formatPaise((coupon.valueFixed ?? 0n).toString(), "INR")} off`;
}

export type CouponState = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "USED_UP" | "DEACTIVATED";

export function couponState(coupon: CouponForDisplay, now: Date = new Date()): CouponState {
  if (coupon.deletedAt) return "DEACTIVATED";
  if (coupon.expiresAt && now >= coupon.expiresAt) return "EXPIRED";
  if (now < coupon.startsAt) return "SCHEDULED";
  if (coupon.usageLimit !== null && coupon._count.redemptions >= coupon.usageLimit)
    return "USED_UP";
  return "ACTIVE";
}

export const COUPON_STATE_LABEL: Record<CouponState, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  USED_UP: "Fully used",
  DEACTIVATED: "Deactivated",
};
