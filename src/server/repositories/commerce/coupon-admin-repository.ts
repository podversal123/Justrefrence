import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { CouponDiscountType } from "@/generated/prisma/enums";

const COUPON_LIST_SELECT = {
  id: true,
  code: true,
  discountType: true,
  valuePercentBps: true,
  valueFixed: true,
  minOrderAmount: true,
  startsAt: true,
  expiresAt: true,
  usageLimit: true,
  usageLimitPerMember: true,
  deletedAt: true,
  createdAt: true,
  _count: { select: { redemptions: true } },
} as const;

export async function listCouponsForAdmin() {
  return prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: COUPON_LIST_SELECT,
  });
}

export async function findCouponByCodeIncludingDeleted(code: string) {
  return prisma.coupon.findUnique({ where: { code }, select: { id: true } });
}

export async function createCoupon(input: {
  code: string;
  discountType: CouponDiscountType;
  valuePercentBps: number | null;
  valueFixed: bigint | null;
  minOrderAmount: bigint;
  startsAt: Date;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageLimitPerMember: number;
  createdBy: string;
}) {
  return prisma.coupon.create({ data: input, select: { id: true, code: true } });
}

/** Deactivating is a soft delete (redemption history keeps pointing at the coupon). Conditional so a repeat click is a no-op. */
export async function setCouponDeleted(couponId: string, deleted: boolean): Promise<boolean> {
  const result = await prisma.coupon.updateMany({
    where: { id: couponId, deletedAt: deleted ? null : { not: null } },
    data: { deletedAt: deleted ? new Date() : null },
  });
  return result.count > 0;
}

/** Everything a member needs to see "available / used / expired" for each coupon. */
export async function listCouponsForMember(memberProfileId: string) {
  const [coupons, mine] = await Promise.all([
    prisma.coupon.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: COUPON_LIST_SELECT,
    }),
    prisma.couponRedemption.groupBy({
      by: ["couponId"],
      where: { memberId: memberProfileId },
      _count: { _all: true },
    }),
  ]);
  const usedByMe = new Map(mine.map((m) => [m.couponId, m._count._all]));
  return coupons.map((coupon) => ({ ...coupon, usedByMe: usedByMe.get(coupon.id) ?? 0 }));
}
