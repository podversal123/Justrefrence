import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { KycDocumentStatus, KycDocumentType } from "@/generated/prisma/enums";

const PAGE_SIZE = 30;

const OWNER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  memberProfile: { select: { memberId: true, pan: true } },
  vendorProfile: { select: { businessName: true, pan: true } },
} as const;

export function listDocumentsForOwner(ownerUserId: string) {
  return prisma.kycDocument.findMany({
    where: { ownerUserId },
    select: {
      id: true,
      type: true,
      status: true,
      originalName: true,
      rejectedReason: true,
      createdAt: true,
      reviewedAt: true,
    },
    orderBy: { type: "asc" },
  });
}

export function findDocumentByOwnerAndType(ownerUserId: string, type: KycDocumentType) {
  return prisma.kycDocument.findUnique({
    where: { ownerUserId_type: { ownerUserId, type } },
  });
}

export function getDocumentWithOwner(id: string) {
  return prisma.kycDocument.findUnique({
    where: { id },
    include: { owner: { select: OWNER_SELECT } },
  });
}

/** Admin review queue, oldest first so nobody waits forever. Keyset-paginated. */
export async function listDocumentsForReview(filter: {
  status: KycDocumentStatus;
  cursor?: string;
}) {
  const rows = await prisma.kycDocument.findMany({
    where: { status: filter.status },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { owner: { select: OWNER_SELECT } },
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function countDocumentsByStatus() {
  const rows = await prisma.kycDocument.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<KycDocumentStatus, number>
  >;
}
