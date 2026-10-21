"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { grantReward } from "@/server/domain/rewards/reward-service";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { grantRewardSchema } from "@/lib/schemas/reward";
import { recordAudit } from "@/server/domain/audit/record";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "reward_action_failed";

function revalidateRewards() {
  revalidatePath("/admin/rewards");
  revalidatePath("/rewards");
  revalidatePath("/coupons");
}

/** Notifications are a courtesy: a failure to deliver one never undoes the reward it describes. */
async function notify(userId: string, type: string, payload: Record<string, string | number>) {
  await createNotification({ userId, type, payload }).catch(() => undefined);
}

export async function grantRewardAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ rewardId: string; number: string; couponCode: string }>> {
  let session;
  try {
    session = await authorize("reward:grant");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to pay rewards.");
  }

  const parsed = grantRewardSchema.safeParse({
    userId: formData.get("userId"),
    title: formData.get("title"),
    reason: formData.get("reason"),
    idempotencyKey: formData.get("idempotencyKey"),
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
          type: "COUPON",
          title: result.title,
          reason: parsed.data.reason,
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
