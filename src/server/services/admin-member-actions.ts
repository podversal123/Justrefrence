"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { adminCreateMemberSchema, adminUpdateMemberSchema } from "@/lib/schemas/member";
import { registerMemberByAdmin } from "@/server/domain/identity/admin-member-service";
import { isStaffAccount } from "@/server/repositories/identity/member-admin-repository";
import { submitChange } from "@/server/domain/approvals/change-service";
import { requestNoteSchema } from "@/lib/schemas/approvals";
import { AuthorizationError } from "@/server/lib/errors";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Admin-side member management from the workflow doc's Admin Panel list:
 * "New Registration" and "Edit Member Profile". Both are permission-gated
 * server-side; the UI only hides the buttons.
 */

export interface RegisteredMemberResult {
  userId: string;
  memberId: string;
  email: string;
  temporaryPassword: string;
}

export async function createMemberByAdminAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<RegisteredMemberResult>> {
  let session;
  try {
    session = await authorize("user:create");
  } catch (error) {
    return failureFrom(
      "admin_create_member_failed",
      error,
      "You don't have permission to register members.",
    );
  }

  const parsed = adminCreateMemberSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? undefined,
    referralCode: formData.get("referralCode") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);

  try {
    const member = await registerMemberByAdmin(parsed.data, session.userId);
    revalidatePath("/admin/members");
    return { success: true, data: member, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom("admin_create_member_failed", error, "Could not register that member.");
  }
}

export interface ChangeOutcome {
  /** APPLIED: the change is live. SUBMITTED: waiting for a Super Admin to approve it. */
  mode: "APPLIED" | "SUBMITTED";
}

export async function updateMemberByAdminAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<ChangeOutcome>> {
  let session;
  try {
    session = await authorize("member:update:any");
  } catch (error) {
    return failureFrom(
      "admin_update_member_failed",
      error,
      "You don't have permission to edit members.",
    );
  }

  const parsed = adminUpdateMemberSchema.safeParse({
    userId: formData.get("userId"),
    fullName: formData.get("fullName"),
    dob: formData.get("dob") || undefined,
    pan: formData.get("pan") || undefined,
    gstin: formData.get("gstin") || undefined,
    websiteUrl: formData.get("websiteUrl") || undefined,
    socialLinks: formData.get("socialLinks") || undefined,
    telephone: formData.get("telephone") || undefined,
  });
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);
  const note = requestNoteSchema.safeParse(formData.get("note") ?? undefined);

  const { userId, ...details } = parsed.data;
  try {
    if (await isStaffAccount(userId)) {
      throw new AuthorizationError("Staff accounts are managed under Admins, not Members.");
    }
    const result = await submitChange({
      entityType: "MEMBER_PROFILE",
      entityId: userId,
      proposed: {
        fullName: details.fullName,
        dob: details.dob ?? null,
        pan: details.pan ?? null,
        gstin: details.gstin ?? null,
        telephone: details.telephone ?? null,
        websiteUrl: details.websiteUrl ?? null,
        socialLinks: details.socialLinks ?? null,
      },
      actorId: session.userId,
      canApplyDirect: session.permissions.has("change:apply_direct"),
      note: note.success ? note.data : undefined,
    });

    revalidatePath(`/admin/members/${userId}`);
    revalidatePath("/admin/members");
    revalidatePath("/admin/approvals");
    return { success: true, data: { mode: result.mode }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom("admin_update_member_failed", error, "Could not update that member.");
  }
}
