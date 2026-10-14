"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import {
  deleteDraft,
  markAllSmsRead,
  markSmsRead,
  saveDraft,
  sendSmsBatch,
  type SendSummary,
} from "@/server/domain/sms/sms-service";
import { composeSmsSchema, draftIdSchema, smsIdSchema } from "@/lib/schemas/sms";
import { recordAudit } from "@/server/domain/audit/record";
import { RateLimitedError } from "@/server/lib/errors";
import { smsRateLimiter } from "@/server/lib/rate-limit";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "sms_action_failed";

function revalidateSms() {
  revalidatePath("/admin/sms");
  revalidatePath("/sms");
}

export type ComposeResult =
  { kind: "draft"; draftId: string } | { kind: "sent"; summary: SendSummary };

/** Sends the SMS now, or saves it as a draft (the second button on the form sets `intent=draft`). */
export async function composeSmsAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<ComposeResult>> {
  let session;
  try {
    session = await authorize("sms:send");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to send SMS.");
  }

  const parsed = composeSmsSchema.safeParse({
    intent: formData.get("intent") || undefined,
    audience: formData.get("audience"),
    recipientEmail: formData.get("recipientEmail") || undefined,
    body: formData.get("body") ?? "",
    draftId: formData.get("draftId") || undefined,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return validationFailure("Check the message below.", parsed.error);
  const input = parsed.data;

  try {
    if (input.intent === "draft") {
      const draft = await saveDraft(session.userId, input);
      await recordAudit({
        actorId: session.userId,
        action: "SMS_DRAFT_SAVED",
        entityType: "sms_drafts",
        entityId: draft.id,
        after: { audience: input.audience },
      });
      revalidateSms();
      return {
        success: true,
        data: { kind: "draft", draftId: draft.id },
        meta: { requestId: requestId() },
      };
    }

    const limit = await smsRateLimiter.consume(`sms:${session.userId}`);
    if (!limit.allowed)
      throw new RateLimitedError("You're sending too many SMS. Please wait a while.");

    const summary = await sendSmsBatch(session.userId, input);
    if (summary.created) {
      await recordAudit({
        actorId: session.userId,
        action: "SMS_SENT",
        entityType: "sms_messages",
        entityId: input.idempotencyKey,
        after: {
          audience: input.audience,
          total: summary.total,
          sent: summary.sent,
          failed: summary.failed,
          recordedOnly: summary.recordedOnly,
        },
      });
    }
    revalidateSms();
    return {
      success: true,
      data: { kind: "sent", summary },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(TAG, error, "Could not send the SMS.");
  }
}

export async function deleteDraftAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("sms:send");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to send SMS.");
  }
  const parsed = draftIdSchema.safeParse({ draftId: formData.get("draftId") });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);
  try {
    await deleteDraft(session.userId, parsed.data.draftId);
    revalidateSms();
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not delete the draft.");
  }
}

export async function markSmsReadAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("sms:read");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to read SMS.");
  }
  const parsed = smsIdSchema.safeParse({ smsId: formData.get("smsId") });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);
  try {
    await markSmsRead(session.userId, parsed.data.smsId);
    revalidatePath("/sms");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not update that message.");
  }
}

export async function markAllSmsReadAction(): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("sms:read");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to read SMS.");
  }
  try {
    await markAllSmsRead(session.userId);
    revalidatePath("/sms");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not update your messages.");
  }
}
