"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { authorize } from "@/server/auth/authorize";
import { getLegalTextsFresh, LEGAL_PAGES_TAG, saveLegalTexts } from "@/server/lib/legal-store";
import { LEGAL_PAGES, MAX_LEGAL_LENGTH } from "@/lib/legal-pages";
import { recordAudit } from "@/server/domain/audit/record";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "legal_pages_action_failed";

const legalText = z
  .string()
  .max(MAX_LEGAL_LENGTH, "This text is too long.")
  .optional()
  .transform((value) => (value ?? "").replace(/\r\n/g, "\n").trim());

const legalPagesSchema = z.object({
  terms: legalText,
  privacy: legalText,
  "refund-policy": legalText,
});

/** Saves the wording of the three legal pages. An empty box un-publishes that page. */
export async function updateLegalPagesAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("settings:update");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to change the legal pages.");
  }

  const parsed = legalPagesSchema.safeParse({
    terms: formData.get("terms") ?? undefined,
    privacy: formData.get("privacy") ?? undefined,
    "refund-policy": formData.get("refund-policy") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the highlighted text.", parsed.error);

  try {
    const before = await getLegalTextsFresh();
    await saveLegalTexts(parsed.data, session.userId);
    // The text itself can be long; the audit log records which pages changed and their new length.
    const changed = LEGAL_PAGES.filter((page) => before[page.slug] !== parsed.data[page.slug]).map(
      (page) => ({ page: page.slug, characters: parsed.data[page.slug].length }),
    );
    await recordAudit({
      actorId: session.userId,
      action: "LEGAL_PAGES_UPDATED",
      entityType: "system_settings",
      entityId: "legal",
      after: { changed },
    });
    revalidateTag(LEGAL_PAGES_TAG, { expire: 0 });
    for (const page of LEGAL_PAGES) revalidatePath(page.path);
    revalidatePath("/admin/legal");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not save the legal pages.");
  }
}
