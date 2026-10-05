import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { ResolvedDateRange } from "@/server/domain/dashboard/date-range";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";

/**
 * Admin dashboard aggregation queries — every widget's number comes from
 * here, nothing is hardcoded or estimated. Grouped loosely by widget so
 * dashboard-service.ts can fetch them all in parallel.
 */

function dateWhere(range: ResolvedDateRange) {
  return range.from ? { gte: range.from, lte: range.to } : { lte: range.to };
}

// --- Members ---

export async function countTotalMembers(): Promise<number> {
  return prisma.memberProfile.count();
}

export async function countActiveMembers(): Promise<number> {
  return prisma.memberProfile.count({ where: { user: { status: "ACTIVE" } } });
}

// --- Vendors ---

export async function getVendorCounts(): Promise<{ total: number; approved: number; pending: number }> {
  const [total, approved, pending] = await Promise.all([
    prisma.vendorProfile.count(),
    prisma.vendorProfile.count({ where: { approvalStatus: "APPROVED" } }),
    prisma.vendorProfile.count({ where: { approvalStatus: "PENDING" } }),
  ]);
  return { total, approved, pending };
}

// --- Catalog ---

export async function getCatalogCounts(): Promise<{
  products: { total: number; active: number };
  services: { total: number; active: number };
  projects: { total: number; active: number };
}> {
  const [productTotal, productActive, serviceTotal, serviceActive, projectTotal, projectActive] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null, approvalStatus: "APPROVED", isActive: true } }),
    prisma.service.count({ where: { deletedAt: null } }),
    prisma.service.count({ where: { deletedAt: null, approvalStatus: "APPROVED", isActive: true } }),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: null, approvalStatus: "APPROVED", isActive: true } }),
  ]);
  return {
    products: { total: productTotal, active: productActive },
    services: { total: serviceTotal, active: serviceActive },
    projects: { total: projectTotal, active: projectActive },
  };
}

/**
 * Vendor-scoped sibling of getCatalogCounts() above — same
 * total-vs-active-and-approved shape, but counted through the catalog
 * repository's `scopeToVendorId` option (see registry.ts) instead of a raw
 * prisma.<model>.count(), so a vendor's dashboard can never see another
 * vendor's numbers. Used by the vendor dashboard's catalog stat tiles.
 */
export async function getVendorCatalogCounts(vendorId: string): Promise<{
  products: { total: number; active: number };
  services: { total: number; active: number };
  projects: { total: number; active: number };
}> {
  const [productTotal, productActive, serviceTotal, serviceActive, projectTotal, projectActive] = await Promise.all([
    getCatalogRepository("PRODUCT").count({}, { scopeToVendorId: vendorId }),
    getCatalogRepository("PRODUCT").count({ approvalStatus: "APPROVED", isActive: true }, { scopeToVendorId: vendorId }),
    getCatalogRepository("SERVICE").count({}, { scopeToVendorId: vendorId }),
    getCatalogRepository("SERVICE").count({ approvalStatus: "APPROVED", isActive: true }, { scopeToVendorId: vendorId }),
    getCatalogRepository("PROJECT").count({}, { scopeToVendorId: vendorId }),
    getCatalogRepository("PROJECT").count({ approvalStatus: "APPROVED", isActive: true }, { scopeToVendorId: vendorId }),
  ]);
  return {
    products: { total: productTotal, active: productActive },
    services: { total: serviceTotal, active: serviceActive },
    projects: { total: projectTotal, active: projectActive },
  };
}

export async function countPendingListingApprovals(): Promise<number> {
  const [products, services, projects] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null, approvalStatus: "PENDING" } }),
    prisma.service.count({ where: { deletedAt: null, approvalStatus: "PENDING" } }),
    prisma.project.count({ where: { deletedAt: null, approvalStatus: "PENDING" } }),
  ]);
  return products + services + projects;
}

// --- Orders & revenue ---

const REVENUE_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export async function getOrderCountsByStatus(range: ResolvedDateRange) {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: dateWhere(range) },
    _count: true,
  });
  return grouped.map((g) => ({ status: g.status, count: g._count }));
}

export async function getTotalOrders(range: ResolvedDateRange): Promise<number> {
  return prisma.order.count({ where: { createdAt: dateWhere(range) } });
}

export async function getTotalRevenue(range: ResolvedDateRange): Promise<bigint> {
  const result = await prisma.order.aggregate({
    where: { createdAt: dateWhere(range), status: { in: [...REVENUE_STATUSES] } },
    _sum: { grandTotal: true },
  });
  return result._sum?.grandTotal ?? 0n;
}

