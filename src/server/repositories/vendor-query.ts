import type { Prisma } from "@/generated/prisma/client";
import type { VendorListQuery } from "@/lib/schemas/vendor";

/**
 * Pure query-building logic — deliberately no "server-only" import and no
 * Prisma client instantiation, so the search/filter/sort logic is
 * unit-testable without a database (tests/unit/vendor-query.test.ts). The
 * actual Prisma calls live in vendor-repository.ts, which imports these.
 */

export function buildVendorWhere(
  query: Pick<VendorListQuery, "search" | "status">,
): Prisma.VendorProfileWhereInput {
  const where: Prisma.VendorProfileWhereInput = {};

  if (query.status) {
    where.approvalStatus = query.status;
  }

  if (query.search && query.search.length > 0) {
    where.OR = [
      { businessName: { contains: query.search, mode: "insensitive" } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
      { user: { fullName: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

export function buildVendorOrderBy(
  query: Pick<VendorListQuery, "sortBy" | "sortDir">,
): Prisma.VendorProfileOrderByWithRelationInput {
  return { [query.sortBy]: query.sortDir };
}
