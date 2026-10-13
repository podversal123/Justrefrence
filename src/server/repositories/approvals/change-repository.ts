import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { ChangeEntityType, ChangeRequestStatus } from "@/generated/prisma/enums";

const PAGE_SIZE = 30;

const WITH_PEOPLE = {
  requester: { select: { fullName: true, email: true } },
  reviewer: { select: { fullName: true, email: true } },
} as const;

/** The request waiting on this record, if any: shown as a banner on the record itself. */
export function findPendingFor(entityType: ChangeEntityType, entityId: string) {
  return prisma.changeRequest.findFirst({
    where: { entityType, entityId, status: "PENDING" },
    select: {
      id: true,
      createdAt: true,
      requester: { select: { fullName: true, email: true } },
    },
  });
}

/**
 * Requests for the approvals screen. A reviewer sees everyone's; anyone else sees only their own
 * (`ownOnly`). Oldest pending first so nothing waits forever; decided ones newest first.
 */
export async function listChanges(filter: {
  status: ChangeRequestStatus;
  ownOnlyUserId?: string;
  cursor?: string;
}) {
  const rows = await prisma.changeRequest.findMany({
    where: {
      status: filter.status,
      ...(filter.ownOnlyUserId ? { requestedBy: filter.ownOnlyUserId } : {}),
    },
    orderBy:
      filter.status === "PENDING"
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ reviewedAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: WITH_PEOPLE,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function countChangesByStatus(ownOnlyUserId?: string) {
  const rows = await prisma.changeRequest.groupBy({
    by: ["status"],
    where: ownOnlyUserId ? { requestedBy: ownOnlyUserId } : {},
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<ChangeRequestStatus, number>
  >;
}
