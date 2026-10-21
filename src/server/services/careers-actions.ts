"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { recordAudit } from "@/server/domain/audit/record";
import { checkResumeUpload, cleanFileName } from "@/server/domain/careers/resume-rules";
import {
  createResume,
  deleteResume,
  getResumeForDelete,
  setResumeStatus,
} from "@/server/repositories/careers/resume-repository";
import { removeResumeFile, uploadResumeFile } from "@/server/lib/resume-storage";
import { resumeRateLimiter } from "@/server/lib/rate-limit";
import { NotFoundError, RateLimitedError, ValidationError } from "@/server/lib/errors";
import { clientIp, failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import { logger } from "@/server/lib/logger";
import { resumeFieldsSchema, resumeIdSchema, resumeReviewSchema } from "@/lib/schemas/careers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "careers_action_failed";
const ok = (): ApiResult<null> => ({ success: true, data: null, meta: { requestId: requestId() } });

/**
 * The public Careers form. Anyone may send a résumé, so it is checked hard: a hidden field that bots
 * fill, a limit per visitor, the file's real type read from its bytes, a size cap, and a storage path
 * the server chooses (never the sender's file name). The file goes to a private bucket and is only ever
 * opened by staff.
 */
export async function submitResumeAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  // A bot that fills the hidden field is answered as if it worked, and nothing is stored.
  const trap = formData.get("website");
  if (typeof trap === "string" && trap.trim() !== "") return ok();

  const parsed = resumeFieldsSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? undefined,
    position: formData.get("position"),
    message: formData.get("message") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the highlighted fields.", parsed.error);

  let storagePath: string | null = null;
  try {
    const ip = await clientIp();
    const { allowed } = await resumeRateLimiter.consume(`resume:${ip}`);
    if (!allowed) {
      throw new RateLimitedError("You have sent several résumés recently. Please try again later.");
    }

    const file = formData.get("resume");
    if (!(file instanceof File)) throw new ValidationError("Choose your résumé file.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkResumeUpload({ size: file.size, fileName: file.name, bytes });
    if (!check.ok) throw new ValidationError(check.message);

    storagePath = `resumes/${randomUUID()}.${check.extension}`;
    await uploadResumeFile(storagePath, Buffer.from(bytes), check.contentType);
    await createResume({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      position: parsed.data.position,
      message: parsed.data.message ?? null,
      fileName: cleanFileName(file.name),
      storagePath,
      fileSize: file.size,
      contentType: check.contentType,
    });
    logger.info("resume_received", { position: parsed.data.position, kind: check.extension });
    revalidatePath("/admin/resumes");
    return ok();
  } catch (error) {
    // A file already stored for a row that never got written would be an orphan nobody can find.
    if (storagePath) await removeResumeFile(storagePath).catch(() => undefined);
    return failureFrom(TAG, error, "Could not send your résumé. Please try again.");
  }
}

export async function updateResumeStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("career:manage");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to manage résumés.");
  }
  const parsed = resumeReviewSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);

  try {
    const updated = await setResumeStatus(parsed.data.id, parsed.data.status, session.userId);
    if (updated === 0) throw new NotFoundError("Résumé not found.");
    await recordAudit({
      actorId: session.userId,
      action: "RESUME_STATUS_CHANGED",
      entityType: "resume_submissions",
      entityId: parsed.data.id,
      after: { status: parsed.data.status },
    });
    revalidatePath("/admin/resumes");
    return ok();
  } catch (error) {
    return failureFrom(TAG, error, "Could not update the résumé.");
  }
}

/** Removes the file and the row for good: a résumé holds personal data and should not be kept longer than needed. */
export async function deleteResumeAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("career:manage");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to manage résumés.");
  }
  const parsed = resumeIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);

  try {
    const row = await getResumeForDelete(parsed.data.id);
    if (!row) throw new NotFoundError("Résumé not found.");
    // The file first: if removing it fails, the row stays so the file is never left without an owner.
    await removeResumeFile(row.storagePath);
    await deleteResume(row.id);
    await recordAudit({
      actorId: session.userId,
      action: "RESUME_DELETED",
      entityType: "resume_submissions",
      entityId: row.id,
      after: { position: row.position },
    });
    revalidatePath("/admin/resumes");
    return ok();
  } catch (error) {
    return failureFrom(TAG, error, "Could not delete the résumé.");
  }
}
