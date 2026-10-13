"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { reviewChangeSchema } from "@/lib/schemas/approvals";
import { reviewChange } from "@/server/domain/approvals/change-service";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * A Super Admin approves or rejects a change an Admin asked for. The permission is checked here on the
 * server; hiding the buttons is only for convenience.
 */
export async function reviewChangeAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("change:review");
  } catch (error) {
    return failureFrom(
      "change_review_denied",
      error,
      "Only a Super Admin can approve or reject changes.",
    );
  }

  const parsed = reviewChangeSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the details and try again.", parsed.error);

  try {
    await reviewChange({
      requestId: parsed.data.requestId,
      reviewerId: session.userId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
    // The record itself changed too, so every screen that shows it is refreshed.
    revalidatePath("/admin/approvals");
    revalidatePath("/admin/members", "layout");
    revalidatePath("/admin/vendors", "layout");
    revalidatePath("/admin/catalog", "layout");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom("change_review_failed", error, "Could not save that decision. Try again.");
  }
}
