"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { grantReward, markRewardGiven } from "@/server/domain/rewards/reward-service";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { grantRewardSchema, markRewardGivenSchema } from "@/lib/schemas/reward";
import { recordAudit } from "@/server/domain/audit/record";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "reward_action_failed";

function revalidateRewards() {
  revalidatePath("/admin/rewards");
  revalidatePath("/rewards");
  revalidatePath("/coupons");
  revalidatePath("/wallet");
}

/** Notifications are a courtesy: a failure to deliver one never undoes the reward it describes. */
async function notify(userId: string, type: string, payload: Record<string, string | number>) {
  await createNotification({ userId, type, payload }).catch(() => undefined);
}

export async function grantRewardAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ rewardId: string; number: string; couponCode: string | null }>> {
  let session;
  try {
    session = await authorize("reward:grant");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to pay rewards.");
  }

  const parsed = grantRewardSchema.safeParse({
    userId: formData.get("userId"),
    type: formData.get("type"),
    title: formData.get("title"),
    reason: formData.get("reason"),
    idempotencyKey: formData.get("idempotencyKey"),
    amountRupees: formData.get("amountRupees") || undefined,
    discountType: formData.get("discountType") || undefined,
    percent: formData.get("percent") || undefined,
    fixedRupees: formData.get("fixedRupees") || undefined,
    minOrderRupees: formData.get("minOrderRupees") || undefined,
    expiresOn: formData.get("expiresOn") || undefined,
  });
  if (!parsed.success) return validationFailure("Check the reward details below.", parsed.error);

  try {
    const result = await grantReward(session.userId, parsed.data);
    if (result.created) {
      await notify(result.userId, "REWARD_RECEIVED", {
        rewardId: result.rewardId,
        number: result.number,
      });
      await recordAudit({
        actorId: session.userId,
        action: "REWARD_GRANTED",
        entityType: "rewards",
        entityId: result.rewardId,
        after: {
          number: result.number,
          memberUserId: result.userId,
          type: result.type,
          title: result.title,
          reason: parsed.data.reason,
          amount: parsed.data.type === "CASH" ? parsed.data.amount.toString() : null,
          couponCode: result.couponCode,
        },
      });
    }
    revalidateRewards();
    return {
      success: true,
      data: { rewardId: result.rewardId, number: result.number, couponCode: result.couponCode },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(TAG, error, "Could not pay that reward.");
  }
}

export async function markRewardGivenAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("reward:grant");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to update rewards.");
  }
  const parsed = markRewardGivenSchema.safeParse({ rewardId: formData.get("rewardId") });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);

  try {
    const reward = await markRewardGiven(parsed.data.rewardId);
    await recordAudit({
      actorId: session.userId,
      action: "REWARD_MARKED_GIVEN",
      entityType: "rewards",
      entityId: reward.id,
      after: { memberUserId: reward.member.userId, title: reward.title },
    });
    revalidateRewards();
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not update that reward.");
  }
}
