import "server-only";
import { prisma } from "@/server/lib/prisma";

/** Product and service categories whose name contains `query` (case-insensitive), at most `keep` of each, by name. */
export async function findMatchingCategories(query: string, keep: number) {
  const where = { deletedAt: null, name: { contains: query, mode: "insensitive" as const } };
  const [products, services] = await Promise.all([
    prisma.productCategory.findMany({
      where,
      take: keep,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.serviceCategory.findMany({
      where,
      take: keep,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { products, services };
}
