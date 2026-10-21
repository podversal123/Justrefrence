// No "server-only" import — orchestration layer, same rationale as wallet-service.ts
// (its prisma and repository dependencies carry the guard).
import { randomBytes, randomUUID } from "node:crypto";
import { runInTransaction, type Tx } from "@/server/repositories/transaction";
import {
  createRewardCoupon,
  createRewardRow,
  findMemberForReward,
  findRecentDuplicateReward,
  findRewardByKey,
  isCouponCodeTaken,
} from "@/server/repositories/rewards/reward-write-repository";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";
import { formatRewardNumber, rewardCouponCode } from "@/server/domain/rewards/rules";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import type { GrantRewardInput } from "@/lib/schemas/reward";

/**
 * Paying a reward: a coupon is created for that one member and a reward row records it. The coupon
 * terms and the member come from the validated input; nothing money-related is taken from the
 * browser as-is.
 */

const DUPLICATE_WINDOW_MS = 60_000;

export interface GrantRewardResult {
  rewardId: string;
  number: string;
  userId: string;
  title: string;
  couponCode: string;
  /** False when the same submission was already processed (a replay). */
  created: boolean;
}

export async function grantReward(
  grantedBy: string,
  input: GrantRewardInput,
): Promise<GrantRewardResult> {
  const idempotencyKey = scopedIdempotencyKey("reward", grantedBy, input.idempotencyKey);

  const replay = await findByKey(idempotencyKey);
  if (replay) return replay;

  const member = await findMemberForReward(input.userId);
  if (!member) throw new NotFoundError("That member was not found.");
  if (member.user.status !== "ACTIVE") {
    throw new ValidationError("Rewards can only be paid to an active member.");
  }

  // Key-independent double-submit guard: the same admin paying the same member the same reward
  // within the window is almost certainly a duplicate click, even if the client minted a fresh key.
  const duplicate = await findRecentDuplicateReward({
    memberId: member.id,
    grantedBy,
    title: input.title,
    since: new Date(Date.now() - DUPLICATE_WINDOW_MS),
  });
  if (duplicate) {
    throw new ConflictError(
      "An identical reward was just paid to this member. Check the rewards list before paying again.",
    );
  }

  const rewardId = randomUUID();

  try {
    return await runInTransaction(async (tx) => {
      const couponCode = await uniqueCouponCode(tx);
      const coupon = await createRewardCoupon(tx, {
        code: couponCode,
        discountType: input.discountType,
        valuePercentBps: input.valuePercentBps,
        valueFixed: input.valueFixed,
        minOrderAmount: input.minOrderAmount,
        startsAt: new Date(),
        expiresAt: input.expiresAt,
        usageLimit: 1,
        usageLimitPerMember: 1,
        assignedMemberId: member.id,
        createdBy: grantedBy,
      });

      const reward = await createRewardRow(tx, {
        id: rewardId,
        memberId: member.id,
        type: "COUPON",
        title: input.title,
        reason: input.reason,
        couponId: coupon.id,
        grantedBy,
        idempotencyKey,
      });

      return {
        rewardId: reward.id,
        number: formatRewardNumber(reward.rewardSeq),
        userId: input.userId,
        title: input.title,
        couponCode,
        created: true,
      };
    });
  } catch (error) {
    // Concurrent same-key submission: the unique index rejected the loser (its whole transaction
    // rolled back); answer with the winner's reward.
    if (isUniqueConstraintViolation(error)) {
      const winner = await findByKey(idempotencyKey);
      if (winner) return winner;
    }
    throw error;
  }
}

async function findByKey(idempotencyKey: string): Promise<GrantRewardResult | null> {
  const existing = await findRewardByKey(idempotencyKey);
  if (!existing?.coupon) return null;
  return {
    rewardId: existing.id,
    number: formatRewardNumber(existing.rewardSeq),
    userId: existing.member.userId,
    title: existing.title,
    couponCode: existing.coupon.code,
    created: false,
  };
}

/** Generates a coupon code nobody has used. A collision among 32^8 codes is vanishingly rare, but is checked anyway. */
async function uniqueCouponCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = rewardCouponCode(randomBytes(8));
    if (!(await isCouponCodeTaken(tx, code))) return code;
  }
  throw new ConflictError("Could not create a coupon code. Please try again.");
}
