"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { getAuthSession } from "@/server/auth/session";
import {
  createMessage,
  deleteDraft,
  getMessage,
  markMessageRead,
  saveDraft,
} from "@/server/repositories/support/message-repository";
import { removeMessageDoc, uploadMessageDoc } from "@/server/lib/message-doc-storage";
import { KYC_FILE_KINDS, checkUpload } from "@/server/domain/kyc/rules";
import { logger } from "@/server/lib/logger";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { prisma } from "@/server/lib/prisma";
import { messageDraftSchema, sendMessageSchema } from "@/lib/schemas/support";
import { recordAudit } from "@/server/domain/audit/record";
import {
  AuthenticationError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@/server/lib/errors";
import { contentRateLimiter } from "@/server/lib/rate-limit";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Internal messaging (workflow doc: Admin to Vendor, Vendor to Admin).
 * "Staff" is anyone holding `member:read:any` (the same marker the admin
 * member screens use). Members/vendors can only write to the team; staff
 * can write to one specific user.
 */

const TAG = "message_action_failed";

export async function sendMessageAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ messageId: string }>> {
  let session;
  try {
    session = await authorize("message:send");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to send messages.");
  }

  const parsed = sendMessageSchema.safeParse({
    toUserId: formData.get("toUserId") || undefined,
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return validationFailure("Check the message fields below.", parsed.error);

  const draftIdRaw = formData.get("draftId");
  const draftId =
    typeof draftIdRaw === "string" && /^[0-9a-f-]{36}$/i.test(draftIdRaw) ? draftIdRaw : null;
  const documentRaw = formData.get("document");
  const document = documentRaw instanceof File && documentRaw.size > 0 ? documentRaw : null;

  let storedPath: string | null = null;
  try {
    const limit = await contentRateLimiter.consume(`message:${session.userId}`);
    if (!limit.allowed)
      throw new RateLimitedError("You've sent a lot of messages recently. Please try again later.");

    const isStaff = session.permissions.has("member:read:any");
    let toUserId: string | null = null;

    if (isStaff) {
      if (!parsed.data.toUserId) throw new ValidationError("Choose who to send this message to.");
      const recipient = await prisma.user.findUnique({
        where: { id: parsed.data.toUserId },
        select: { id: true, status: true },
      });
      if (!recipient || recipient.status === "BLOCKED")
        throw new NotFoundError("That recipient was not found.");
      toUserId = recipient.id;
    }
    // Non-staff: any supplied toUserId is ignored — they can only reach the team.

    // A document goes to the team only, and is checked from its real bytes, never its claimed type.
    let attachment;
    if (document) {
      if (isStaff) throw new ValidationError("Documents can only be sent to the team.");
      const bytes = new Uint8Array(await document.arrayBuffer());
      const check = checkUpload({ size: document.size, declaredType: document.type, bytes });
      if (!check.ok) throw new ValidationError(check.message);
      const { contentType, extension } = KYC_FILE_KINDS[check.kind];
      storedPath = `${session.userId}/${randomUUID()}.${extension}`;
      await uploadMessageDoc(storedPath, Buffer.from(bytes), contentType);
      attachment = {
        storagePath: storedPath,
        fileName: document.name.slice(0, 200),
        contentType,
        sizeBytes: document.size,
      };
    }

    const message = await createMessage(
      {
        fromUserId: session.userId,
        toUserId,
        toStaff: !isStaff,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
      attachment,
    );
    // A sent draft is no longer a draft.
    if (draftId) await deleteDraft(session.userId, draftId).catch(() => false);
    if (toUserId) {
      await createNotification({
        userId: toUserId,
        type: "MESSAGE_RECEIVED",
        payload: { messageId: message.id, subject: parsed.data.subject },
      }).catch(() => undefined);
    }
    await recordAudit({
      actorId: session.userId,
      action: "MESSAGE_SENT",
      entityType: "messages",
      entityId: message.id,
      after: { toStaff: !isStaff, toUserId, hasDocument: Boolean(attachment) },
    });
    revalidatePath("/messages");
    return { success: true, data: { messageId: message.id }, meta: { requestId: requestId() } };
  } catch (error) {
    if (storedPath) {
      await removeMessageDoc(storedPath).catch((e) =>
        logger.warn("message_doc_not_removed", { message: String(e) }),
      );
    }
    return failureFrom(TAG, error, "Could not send your message.");
  }
}

/** Saves a message to the team without sending it, so it can be finished later. */
export async function saveMessageDraftAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ draftId: string }>> {
  let session;
  try {
    session = await authorize("message:send");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to save drafts.");
  }
  // Staff pick a recipient for every message, so drafts are for members and vendors writing to the team.
  if (session.permissions.has("member:read:any")) {
    return failureFrom(TAG, new ValidationError("Drafts are for messages to the team."));
  }

  const parsed = messageDraftSchema.safeParse({
    draftId: formData.get("draftId") || undefined,
    subject: formData.get("subject") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success)
    return validationFailure("Write something before saving a draft.", parsed.error);

  try {
    const draftId = await saveDraft({
      userId: session.userId,
      subject: parsed.data.subject,
      body: parsed.data.body,
      ...(parsed.data.draftId ? { draftId: parsed.data.draftId } : {}),
    });
    if (!draftId) throw new NotFoundError("That draft no longer exists.");
    revalidatePath("/messages");
    return { success: true, data: { draftId }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not save your draft.");
  }
}

export async function deleteMessageDraftAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const session = await getAuthSession();
  if (!session) return failureFrom(TAG, new AuthenticationError("Please sign in again."));
  const draftId = String(formData.get("draftId") ?? "");
  try {
    const removed =
      /^[0-9a-f-]{36}$/i.test(draftId) && (await deleteDraft(session.userId, draftId));
    if (!removed) throw new NotFoundError("That draft no longer exists.");
    revalidatePath("/messages");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not delete that draft.");
  }
}

/** Marks one message read — only its recipient (or staff, for the shared team inbox). */
export async function markMessageReadAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const session = await getAuthSession();
  if (!session) return failureFrom(TAG, new AuthenticationError("Please sign in again."));

  const messageId = String(formData.get("messageId") ?? "");
  try {
    const message = await getMessage(messageId);
    const isStaff = session.permissions.has("member:read:any");
    const canRead =
      message && (message.toUserId === session.userId || (message.toStaff && isStaff));
    if (!message || !canRead) throw new NotFoundError("Message not found.");
    await markMessageRead(message.id);
    revalidatePath("/messages");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not update that message.");
  }
}
