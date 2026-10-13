"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { getAuthSession } from "@/server/auth/session";
import { kycDocumentTypeSchema, reviewKycSchema } from "@/lib/schemas/kyc";
import { reviewKycDocument, submitKycDocument } from "@/server/domain/kyc/kyc-service";
import { AccountBlockedError, AuthenticationError, ValidationError } from "@/server/lib/errors";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * KYC documents: a person submits their own PAN card (and vendors their GST certificate); staff
 * with `kyc:review` verify or reject. Ownership comes from the session, never from the form.
 */

function refreshKycPages() {
  revalidatePath("/profile");
  revalidatePath("/vendor/profile");
  revalidatePath("/admin/kyc");
}

export async function uploadKycDocumentAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  try {
    const session = await getAuthSession();
    if (!session) throw new AuthenticationError();
    if (session.status === "BLOCKED") throw new AccountBlockedError();

    const type = kycDocumentTypeSchema.safeParse(formData.get("type"));
    if (!type.success) throw new ValidationError("Choose which document you are uploading.");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Choose a file to upload.");
    }

    await submitKycDocument({
      ownerUserId: session.userId,
      isVendor: session.hasVendorProfile,
      type: type.data,
      file,
    });
    refreshKycPages();
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom("kyc_upload_failed", error, "Could not upload that file. Try again.");
  }
}

export async function reviewKycDocumentAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("kyc:review");
  } catch (error) {
    return failureFrom(
      "kyc_review_denied",
      error,
      "You don't have permission to review documents.",
    );
  }

  const parsed = reviewKycSchema.safeParse({
    documentId: formData.get("documentId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the details and try again.", parsed.error);

  try {
    await reviewKycDocument({
      documentId: parsed.data.documentId,
      reviewerId: session.userId,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });
    refreshKycPages();
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom("kyc_review_failed", error, "Could not save that decision. Try again.");
  }
}
