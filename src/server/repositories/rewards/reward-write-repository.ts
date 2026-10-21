// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. Rewards are tested
// against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RewardType } from "@/generated/prisma/enums";
import type { Tx } from "@/server/repositories/transaction";

/** The member behind a user id, with the account status, to check a reward can be paid. */
export function findMemberForReward(userId: string) {
  return prisma.memberProfile.findUnique({
    where: { userId },
    select: { id: true, user: { select: { status: true } } },
  });
}

/** An identical reward by the same admin to the same member since `since`: the double-click guard. */
export function findRecentDuplicateReward(input: {
  memberId: string;
  grantedBy: string;
  type: RewardType;
  title: string;
  amount: bigint | null;
  since: Date;
}) {
  return prisma.reward.findFirst({
    where: {
      memberId: input.memberId,
      grantedBy: input.grantedBy,
      type: input.type,
      title: input.title,
      amount: input.amount,
      createdAt: { gte: input.since },
    },
    select: { id: true },
  });
}

/** A reward that was already granted under this request key, to answer a repeated request. */
export function findRewardByKey(idempotencyKey: string) {
  return prisma.reward.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      rewardSeq: true,
      type: true,
      title: true,
      member: { select: { userId: true } },
      coupon: { select: { code: true } },
    },
  });
}

export async function isCouponCodeTaken(tx: Tx, code: string): Promise<boolean> {
  return Boolean(await tx.coupon.findUnique({ where: { code }, select: { id: true } }));
}

export function createRewardCoupon(tx: Tx, data: Prisma.CouponUncheckedCreateInput) {
  return tx.coupon.create({ data, select: { id: true } });
}

export function createRewardRow(tx: Tx, data: Prisma.RewardUncheckedCreateInput) {
  return tx.reward.create({ data, select: { id: true, rewardSeq: true } });
}

/** Marks a gift or benefit as handed over, only if it still can be. Returns how many rows changed. */
export async function markOtherRewardGiven(rewardId: string, now: Date): Promise<number> {
  const moved = await prisma.reward.updateMany({
    where: {
      id: rewardId,
      type: "OTHER",
      usedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { usedAt: now },
  });
  return moved.count;
}

export function findRewardGivenState(rewardId: string) {
  return prisma.reward.findUnique({
    where: { id: rewardId },
    select: { type: true, expiresAt: true, usedAt: true },
  });
}

export function getGivenRewardSummary(rewardId: string) {
  return prisma.reward.findUniqueOrThrow({
    where: { id: rewardId },
    select: { id: true, rewardSeq: true, title: true, member: { select: { userId: true } } },
  });
}
