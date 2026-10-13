// Orchestration layer, same convention as registration-service.ts: no "server-only" import here,
// every dependency below already carries its own guard.
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import { uploadKycFile, removeKycFile } from "@/server/lib/kyc-storage";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { recordAudit } from "@/server/domain/audit/record";
import { contentRateLimiter } from "@/server/lib/rate-limit";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { KycDocumentType } from "@/generated/prisma/enums";
import {
  DOCUMENT_LABELS,
  KYC_FILE_KINDS,
  KYC_NOTIFICATION_TYPES,
  allowedDocumentTypes,
  canReviewDocument,
  checkUpload,
  memberKycStatusFrom,
} from "@/server/domain/kyc/rules";

/**
 * Submit a document: validated from its real bytes, stored privately, and the one current
 * document of that type is replaced and sent back to review. Re-uploading is how a rejected
 * document gets fixed.
 */
export async function submitKycDocument(input: {
  ownerUserId: string;
  isVendor: boolean;
  type: KycDocumentType;
  file: File;
}) {
  if (!allowedDocumentTypes({ isVendor: input.isVendor }).includes(input.type)) {
    throw new ValidationError("That document is not needed for your account.");
  }

  const { allowed } = await contentRateLimiter.consume(`kyc:${input.ownerUserId}`);
  if (!allowed) throw new RateLimitedError("Too many uploads. Try again in a while.");

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const check = checkUpload({
    size: input.file.size,
    declaredType: input.file.type,
    bytes,
  });
  if (!check.ok) throw new ValidationError(check.message);

  const { contentType, extension } = KYC_FILE_KINDS[check.kind];
  const storagePath = `${input.ownerUserId}/${input.type.toLowerCase()}/${randomUUID()}.${extension}`;
  await uploadKycFile(storagePath, Buffer.from(bytes), contentType);

  const previous = await prisma.kycDocument.findUnique({
    where: { ownerUserId_type: { ownerUserId: input.ownerUserId, type: input.type } },
    select: { storagePath: true },
  });

  let saved;
  try {
    saved = await prisma.$transaction(async (tx) => {
      const doc = await tx.kycDocument.upsert({
        where: { ownerUserId_type: { ownerUserId: input.ownerUserId, type: input.type } },
        create: {
          ownerUserId: input.ownerUserId,
          type: input.type,
          storagePath,
          originalName: input.file.name.slice(0, 200),
          contentType,
          sizeBytes: input.file.size,
        },
        update: {
          status: "PENDING",
          storagePath,
          originalName: input.file.name.slice(0, 200),
          contentType,
          sizeBytes: input.file.size,
          rejectedReason: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      });
      if (input.type === "PAN_CARD") {
        await tx.memberProfile.updateMany({
          where: { userId: input.ownerUserId },
          data: { kycStatus: memberKycStatusFrom("PENDING") },
        });
      }
      return doc;
    });
  } catch (error) {
    await removeKycFile(storagePath).catch(() => {});
    throw error;
  }

  if (previous && previous.storagePath !== storagePath) {
    await removeKycFile(previous.storagePath).catch((error) =>
      logger.warn("kyc_old_file_not_removed", { message: String(error) }),
    );
  }

  await recordAudit({
    actorId: input.ownerUserId,
    action: "KYC_DOCUMENT_SUBMITTED",
    entityType: "kyc_documents",
    entityId: saved.id,
    after: { type: input.type, replaced: Boolean(previous) },
  });
  return saved;
}

/**
 * Verify or reject a pending document. The status flip is one conditional update, so two
 * reviewers can never both act on the same document. A PAN card can only be verified once the
 * person has typed their PAN number, because that is what the reviewer checks it against.
 */
export async function reviewKycDocument(input: {
  documentId: string;
  reviewerId: string;
  decision: "VERIFY" | "REJECT";
  reason?: string | undefined;
}) {
  const doc = await prisma.kycDocument.findUnique({
    where: { id: input.documentId },
    include: {
      owner: {
        select: {
          id: true,
          memberProfile: { select: { id: true, pan: true } },
          vendorProfile: { select: { pan: true } },
        },
      },
    },
  });
  if (!doc) throw new NotFoundError("Document not found.");
  if (!canReviewDocument({ reviewerId: input.reviewerId, ownerId: doc.ownerUserId })) {
    throw new AuthorizationError("You can't review your own document.");
  }
  if (doc.status !== "PENDING") throw new ConflictError("This document has already been reviewed.");

  if (input.decision === "VERIFY" && doc.type === "PAN_CARD") {
    const panOnFile = doc.owner.memberProfile?.pan ?? doc.owner.vendorProfile?.pan;
    if (!panOnFile) {
      throw new ValidationError(
        "There is no PAN number on file to check this card against. Ask them to add it first.",
      );
    }
  }

  const nextStatus = input.decision === "VERIFY" ? "VERIFIED" : "REJECTED";
  await prisma.$transaction(async (tx) => {
    const flipped = await tx.kycDocument.updateMany({
      where: { id: doc.id, status: "PENDING" },
      data: {
        status: nextStatus,
        rejectedReason: input.decision === "REJECT" ? (input.reason ?? null) : null,
        reviewedBy: input.reviewerId,
        reviewedAt: new Date(),
      },
    });
    if (flipped.count === 0) throw new ConflictError("This document has already been reviewed.");
    if (doc.type === "PAN_CARD" && doc.owner.memberProfile) {
      await tx.memberProfile.update({
        where: { id: doc.owner.memberProfile.id },
        data: { kycStatus: memberKycStatusFrom(nextStatus) },
      });
    }
  });

  try {
    await createNotification({
      userId: doc.ownerUserId,
      type:
        input.decision === "VERIFY"
          ? KYC_NOTIFICATION_TYPES.VERIFIED
          : KYC_NOTIFICATION_TYPES.REJECTED,
      payload: { document: DOCUMENT_LABELS[doc.type], reason: input.reason ?? null },
    });
  } catch (error) {
    // The review itself is done; a missed notification must not undo it.
    logger.error("kyc_notification_failed", { message: String(error) });
  }

  await recordAudit({
    actorId: input.reviewerId,
    action: input.decision === "VERIFY" ? "KYC_DOCUMENT_VERIFIED" : "KYC_DOCUMENT_REJECTED",
    entityType: "kyc_documents",
    entityId: doc.id,
    after: { type: doc.type, ownerUserId: doc.ownerUserId },
  });
}
