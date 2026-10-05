import "server-only";
import { prisma } from "@/server/lib/prisma";
import { buildVendorOrderBy, buildVendorWhere } from "@/server/repositories/vendor-query";
import type { VendorListQuery } from "@/lib/schemas/vendor";

export interface VendorListItem {
  id: string;
  userId: string;
  businessName: string;
  approvalStatus: string;
  createdAt: Date;
  email: string;
  fullName: string | null;
}

export interface VendorListResult {
  items: VendorListItem[];
  nextCursor: string | null;
}

/**
 * Cursor-based pagination — see docs/api.md §4 (never offset-paginate a
 * collection that can grow unbounded).
 */
export async function listVendors(query: VendorListQuery): Promise<VendorListResult> {
  const where = buildVendorWhere(query);
  const orderBy = buildVendorOrderBy(query);

  const rows = await prisma.vendorProfile.findMany({
    where,
    orderBy: [orderBy, { id: "asc" }], // tie-breaker so cursor pagination is stable
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      businessName: true,
      approvalStatus: true,
      createdAt: true,
      user: { select: { email: true, fullName: true } },
    },
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      userId: row.userId,
      businessName: row.businessName,
      approvalStatus: row.approvalStatus,
      createdAt: row.createdAt,
      email: row.user.email,
      fullName: row.user.fullName,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function countVendors(
  query: Pick<VendorListQuery, "search" | "status">,
): Promise<number> {
  return prisma.vendorProfile.count({ where: buildVendorWhere(query) });
}

export async function getVendorDetail(vendorProfileId: string) {
  return prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          createdAt: true,
          userRoles: {
            where: { revokedAt: null },
            select: {
              id: true,
              grantedAt: true,
              role: { select: { id: true, code: true, label: true } },
            },
          },
        },
      },
      approver: { select: { email: true, fullName: true } },
    },
  });
}

export async function getVendorProfileByUserId(userId: string) {
  return prisma.vendorProfile.findUnique({ where: { userId } });
}

/** For admin catalog-creation forms — the picker only offers vendors who can actually sell. */
export async function listApprovedVendors() {
  return prisma.vendorProfile.findMany({
    where: { approvalStatus: "APPROVED" },
    orderBy: { businessName: "asc" },
    select: { id: true, businessName: true },
  });
}
