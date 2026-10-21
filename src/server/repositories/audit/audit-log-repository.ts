import "server-only";
import { prisma } from "@/server/lib/prisma";

/** The newest audit entries with the actor's email, for the Super Admin's audit-log page. */
export function listRecentAuditEntries(limit = 50) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { email: true } } },
  });
}
