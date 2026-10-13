import "server-only";
import { prisma } from "@/server/lib/prisma";
import { dayRangeBounds } from "@/lib/day-range";

/**
 * Read model for the admin "TDS list": one row per payout that has actually been paid, where
 * TDS is recorded (PayoutTransaction.tdsDeducted). Nothing here writes; the amounts were fixed
 * when the payout was marked paid.
 *
 * gross = payout request amount, net = what was transferred, tds = gross - net.
 */

const PAGE_SIZE = 50;
/** Hard cap for one downloaded report; the caller is told when the data was cut off. */
export const TDS_EXPORT_MAX_ROWS = 10_000;

export interface TdsFilter {
  from?: string;
  to?: string;
}

function whereFor(filter: TdsFilter) {
  const paidAt = dayRangeBounds(filter.from, filter.to);
  return { paidAt: { not: null, ...paidAt } };
}

const SELECT = {
  id: true,
  paidAt: true,
  tdsDeducted: true,
  netAmount: true,
  transferReference: true,
  payoutRequest: {
    select: {
      amount: true,
      requester: {
        select: {
          fullName: true,
          email: true,
          memberProfile: { select: { memberId: true, pan: true } },
        },
      },
    },
  },
} as const;

export async function listTdsRecords(filter: TdsFilter & { cursor?: string }) {
  const rows = await prisma.payoutTransaction.findMany({
    where: whereFor(filter),
    orderBy: [{ paidAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: SELECT,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Totals over the whole filtered range, not just the visible page. */
export async function sumTds(filter: TdsFilter) {
  const result = await prisma.payoutTransaction.aggregate({
    where: whereFor(filter),
    _sum: { tdsDeducted: true, netAmount: true },
    _count: { _all: true },
  });
  const tds = result._sum.tdsDeducted ?? 0n;
  const net = result._sum.netAmount ?? 0n;
  return { count: result._count._all, tds, net, gross: tds + net };
}

export async function listTdsRecordsForExport(filter: TdsFilter) {
  const rows = await prisma.payoutTransaction.findMany({
    where: whereFor(filter),
    orderBy: [{ paidAt: "desc" }, { id: "asc" }],
    take: TDS_EXPORT_MAX_ROWS + 1,
    select: SELECT,
  });
  const truncated = rows.length > TDS_EXPORT_MAX_ROWS;
  return { rows: truncated ? rows.slice(0, TDS_EXPORT_MAX_ROWS) : rows, truncated };
}
