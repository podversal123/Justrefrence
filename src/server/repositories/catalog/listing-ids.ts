import "server-only";
import { prisma } from "@/server/lib/prisma";
import { formatListingId } from "@/server/domain/catalog/listing-id";
import type { CatalogKind } from "@/server/domain/catalog/types";

/**
 * Looks up the public listing ID (PRD-000123 ...) of the items in an order. An order item only stores
 * the kind and id of what was bought; the ID is worked out from the listing's own number, which never
 * changes and whose row is only ever soft-deleted, so it is the same on an old order as on a new one.
 */
export async function resolveListingIds(
  items: readonly { itemType: CatalogKind; itemId: string }[],
): Promise<Map<string, string>> {
  const idsByKind: Record<CatalogKind, string[]> = { PRODUCT: [], SERVICE: [], PROJECT: [] };
  for (const item of items) idsByKind[item.itemType].push(item.itemId);

  const select = { id: true, listingSeq: true } as const;
  const [products, services, projects] = await Promise.all([
    idsByKind.PRODUCT.length
      ? prisma.product.findMany({ where: { id: { in: idsByKind.PRODUCT } }, select })
      : [],
    idsByKind.SERVICE.length
      ? prisma.service.findMany({ where: { id: { in: idsByKind.SERVICE } }, select })
      : [],
    idsByKind.PROJECT.length
      ? prisma.project.findMany({ where: { id: { in: idsByKind.PROJECT } }, select })
      : [],
  ]);

  const result = new Map<string, string>();
  for (const row of products) result.set(row.id, formatListingId("PRODUCT", row.listingSeq));
  for (const row of services) result.set(row.id, formatListingId("SERVICE", row.listingSeq));
  for (const row of projects) result.set(row.id, formatListingId("PROJECT", row.listingSeq));
  return result;
}