/** Revenue grouped by UTC day — the revenue-trend chart's series. Raw SQL: Prisma's groupBy can't truncate a timestamp to a day. */
export async function getDailyRevenue(range: ResolvedDateRange): Promise<{ day: string; amount: bigint }[]> {
  const from = range.from ?? new Date(0);
  const rows = await prisma.$queryRaw<{ day: string; amount: bigint }[]>`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           COALESCE(SUM(grand_total), 0)::bigint AS amount
    FROM orders
    WHERE created_at >= ${from} AND created_at <= ${range.to}
      AND status IN ('PAID','PROCESSING','SHIPPED','DELIVERED','COMPLETED')
    GROUP BY 1
    ORDER BY 1
  `;
  return rows;
}

export interface RecentOrderRow {
  id: string;
  orderNumber: string | null;
  status: string;
  grandTotal: bigint;
  createdAt: Date;
  buyerEmail: string;
  vendorBusinessName: string;
}

export interface OrderListQuery {
  search?: string;
  status?: string;
  cursor?: string;
  limit: number;
}

export async function listRecentOrders(query: OrderListQuery) {
  const where = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: "insensitive" as const } },
            { buyer: { email: { contains: query.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      orderNumber: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      buyer: { select: { email: true } },
      vendor: { select: { businessName: true } },
    },
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    items: page.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      status: r.status,
      grandTotal: r.grandTotal,
      createdAt: r.createdAt,
      buyerEmail: r.buyer.email,
      vendorBusinessName: r.vendor.businessName,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Every order matching the current filters, unpaginated — for CSV export. Capped so one export can't take down the request. */
export async function listAllMatchingOrders(query: Pick<OrderListQuery, "search" | "status">, cap = 5000) {
  const where = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: "insensitive" as const } },
            { buyer: { email: { contains: query.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  return prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: cap,
    select: {
      orderNumber: true,
      status: true,
      grandTotal: true,
      currency: true,
      createdAt: true,
      buyer: { select: { email: true } },
      vendor: { select: { businessName: true } },
    },
  });
}

// --- Payouts ---

export async function getPendingPayouts(): Promise<{ count: number; amount: bigint }> {
  const result = await prisma.payoutRequest.aggregate({
    where: { status: "REQUESTED" },
    _count: true,
    _sum: { amount: true },
  });
  return { count: result._count, amount: result._sum.amount ?? 0n };
}

// --- Wallet activity ---

export async function getDailyWalletActivity(range: ResolvedDateRange): Promise<{ day: string; credits: bigint; debits: bigint }[]> {
  const from = range.from ?? new Date(0);
  const rows = await prisma.$queryRaw<{ day: string; direction: string; amount: bigint }[]>`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           direction,
           COALESCE(SUM(amount), 0)::bigint AS amount
    FROM wallet_transactions
    WHERE created_at >= ${from} AND created_at <= ${range.to}
    GROUP BY 1, 2
    ORDER BY 1
  `;

  const byDay = new Map<string, { day: string; credits: bigint; debits: bigint }>();
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { day: row.day, credits: 0n, debits: 0n };
    if (row.direction === "CREDIT") entry.credits = row.amount;
    else entry.debits = row.amount;
    byDay.set(row.day, entry);
  }
  return [...byDay.values()];
}

// --- Referral activity ---

export async function getReferralActivityCount(range: ResolvedDateRange): Promise<number> {
  return prisma.referralRelationship.count({ where: { changedAt: dateWhere(range) } });
}

// --- Commissions ---

export async function getGlobalCommissionSummary(): Promise<{ status: string; totalAmount: bigint; count: number }[]> {
  const grouped = await prisma.commission.groupBy({ by: ["status"], _sum: { amount: true }, _count: true });
  return grouped.map((g) => ({ status: g.status, totalAmount: g._sum.amount ?? 0n, count: g._count }));
}

// --- Pending approvals table (vendors + listings combined) ---

export interface PendingApprovalRow {
  id: string;
  kind: "VENDOR" | "PRODUCT" | "SERVICE" | "PROJECT";
  title: string;
  submittedAt: Date;
}

export async function listPendingApprovals(limit = 20): Promise<PendingApprovalRow[]> {
  const [vendors, products, services, projects] = await Promise.all([
    prisma.vendorProfile.findMany({
      where: { approvalStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, businessName: true, createdAt: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null, approvalStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.service.findMany({
      where: { deletedAt: null, approvalStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, approvalStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, createdAt: true },
    }),
  ]);

  const rows: PendingApprovalRow[] = [
    ...vendors.map((v) => ({ id: v.id, kind: "VENDOR" as const, title: v.businessName, submittedAt: v.createdAt })),
    ...products.map((p) => ({ id: p.id, kind: "PRODUCT" as const, title: p.title, submittedAt: p.createdAt })),
    ...services.map((s) => ({ id: s.id, kind: "SERVICE" as const, title: s.title, submittedAt: s.createdAt })),
    ...projects.map((p) => ({ id: p.id, kind: "PROJECT" as const, title: p.title, submittedAt: p.createdAt })),
  ];

  return rows.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()).slice(0, limit);
}
