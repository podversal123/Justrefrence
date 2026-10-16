import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { dayRangeBounds } from "@/lib/day-range";
import type { CommissionStatus } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export interface CreateCommissionInput {
  orderId: string;
  beneficiaryMemberId: string;
  level: number;
  ruleId: string;
  qualifyingEvent: "ORDER_COMPLETED";
  calculationBasis:
    "PERCENT_OF_ORDER" | "PERCENT_OF_VENDOR_SALE" | "PERCENT_OF_PLATFORM_FEE" | "FIXED";
  calculationBaseAmount: bigint;
  rateBpsSnapshot: number | null;
  rateFixedSnapshot: bigint | null;
  amount: bigint;
}

/** The `@@unique([orderId, beneficiaryMemberId, level])` constraint is the real guard; this is a cheap pre-check to fail fast with a clear message instead of a raw Prisma P2002. */
export async function findExistingCommission(
  tx: Tx,
  orderId: string,
  beneficiaryMemberId: string,
  level: number,
) {
  return tx.commission.findUnique({
    where: { orderId_beneficiaryMemberId_level: { orderId, beneficiaryMemberId, level } },
  });
}

export async function createCommission(tx: Tx, input: CreateCommissionInput) {
  return tx.commission.create({
    data: { ...input, status: "PENDING" },
  });
}

export async function createCommissionStatusHistory(
  tx: Tx,
  input: {
    commissionId: string;
    fromStatus: CommissionStatus | null;
    toStatus: CommissionStatus;
    actorId: string | null;
    reason?: string | null;
  },
) {
  return tx.commissionStatusHistory.create({ data: input });
}

export async function updateCommissionStatus(
  tx: Tx,
  commissionId: string,
  status: CommissionStatus,
  releaseAt?: Date | null,
) {
  return tx.commission.update({
    where: { id: commissionId },
    data: { status, ...(releaseAt !== undefined ? { releaseAt } : {}) },
  });
}

export async function listCommissionsForOrder(orderId: string) {
  return prisma.commission.findMany({ where: { orderId }, orderBy: { level: "asc" } });
}

export interface CommissionListQuery {
  status?: CommissionStatus;
  cursor?: string;
  limit: number;
}

export async function listCommissionsForBeneficiary(
  beneficiaryMemberId: string,
  query: CommissionListQuery,
) {
  const rows = await prisma.commission.findMany({
    where: { beneficiaryMemberId, ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: {
      order: {
        select: { id: true, orderNumber: true, vendor: { select: { businessName: true } } },
      },
      rule: { select: { id: true, level: true, rateBasis: true } },
    },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Grouped net totals per status — the read-side "balance" projection, always re-derivable from the ledger. See docs/adr/0002. */
export async function getCommissionSummary(beneficiaryMemberId: string) {
  const grouped = await prisma.commission.groupBy({
    by: ["status"],
    where: { beneficiaryMemberId },
    _sum: { amount: true },
    _count: true,
  });
  return grouped.map((g) => ({
    status: g.status,
    totalAmount: g._sum.amount ?? 0n,
    count: g._count,
  }));
}

/** For the release cron — ELIGIBLE commissions whose release window has elapsed. */
export async function findCommissionsPastReleaseAt(now: Date = new Date()) {
  return prisma.commission.findMany({
    where: { status: "ELIGIBLE", releaseAt: { lte: now } },
  });
}

export type EarningsKind = "direct" | "indirect";

export interface EarningsFilter {
  kind?: EarningsKind;
  from?: string;
  to?: string;
}

/** Direct = the member's own referrals (level 1). Indirect = everyone further down (level 2 and up). */
function earningsWhere(beneficiaryMemberId: string, filter: EarningsFilter) {
  const createdAt = dayRangeBounds(filter.from, filter.to);
  return {
    beneficiaryMemberId,
    ...(filter.kind === "direct" ? { level: 1 } : {}),
    ...(filter.kind === "indirect" ? { level: { gte: 2 } } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
  };
}

const EARNINGS_PAGE_SIZE = 25;

export async function listEarnings(
  beneficiaryMemberId: string,
  filter: EarningsFilter & { cursor?: string },
) {
  const rows = await prisma.commission.findMany({
    where: earningsWhere(beneficiaryMemberId, filter),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: EARNINGS_PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      level: true,
      amount: true,
      status: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
    },
  });
  const hasMore = rows.length > EARNINGS_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, EARNINGS_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/**
 * Totals for the dates chosen. Reversed and cancelled commissions are not earnings, so they are left out;
 * `received` is what has already reached the wallet (AVAILABLE), `pending` is still waiting to be released.
 */
export async function getEarningsTotals(
  beneficiaryMemberId: string,
  filter: Pick<EarningsFilter, "from" | "to">,
) {
  const grouped = await prisma.commission.groupBy({
    by: ["level", "status"],
    where: earningsWhere(beneficiaryMemberId, filter),
    _sum: { amount: true },
  });
  const totals = { direct: 0n, indirect: 0n, received: 0n, pending: 0n };
  for (const row of grouped) {
    if (row.status === "REVERSED" || row.status === "CANCELLED") continue;
    const amount = row._sum.amount ?? 0n;
    if (row.level === 1) totals.direct += amount;
    else totals.indirect += amount;
    if (row.status === "AVAILABLE") totals.received += amount;
    else totals.pending += amount;
  }
  return { ...totals, total: totals.direct + totals.indirect };
}

// --- Staff view: every member's commissions in one place (the "View referral income" item of the admin panel).

export interface StaffCommissionFilter {
  search?: string | undefined;
  status?: CommissionStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

function staffCommissionWhere(filter: StaffCommissionFilter): Prisma.CommissionWhereInput {
  const search = filter.search?.trim();
  const createdAt = dayRangeBounds(filter.from, filter.to);
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    ...(search
      ? {
          OR: [
            { order: { orderNumber: { contains: search, mode: "insensitive" } } },
            { beneficiary: { memberId: { contains: search, mode: "insensitive" } } },
            { beneficiary: { user: { email: { contains: search, mode: "insensitive" } } } },
            { beneficiary: { user: { fullName: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

export async function listCommissionsForStaff(
  filter: StaffCommissionFilter & { cursor?: string | undefined },
) {
  const rows = await prisma.commission.findMany({
    where: staffCommissionWhere(filter),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: EARNINGS_PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      level: true,
      amount: true,
      status: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
      beneficiary: {
        select: { memberId: true, user: { select: { id: true, fullName: true, email: true } } },
      },
    },
  });
  const hasMore = rows.length > EARNINGS_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, EARNINGS_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Totals for the filter chosen. Reversed and cancelled commissions are shown apart, never counted as earned. */
export async function getStaffCommissionTotals(filter: StaffCommissionFilter) {
  const grouped = await prisma.commission.groupBy({
    by: ["status"],
    where: staffCommissionWhere(filter),
    _sum: { amount: true },
  });
  const totals = { paidToWallets: 0n, waiting: 0n, cancelled: 0n };
  for (const row of grouped) {
    const amount = row._sum.amount ?? 0n;
    if (row.status === "AVAILABLE") totals.paidToWallets += amount;
    else if (row.status === "REVERSED" || row.status === "CANCELLED") totals.cancelled += amount;
    else totals.waiting += amount;
  }
  return { ...totals, earned: totals.paidToWallets + totals.waiting };
}
