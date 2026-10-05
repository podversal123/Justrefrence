import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function findCouponByCode(code: string) {
  return prisma.coupon.findUnique({ where: { code } });
}

export async function getCouponUsage(couponId: string, memberId: string) {
  const [globalRedemptions, memberRedemptions] = await Promise.all([
    prisma.couponRedemption.count({ where: { couponId } }),
    prisma.couponRedemption.count({ where: { couponId, memberId } }),
  ]);
  return { globalRedemptions, memberRedemptions };
}

export async function createCouponRedemption(
  tx: Prisma.TransactionClient,
  input: { couponId: string; memberId: string; orderId: string; amountDiscounted: bigint },
) {
  return tx.couponRedemption.create({ data: input });
}
