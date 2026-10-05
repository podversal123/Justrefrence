"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import {
  isStaffAccount,
  setUserStatus,
} from "@/server/repositories/identity/member-admin-repository";
import { prisma } from "@/server/lib/prisma";
import { memberModerationSchema } from "@/lib/schemas/support";
import { recordAudit } from "@/server/domain/audit/record";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/lib/errors";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Blacklist / allow a member (workflow doc: "Members - Blacklist/Allow
 * member, Member Blocked List"). A BLOCKED account is refused by
 * authorize() on every subsequent request (evaluate-authorization.ts), so
 * the block takes effect immediately, not at next login.
 */

const TAG = "member_moderation_failed";

export async function moderateMemberAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = memberModerationSchema.safeParse({
    userId: formData.get("userId"),
    action: formData.get("action"),
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    return validationFailure("Give a short reason for this change.", parsed.error);

  const { userId, action, reason } = parsed.data;
  let session;
  try {
    session = await authorize(action === "BLOCK" ? "member:block" : "member:unblock");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to change member access.");
  }

  try {
    if (userId === session.userId) throw new ValidationError("You can't change your own access.");
    if (await isStaffAccount(userId)) {
      throw new AuthorizationError("Staff accounts are managed under Admins, not Members.");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, emailVerifiedAt: true, memberProfile: { select: { id: true } } },
    });
    if (!user?.memberProfile) throw new NotFoundError("Member not found.");

    // Unblocking restores the state the account would otherwise be in: an
    // unverified account goes back to PENDING_VERIFICATION, not ACTIVE.
    const target =
      action === "BLOCK" ? "BLOCKED" : user.emailVerifiedAt ? "ACTIVE" : "PENDING_VERIFICATION";
    const changed = await setUserStatus(userId, target);
    if (!changed) {
      throw new ConflictError(
        action === "BLOCK" ? "This member is already blocked." : "This member isn't blocked.",
      );
    }

    await recordAudit({
      actorId: session.userId,
      action: action === "BLOCK" ? "MEMBER_BLOCKED" : "MEMBER_UNBLOCKED",
      entityType: "users",
      entityId: userId,
      before: { status: user.status },
      after: { status: target, reason },
    });
    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${userId}`);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not change that member's access.");
  }
}
