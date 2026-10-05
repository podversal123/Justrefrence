import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CommissionStatus } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export interface CreateCommissionInput {
  orderId: string;
  beneficiaryMemberId: string;
  level: number;
  ruleId: string;
  qualifyingEvent: "ORDER_COMPLETED";
  calculationBasis: "PERCENT_OF_ORDER" | "PERCENT_OF_VENDOR_SALE" | "PERCENT_OF_PLATFORM_FEE" | "FIXED";
  calculationBaseAmount: bigint;
  rateBpsSnapshot: number | null;
  rateFixedSnapshot: bigint | null;
  amount: bigint;
}

/** The `@@unique([orderId, beneficiaryMemberId, level])` constraint is the real guard; this is a cheap pre-check to fail fast with a clear message instead of a raw Prisma P2002. */
export async function findExistingCommission(tx: Tx, orderId: string, beneficiaryMemberId: string, level: number) {
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

export async function listCommissionsForBeneficiary(beneficiaryMemberId: string, query: CommissionListQuery) {
  const rows = await prisma.commission.findMany({
    where: { beneficiaryMemberId, ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: {
      order: { select: { id: true, orderNumber: true, vendor: { select: { businessName: true } } } },
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
