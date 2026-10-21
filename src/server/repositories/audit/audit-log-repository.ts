import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** The newest audit entries with the actor's email, for the Super Admin's audit-log page. */
export function listRecentAuditEntries(limit = 50) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { email: true } } },
  });
}

/** The single INSERT into audit_logs. Nothing in this codebase updates or deletes an audit row. */
export function insertAuditLog(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data });
}
