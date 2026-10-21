// Orchestration layer, same convention as registration-service.ts: no "server-only" import here,
// every dependency below already carries its own guard.
import { Prisma } from "@/generated/prisma/client";
import type { ChangeEntityType } from "@/generated/prisma/enums";
import { runInTransaction } from "@/server/repositories/transaction";
import {
  approvePendingChangeRequest,
  createChangeRequest,
  findChangeRequestById,
  findChangeReviewerIds,
  rejectPendingChangeRequest,
} from "@/server/repositories/approvals/change-request-repository";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { recordAudit } from "@/server/domain/audit/record";
import { getChangeHandler, ENTITY_LABELS } from "@/server/domain/approvals/handlers";
import {
  buildDiff,
  findConflicts,
  pendingKey,
  type DiffEntry,
  type FieldValues,
} from "@/server/domain/approvals/diff";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

export type SubmitResult = { mode: "APPLIED" } | { mode: "SUBMITTED"; requestId: string };

/** People who can approve changes: whoever holds the `change:review` permission through an active role. */
async function reviewerUserIds(): Promise<string[]> {
  return findChangeReviewerIds(50);
}

async function notifySafely(
  userId: string,
  type: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  try {
    await createNotification({ userId, type, payload });
  } catch (error) {
    // The change itself is saved; a missed notification must not undo it.
    logger.error("approval_notification_failed", { type, message: String(error) });
  }
}

/**
 * An edit to a record. A person who may apply changes directly (a Super Admin) changes the record
 * at once. Anyone else (an Admin) files a request: the record stays exactly as it is until a
 * Super Admin approves. Only fields whose value really changes are kept, and there can be only one
 * pending request per record.
 */
export async function submitChange(input: {
  entityType: ChangeEntityType;
  entityId: string;
  /** The values the person wants. Fields that are not changed can be included; they are ignored. */
  proposed: FieldValues;
  actorId: string;
  canApplyDirect: boolean;
  note?: string | undefined;
}): Promise<SubmitResult> {
  const handler = getChangeHandler(input.entityType);
  const snapshot = await handler.load(input.entityId);
  if (!snapshot) throw new NotFoundError(`${ENTITY_LABELS[input.entityType]} not found.`);

  const fullProposed: FieldValues = { ...snapshot.raw, ...input.proposed };
  const [currentDisplay, proposedDisplay] = await Promise.all([
    handler.display(snapshot.raw),
    handler.display(fullProposed),
  ]);
  const diff = buildDiff(handler.fields, currentDisplay, proposedDisplay);
  if (diff.length === 0) throw new ValidationError("You did not change anything.");

  const changed: FieldValues = Object.fromEntries(
    diff.map((d) => [d.field, fullProposed[d.field] ?? null]),
  );

  if (input.canApplyDirect) {
    await runInTransaction((tx) => handler.apply(tx, input.entityId, changed));
    await recordAudit({
      actorId: input.actorId,
      action: "CHANGE_APPLIED",
      entityType: "change_requests",
      entityId: input.entityId,
      after: { record: input.entityType, fields: diff.map((d) => d.field) },
    });
    return { mode: "APPLIED" };
  }

  let request;
  try {
    request = await createChangeRequest({
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: snapshot.label,
      pendingKey: pendingKey(input.entityType, input.entityId),
      proposed: changed as Prisma.InputJsonValue,
      diff: diff as unknown as Prisma.InputJsonValue,
      requestedBy: input.actorId,
      requestNote: input.note ?? null,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(
        "A change to this record is already waiting for approval. A Super Admin needs to decide on it first.",
      );
    }
    throw error;
  }

  await recordAudit({
    actorId: input.actorId,
    action: "CHANGE_REQUESTED",
    entityType: "change_requests",
    entityId: request.id,
    after: { record: input.entityType, recordId: input.entityId, fields: diff.map((d) => d.field) },
  });

  const payload = { record: ENTITY_LABELS[input.entityType], name: snapshot.label };
  await Promise.all(
    (await reviewerUserIds())
      .filter((id) => id !== input.actorId)
      .map((id) => notifySafely(id, "CHANGE_REQUESTED", payload)),
  );

  return { mode: "SUBMITTED", requestId: request.id };
}

/**
 * Approve or reject a pending request. Approving applies the change in the same transaction that
 * marks the request approved, and is refused if someone changed those fields in the meantime.
 * Nobody decides on their own request.
 */
export async function reviewChange(input: {
  requestId: string;
  reviewerId: string;
  decision: "APPROVE" | "REJECT";
  note?: string | undefined;
}): Promise<void> {
  const request = await findChangeRequestById(input.requestId);
  if (!request) throw new NotFoundError("Request not found.");
  if (request.status !== "PENDING")
    throw new ConflictError("This request has already been decided.");
  if (request.requestedBy === input.reviewerId) {
    throw new AuthorizationError("You can't decide on your own request.");
  }

  const handler = getChangeHandler(request.entityType);
  const diff = request.diff as unknown as DiffEntry[];
  const proposed = request.proposed as unknown as FieldValues;
  const decided = {
    reviewedBy: input.reviewerId,
    reviewedAt: new Date(),
    reviewNote: input.note ?? null,
    pendingKey: null,
  };

  if (input.decision === "REJECT") {
    const flipped = await rejectPendingChangeRequest(request.id, decided);
    if (flipped === 0) throw new ConflictError("This request has already been decided.");
  } else {
    const snapshot = await handler.load(request.entityId);
    if (!snapshot) {
      throw new ValidationError("That record no longer exists, so the change cannot be applied.");
    }
    const conflicts = findConflicts(diff, await handler.display(snapshot.raw));
    if (conflicts.length > 0) {
      throw new ConflictError(
        `${conflicts.join(", ")} changed after this request was made. Reject it and ask for a fresh one.`,
      );
    }
    await runInTransaction(async (tx) => {
      const flipped = await approvePendingChangeRequest(tx, request.id, decided);
      if (flipped === 0) throw new ConflictError("This request has already been decided.");
      await handler.apply(tx, request.entityId, proposed);
    });
  }

  await recordAudit({
    actorId: input.reviewerId,
    action: input.decision === "APPROVE" ? "CHANGE_APPROVED" : "CHANGE_REJECTED",
    entityType: "change_requests",
    entityId: request.id,
    after: {
      record: request.entityType,
      recordId: request.entityId,
      fields: diff.map((d) => d.field),
    },
  });

  await notifySafely(
    request.requestedBy,
    input.decision === "APPROVE" ? "CHANGE_APPROVED" : "CHANGE_REJECTED",
    {
      record: ENTITY_LABELS[request.entityType],
      name: request.entityLabel,
      note: input.note ?? null,
    },
  );
}
