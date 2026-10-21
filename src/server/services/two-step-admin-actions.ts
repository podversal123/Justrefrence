"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { recordAudit } from "@/server/domain/audit/record";
import { removeAllTwoStepFactors } from "@/server/lib/two-step-admin";
import { resetTwoStepSchema } from "@/lib/schemas/two-step";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import { findUserIdById } from "@/server/repositories/identity/user-repository";
import type { ApiResult } from "@/lib/api-response";

const TAG = "two_step_admin_action_failed";

/**
 * A Super Admin clears another account's two-step login (lost phone). The account can then sign in with
 * its password and set up a new authenticator; if the staff requirement is on, it is made to do so.
 * Always with a recorded reason, and the account is told.
 */
export async function resetTwoStepAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("two_step:reset");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to reset two-step login.");
  }

  const parsed = resetTwoStepSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    return validationFailure("Give a short reason for this reset.", parsed.error);

  const { userId, reason } = parsed.data;
  try {
    if (userId === session.userId) {
      throw new ValidationError("To change your own two-step login, use the Two-step login page.");
    }
    const target = await findUserIdById(userId);
    if (!target) throw new NotFoundError("Account not found.");

    const removed = await removeAllTwoStepFactors(userId);
    if (removed === 0) {
      throw new ConflictError(
        "This account has no two-step login set up, so there is nothing to reset.",
      );
    }
    await recordAudit({
      actorId: session.userId,
      action: "TWO_STEP_RESET_BY_ADMIN",
      entityType: "users",
      entityId: userId,
      after: { reason, removedFactors: removed },
    });
  } catch (error) {
    return failureFrom(TAG, error, "Could not reset two-step login.");
  }

  // A courtesy: failing to notify never undoes the reset (it is already audited).
  await createNotification({ userId, type: "TWO_STEP_RESET", payload: {} }).catch(() => undefined);
  revalidatePath(`/admin/admins/${userId}`);
  return { success: true, data: null, meta: { requestId: requestId() } };
}
