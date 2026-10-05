import type { CatalogListQuery } from "@/server/domain/catalog/types";

/**
 * Pure query-building logic shared by all three catalog kinds — no I/O, no
 * Prisma import, fully unit-testable (tests/unit/catalog-query.test.ts). The
 * repository factory (factory.ts) casts this to the specific
 * `{Model}WhereInput`/`{Model}OrderByWithRelationInput` type for whichever
 * Prisma delegate it's wired to — the three generated types are
 * structurally compatible for every field this function touches, which is
 * exactly why field names were kept identical across models (ADR-0011).
 */

// Deliberately loose — see the module comment above.
export type WhereShape = Record<string, any>;
export type OrderByShape = Record<string, any>;

export interface BuildListingWhereOptions {
  /** When set, restricts results to one vendor's own listings (vendor self-service views). */
  scopeToVendorId?: string;
  /** Public catalog browsing forces APPROVED + isActive regardless of any status filter passed in. */
  publicOnly?: boolean;
}

export function buildListingWhere(
  query: Pick<
    CatalogListQuery,
    "search" | "categoryId" | "subcategoryId" | "approvalStatus" | "isActive" | "vendorId"
  >,
  options: BuildListingWhereOptions = {},
): WhereShape {
  const where: WhereShape = { deletedAt: null };

  const vendorId = options.scopeToVendorId ?? query.vendorId;
  if (vendorId) where.vendorId = vendorId;

  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.subcategoryId) where.subcategoryId = query.subcategoryId;

  if (options.publicOnly) {
    where.approvalStatus = "APPROVED";
    where.isActive = true;
  } else {
    if (query.approvalStatus) where.approvalStatus = query.approvalStatus;
    if (query.isActive !== undefined) where.isActive = query.isActive;
  }

  if (query.search && query.search.length > 0) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export function buildListingOrderBy(
  query: Pick<CatalogListQuery, "sortBy" | "sortDir">,
): OrderByShape {
  return { [query.sortBy]: query.sortDir };
}
