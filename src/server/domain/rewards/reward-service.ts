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
  findRewardGivenState,
  getGivenRewardSummary,
  isCouponCodeTaken,
  markOtherRewardGiven,
} from "@/server/repositories/rewards/reward-write-repository";
import { creditWallet, getOrCreateWallet } from "@/server/repositories/wallet/wallet-repository";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";
import {
  canMarkGiven,
  formatRewardNumber,
  rewardCouponCode,
  type RewardType,
} from "@/server/domain/rewards/rules";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import type { GrantRewardInput } from "@/lib/schemas/reward";

/**
 * Paying a reward. Cash goes through the wallet ledger (a REWARD credit, idempotent, in the SAME
 * transaction as the reward row), a coupon is created for that one member, and a gift is just a
 * record the admin later marks as handed over. The amount, the coupon terms and the member all come
 * from the validated input; nothing money-related is taken from the browser as-is.
 */

const DUPLICATE_WINDOW_MS = 60_000;

export interface GrantRewardResult {
  rewardId: string;
  number: string;
  userId: string;
  type: RewardType;
  title: string;
  couponCode: string | null;
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
    type: input.type,
    title: input.title,
    amount: input.type === "CASH" ? input.amount : null,
    since: new Date(Date.now() - DUPLICATE_WINDOW_MS),
  });
  if (duplicate) {
    throw new ConflictError(
      "An identical reward was just paid to this member. Check the rewards list before paying again.",
    );
  }

  const wallet = input.type === "CASH" ? await getOrCreateWallet(input.userId) : null;
  const rewardId = randomUUID();

  try {
    return await runInTransaction(async (tx) => {
      let walletTransactionId: string | null = null;
      let couponId: string | null = null;
      let couponCode: string | null = null;

      if (input.type === "CASH") {
        const credit = await creditWallet(tx, {
          walletId: wallet!.id,
          amount: input.amount,
          type: "REWARD",
          referenceType: "REWARD",
          referenceId: rewardId,
          idempotencyKey: `reward-credit:${idempotencyKey}`,
        });
        walletTransactionId = credit.transaction?.id ?? credit.existing?.id ?? null;
        if (!walletTransactionId) throw new ConflictError("Could not credit the wallet.");
      }

      if (input.type === "COUPON") {
        couponCode = await uniqueCouponCode(tx);
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
        couponId = coupon.id;
      }

      const reward = await createRewardRow(tx, {
        id: rewardId,
        memberId: member.id,
        type: input.type,
        title: input.title,
        reason: input.reason,
        amount: input.type === "CASH" ? input.amount : null,
        couponId,
        walletTransactionId,
        expiresAt: input.type === "OTHER" ? input.expiresAt : null,
        usedAt: input.type === "CASH" ? new Date() : null,
        grantedBy,
        idempotencyKey,
      });

      return {
        rewardId: reward.id,
        number: formatRewardNumber(reward.rewardSeq),
        userId: input.userId,
        type: input.type,
        title: input.title,
        couponCode,
        created: true,
      };
    });
  } catch (error) {
    // Concurrent same-key submission: the unique index rejected the loser (its whole transaction,
    // including the wallet credit, rolled back); answer with the winner's reward.
    if (isUniqueConstraintViolation(error)) {
      const winner = await findByKey(idempotencyKey);
      if (winner) return winner;
    }
    throw error;
  }
}

async function findByKey(idempotencyKey: string): Promise<GrantRewardResult | null> {
  const existing = await findRewardByKey(idempotencyKey);
  if (!existing) return null;
  return {
    rewardId: existing.id,
    number: formatRewardNumber(existing.rewardSeq),
    userId: existing.member.userId,
    type: existing.type,
    title: existing.title,
    couponCode: existing.coupon?.code ?? null,
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

/** An admin marks a gift or benefit as handed over. Atomic, so a repeat click is a no-op error. */
export async function markRewardGiven(rewardId: string, now = new Date()) {
  const moved = await markOtherRewardGiven(rewardId, now);
  if (moved === 0) {
    const reward = await findRewardGivenState(rewardId);
    if (!reward) throw new NotFoundError("Reward not found.");
    const check = canMarkGiven({ ...reward, coupon: null }, now);
    throw new ConflictError(check.message ?? "This reward can't be marked as given.");
  }
  return getGivenRewardSummary(rewardId);
}
