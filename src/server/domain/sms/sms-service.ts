// No "server-only" import — orchestration layer, same rationale as reward-service.ts
// (its prisma and repository dependencies carry the guard).
import {
  createSmsDraft,
  deleteSmsDraft,
  findActiveMemberByEmail,
  findActiveMembersForSms,
  findMemberByEmailForDraft,
  findSmsBatchStatuses,
  markAllSmsReadForUser,
  markSmsReadForUser,
  queueSmsBatch,
  updateSmsDraft,
  updateSmsMessage,
} from "@/server/repositories/sms/sms-write-repository";
import { sendSms } from "@/server/lib/notification-providers";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";
import { createNotifications } from "@/server/repositories/identity/notification-repository";
import {
  MAX_BULK_RECIPIENTS,
  isRecordedOnly,
  isSendablePhone,
  type SmsAudience,
} from "@/server/domain/sms/rules";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/**
 * Admin SMS. A send first writes one QUEUED row per recipient (the unique batchKey + recipient makes a
 * double submit a no-op), then hands each text to the SMS provider and records what happened. If no real
 * provider is connected the text is only recorded, and every screen says so instead of calling it sent.
 */

const SEND_CHUNK = 20;

export interface Recipient {
  userId: string;
  phone: string;
}

export interface ResolvedRecipients {
  recipients: Recipient[];
  /** Members who matched but have no usable mobile number. */
  skippedNoPhone: number;
}

/** Who a send goes to. Only active members; a group never exceeds MAX_BULK_RECIPIENTS. */
export async function resolveRecipients(
  audience: SmsAudience,
  recipientEmail?: string,
): Promise<ResolvedRecipients> {
  if (audience === "SINGLE") {
    const user = await findActiveMemberByEmail(recipientEmail ?? "");
    if (!user) throw new NotFoundError("No active member has that email address.");
    if (!isSendablePhone(user.phone)) {
      throw new ValidationError("That member has no mobile number on their profile.");
    }
    return { recipients: [{ userId: user.id, phone: user.phone.trim() }], skippedNoPhone: 0 };
  }

  const users = await findActiveMembersForSms(audience === "VENDORS", MAX_BULK_RECIPIENTS + 1);
  if (users.length > MAX_BULK_RECIPIENTS) {
    throw new ValidationError(
      `This would go to more than ${MAX_BULK_RECIPIENTS} people. Send to a smaller group.`,
    );
  }
  const recipients = users
    .filter((u): u is { id: string; phone: string } => isSendablePhone(u.phone))
    .map((u) => ({ userId: u.id, phone: u.phone.trim() }));
  return { recipients, skippedNoPhone: users.length - recipients.length };
}

export interface SendSummary {
  total: number;
  sent: number;
  failed: number;
  skippedNoPhone: number;
  /** True when no real SMS service is connected, so nothing actually reached a phone. */
  recordedOnly: boolean;
  /** False when this was a replay of a send that already happened. */
  created: boolean;
}

export async function sendSmsBatch(
  senderId: string,
  input: {
    audience: SmsAudience;
    recipientEmail?: string;
    body: string;
    idempotencyKey: string;
    draftId?: string;
  },
): Promise<SendSummary> {
  const batchKey = scopedIdempotencyKey("sms", senderId, input.idempotencyKey);

  const replay = await summaryFor(batchKey);
  if (replay) return replay;

  const { recipients, skippedNoPhone } = await resolveRecipients(
    input.audience,
    input.recipientEmail,
  );
  if (recipients.length === 0) {
    throw new ValidationError("None of those members has a mobile number to send to.");
  }

  let rows: { id: string; recipientUserId: string; phone: string }[];
  try {
    rows = await queueSmsBatch({
      batchKey,
      senderId,
      recipients,
      body: input.body,
      draftId: input.draftId,
    });
  } catch (error) {
    // Concurrent same-key submission: the unique index rejected the loser before anything was sent.
    if (isUniqueConstraintViolation(error)) {
      const winner = await summaryFor(batchKey);
      if (winner) return winner;
    }
    throw error;
  }

  const delivered: string[] = [];
  let failed = 0;
  let recordedOnly = false;
  for (let i = 0; i < rows.length; i += SEND_CHUNK) {
    const chunk = rows.slice(i, i + SEND_CHUNK);
    await Promise.all(
      chunk.map(async (row) => {
        try {
          const result = await sendSms({
            to: row.phone,
            template: "admin_message",
            vars: { message: input.body },
          });
          if (isRecordedOnly(result.provider)) recordedOnly = true;
          await updateSmsMessage(row.id, {
            status: result.delivered ? "SENT" : "FAILED",
            provider: result.provider,
            failureReason: result.delivered ? null : "The SMS service did not accept it.",
            sentAt: result.delivered ? new Date() : null,
          });
          if (result.delivered) delivered.push(row.recipientUserId);
          else failed += 1;
        } catch (error) {
          failed += 1;
          logger.error("sms_send_failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          await updateSmsMessage(row.id, {
            status: "FAILED",
            failureReason: "Could not reach the SMS service.",
          }).catch(() => undefined);
        }
      }),
    );
  }

  // The bell is a courtesy: a failure to deliver it never undoes the SMS itself.
  await createNotifications(
    delivered.map((userId) => ({ userId, type: "SMS_RECEIVED", payload: {} })),
  ).catch(() => undefined);

  return {
    total: rows.length,
    sent: delivered.length,
    failed,
    skippedNoPhone,
    recordedOnly,
    created: true,
  };
}

/** The outcome of a send that already happened, rebuilt from its rows (used for replays). */
async function summaryFor(batchKey: string): Promise<SendSummary | null> {
  const rows = await findSmsBatchStatuses(batchKey);
  if (rows.length === 0) return null;
  return {
    total: rows.length,
    sent: rows.filter((r) => r.status === "SENT").length,
    failed: rows.filter((r) => r.status === "FAILED").length,
    skippedNoPhone: 0,
    recordedOnly: rows.some((r) => r.status === "SENT" && isRecordedOnly(r.provider)),
    created: false,
  };
}

export async function saveDraft(
  authorId: string,
  input: { draftId?: string; audience: SmsAudience; recipientEmail?: string; body: string },
) {
  let recipientUserId: string | null = null;
  if (input.audience === "SINGLE") {
    const user = await findMemberByEmailForDraft(input.recipientEmail ?? "");
    if (!user) throw new NotFoundError("No member has that email address.");
    recipientUserId = user.id;
  }
  const data = { audience: input.audience, recipientUserId, body: input.body };

  if (input.draftId) {
    // Ownership is part of the update's own condition, so another admin's draft can't be overwritten.
    const moved = await updateSmsDraft(input.draftId, authorId, data);
    if (moved === 0) throw new NotFoundError("Draft not found.");
    return { id: input.draftId };
  }
  return createSmsDraft({ ...data, authorId });
}

export async function deleteDraft(authorId: string, draftId: string) {
  const removed = await deleteSmsDraft(draftId, authorId);
  if (removed === 0) throw new NotFoundError("Draft not found.");
}

/** A member opens one of their messages. Scoped to the owner, so no one can mark another's. */
export async function markSmsRead(userId: string, smsId: string) {
  await markSmsReadForUser(userId, smsId);
}

export async function markAllSmsRead(userId: string) {
  await markAllSmsReadForUser(userId);
}
