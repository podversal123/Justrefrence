import { msg } from "@/i18n/locales";

/**
 * Reward rules — pure, no I/O, unit-tested directly (tests/unit/reward-rules.test.ts).
 * A reward is paid by an admin; its status (Unused / Used / Expired) is always derived
 * from the facts below at read time and is never stored, so it can't drift.
 */

export type RewardType = "CASH" | "COUPON" | "OTHER";
export type RewardStatus = "UNUSED" | "USED" | "EXPIRED";

export interface RewardFacts {
  type: RewardType;
  /** OTHER: when it stops being claimable. */
  expiresAt: Date | null;
  /** CASH: when it was credited. OTHER: when it was handed over. */
  usedAt: Date | null;
  /** COUPON: the linked coupon, with whether the member has redeemed it. */
  coupon: { expiresAt: Date | null; deletedAt: Date | null; redeemed: boolean } | null;
}

/**
 * - CASH is paid at once, so it is always USED.
 * - COUPON is USED once redeemed, EXPIRED once its date passes (or an admin deactivated it), else UNUSED.
 * - OTHER is USED once an admin marks it handed over, EXPIRED after its date, else UNUSED.
 */
export function rewardStatus(reward: RewardFacts, now: Date): RewardStatus {
  if (reward.type === "CASH") return "USED";

  if (reward.type === "COUPON") {
    const coupon = reward.coupon;
    if (!coupon) return "EXPIRED";
    if (coupon.redeemed) return "USED";
    if (coupon.deletedAt) return "EXPIRED";
    if (coupon.expiresAt && now.getTime() >= coupon.expiresAt.getTime()) return "EXPIRED";
    return "UNUSED";
  }

  if (reward.usedAt) return "USED";
  if (reward.expiresAt && now.getTime() >= reward.expiresAt.getTime()) return "EXPIRED";
  return "UNUSED";
}

export const REWARD_STATUS_LABEL: Record<RewardStatus, string> = {
  UNUSED: msg("Unused"),
  USED: msg("Used"),
  EXPIRED: msg("Expired"),
};

export const REWARD_TYPE_LABEL: Record<RewardType, string> = {
  CASH: msg("Cash"),
  COUPON: msg("Coupon"),
  OTHER: msg("Gift or benefit"),
};

export function formatRewardNumber(seq: bigint): string {
  return `RWD-${seq.toString().padStart(6, "0")}`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I, easy to read out loud

/** `RWD-` plus 8 characters, from caller-supplied random bytes so tests are deterministic. */
export function rewardCouponCode(randomBytes: Uint8Array): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += CODE_ALPHABET[(randomBytes[i] ?? 0) % CODE_ALPHABET.length];
  }
  return `RWD-${suffix}`;
}
