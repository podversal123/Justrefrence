// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. The KYC flow is
// tested against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { KycDocumentType } from "@/generated/prisma/enums";
import type { Tx } from "@/server/repositories/transaction";

type MemberKycStatus = Prisma.MemberProfileUpdateManyMutationInput["kycStatus"];

/** The stored file of someone's current document of this type, so it can be removed when replaced. */
export function findKycStoragePath(ownerUserId: string, type: KycDocumentType) {
  return prisma.kycDocument.findUnique({
    where: { ownerUserId_type: { ownerUserId, type } },
    select: { storagePath: true },
  });
}

/**
 * Saves a document (a new one, or a re-upload that goes back to pending) and, for the PAN card, moves the
 * member's KYC status with it. One transaction, so the document and the status never disagree.
 */
export function saveKycDocument(input: {
  ownerUserId: string;
  type: KycDocumentType;
  storagePath: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  memberKycStatus: MemberKycStatus;
}) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.kycDocument.upsert({
      where: { ownerUserId_type: { ownerUserId: input.ownerUserId, type: input.type } },
      create: {
        ownerUserId: input.ownerUserId,
        type: input.type,
        storagePath: input.storagePath,
        originalName: input.originalName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      },
      update: {
        status: "PENDING",
        storagePath: input.storagePath,
        originalName: input.originalName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        rejectedReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });
    if (input.type === "PAN_CARD") {
      await tx.memberProfile.updateMany({
        where: { userId: input.ownerUserId },
        data: { kycStatus: input.memberKycStatus },
      });
    }
    return doc;
  });
}

/** A document with what a reviewer needs about its owner (member id and PAN on file). */
export function findKycDocumentForReview(id: string) {
  return prisma.kycDocument.findUnique({
    where: { id },
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
}

/** Decides a document only while it is still pending. Returns how many rows changed. */
export async function decidePendingKycDocument(
  tx: Tx,
  id: string,
  data: Prisma.KycDocumentUncheckedUpdateManyInput,
): Promise<number> {
  const result = await tx.kycDocument.updateMany({ where: { id, status: "PENDING" }, data });
  return result.count;
}

export function setMemberKycStatus(tx: Tx, memberProfileId: string, kycStatus: MemberKycStatus) {
  return tx.memberProfile.update({ where: { id: memberProfileId }, data: { kycStatus } });
}
