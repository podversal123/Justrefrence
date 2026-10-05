"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { getAuthSession } from "@/server/auth/session";
import {
  createMessage,
  getMessage,
  markMessageRead,
} from "@/server/repositories/support/message-repository";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { prisma } from "@/server/lib/prisma";
import { sendMessageSchema } from "@/lib/schemas/support";
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

    const message = await createMessage({
      fromUserId: session.userId,
      toUserId,
      toStaff: !isStaff,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });
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
      after: { toStaff: !isStaff, toUserId },
    });
    revalidatePath("/messages");
    return { success: true, data: { messageId: message.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not send your message.");
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
