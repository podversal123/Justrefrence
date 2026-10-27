import "server-only";
import { prisma } from "@/server/lib/prisma";

/** Where a project's attached document is kept and who owns the project, for the checked download link. */
export function getProjectDocumentInfo(id: string) {
  return prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, vendorId: true, documentPath: true },
  });
}
