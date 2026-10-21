// Deliberately NO "server-only" import, unlike every other repository in
// this codebase — the race-safety logic in this specific file (the exact
// conditional WHERE clause, the idempotency pre-check, the ledger-row
// snapshot) IS the safety-critical property the Phase 7 brief requires
// direct tests for, so it needs to be importable from vitest with only
// `@/server/lib/prisma` mocked, not mocked away itself. Same precedent and
// rationale as listing-service.ts (Phase 3): its only dependency
// (`@/server/lib/prisma`) still carries the guard, so nothing here is
// reachable from an actual Client Component bundle.
import { prisma } from "@/server/lib/prisma";
import { dayRangeBounds } from "@/lib/day-range";
import type { Prisma } from "@/generated/prisma/client";
import type { WalletTransactionDirection, WalletTransactionType } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export async function getOrCreateWallet(ownerUserId: string) {
  const existing = await prisma.wallet.findUnique({ where: { ownerUserId } });
  if (existing) return existing;
  return prisma.wallet.create({ data: { ownerUserId } });
}

/** Same as getOrCreateWallet() but scoped to an existing transaction — use when a wallet must exist before another write in the SAME transaction (e.g. crediting it right after). */
export async function getOrCreateWalletTx(tx: Tx, ownerUserId: string) {
  const existing = await tx.wallet.findUnique({ where: { ownerUserId } });
  if (existing) return existing;
  return tx.wallet.create({ data: { ownerUserId } });
}

export async function getWalletByOwner(ownerUserId: string) {
  return prisma.wallet.findUnique({ where: { ownerUserId } });
}

export async function getWalletById(id: string) {
  return prisma.wallet.findUnique({ where: { id } });
}

export interface LedgerEntryInput {
  walletId: string;
  amount: bigint;
  type: WalletTransactionType;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
}

export interface LedgerResult {
  applied: boolean;
  /** Set when applied=false because this idempotencyKey was already used — the EXISTING transaction, not a duplicate. */
  existing?: { id: string; balanceAfter: bigint };
  transaction?: { id: string; balanceAfter: bigint };
}

/**
 * Inserts a ledger row WITHOUT touching `balance`/`pendingBalance` — for
 * the rare case the balance was already moved by a different atomic
 * primitive in the same transaction (e.g. holdForPayout()'s balance ->
 * pendingBalance move) and this call is only recording that fact in the
 * permanent, insert-only ledger. Idempotent the same way creditWallet()/
 * debitWallet() are.
 */
export async function recordLedgerEntry(
  tx: Tx,
  input: LedgerEntryInput & { direction: WalletTransactionDirection },
): Promise<LedgerResult> {
  if (input.amount <= 0n) {
    throw new Error("Ledger entry amount must be positive.");
  }

  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return { applied: false, existing: { id: existing.id, balanceAfter: existing.balanceAfter } };
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: input.walletId } });
  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: input.walletId,
      direction: input.direction,
      amount: input.amount,
      type: input.type,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      balanceAfter: wallet.balance,
    },
  });

  return {
    applied: true,
    transaction: { id: transaction.id, balanceAfter: transaction.balanceAfter },
  };
}

/**
 * Unconditional credit — can never violate the `balance >= 0` invariant.
 * Idempotent: a repeated call with the same idempotencyKey is a no-op that
 * returns the original result instead of crediting twice. See
 * docs/adr/0015-wallet-epin-subscription.md.
 */
export async function creditWallet(tx: Tx, input: LedgerEntryInput): Promise<LedgerResult> {
  if (input.amount <= 0n) {
    throw new Error("Credit amount must be positive.");
  }

  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return { applied: false, existing: { id: existing.id, balanceAfter: existing.balanceAfter } };
  }

  const wallet = await tx.wallet.update({
    where: { id: input.walletId },
    data: { balance: { increment: input.amount } },
  });

  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: input.walletId,
      direction: "CREDIT" as WalletTransactionDirection,
      amount: input.amount,
      type: input.type,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      balanceAfter: wallet.balance,
    },
  });

  return {
    applied: true,
    transaction: { id: transaction.id, balanceAfter: transaction.balanceAfter },
  };
}

/**
 * Atomic conditional debit — `WHERE balance >= amount` so the row Postgres
 * locks for the UPDATE's duration is re-checked at the instant of write,
 * making two concurrent debits against an insufficient balance structurally
 * unable to both succeed. Returns `applied: false` (no row changed, no
 * ledger entry written) rather than throwing, so the caller decides how to
 * present "insufficient balance." Idempotent the same way creditWallet() is.
 */
export async function debitWallet(tx: Tx, input: LedgerEntryInput): Promise<LedgerResult> {
  if (input.amount <= 0n) {
    throw new Error("Debit amount must be positive.");
  }

  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return { applied: false, existing: { id: existing.id, balanceAfter: existing.balanceAfter } };
  }

  const result = await tx.wallet.updateMany({
    where: { id: input.walletId, balance: { gte: input.amount } },
    data: { balance: { decrement: input.amount } },
  });

  if (result.count === 0) {
    return { applied: false };
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: input.walletId } });

  const transaction = await tx.walletTransaction.create({
    data: {
      walletId: input.walletId,
      direction: "DEBIT" as WalletTransactionDirection,
      amount: input.amount,
      type: input.type,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      balanceAfter: wallet.balance,
    },
  });

  return {
    applied: true,
    transaction: { id: transaction.id, balanceAfter: transaction.balanceAfter },
  };
}

/**
 * Debits whatever balance IS currently available, even if less than
 * requested — used only for the commission-reversal claw-back path (Q-07),
 * where a partial recovery plus a visible shortfall is the correct
 * behavior, never a thrown error. Returns the amount actually debited.
 */
export async function debitWalletUpTo(
  tx: Tx,
  input: Omit<LedgerEntryInput, "amount"> & { maxAmount: bigint },
): Promise<{ debited: bigint; transaction?: { id: string; balanceAfter: bigint } }> {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: input.walletId } });
  const debited = wallet.balance < input.maxAmount ? wallet.balance : input.maxAmount;
  if (debited <= 0n) return { debited: 0n };

  const result = await debitWallet(tx, { ...input, amount: debited });
  return { debited, transaction: result.transaction };
}

export interface WalletTransactionListQuery {
  cursor?: string;
  limit: number;
  type?: WalletTransactionType;
}

export async function listWalletTransactions(walletId: string, query: WalletTransactionListQuery) {
  const rows = await prisma.walletTransaction.findMany({
    where: { walletId, ...(query.type ? { type: query.type } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Grouped totals by type — the "account report" read model, always re-derivable from the ledger (ADR-0002). */
export async function getWalletTransactionSummary(walletId: string) {
  const grouped = await prisma.walletTransaction.groupBy({
    by: ["direction", "type"],
    where: { walletId },
    _sum: { amount: true },
    _count: true,
  });
  return grouped.map((g) => ({
    direction: g.direction,
    type: g.type,
    totalAmount: g._sum.amount ?? 0n,
    count: g._count,
  }));
}

/** `null` clears the PIN (staff reset); the member is then asked to set a new one. */
export async function setWalletPinHash(walletId: string, pinHash: string | null) {
  return prisma.wallet.update({ where: { id: walletId }, data: { walletPinHash: pinHash } });
}

/**
 * Moves `amount` from `balance` into `pendingBalance` atomically —
 * earmarks funds for a payout request without letting them be spent twice.
 * Same conditional-WHERE race defense as debitWallet().
 */
export async function holdForPayout(tx: Tx, walletId: string, amount: bigint): Promise<boolean> {
  const result = await tx.wallet.updateMany({
    where: { id: walletId, balance: { gte: amount } },
    data: { balance: { decrement: amount }, pendingBalance: { increment: amount } },
  });
  return result.count > 0;
}

/** Finalizes a hold as PAID — funds leave `pendingBalance` for good, never return to `balance`. */
export async function releaseHoldAsPaid(tx: Tx, walletId: string, amount: bigint): Promise<void> {
  await tx.wallet.update({
    where: { id: walletId },
    data: { pendingBalance: { decrement: amount } },
  });
}

/** Reverses a hold — funds move back from `pendingBalance` into spendable `balance` (payout rejected). */
export async function releaseHoldToBalance(
  tx: Tx,
  walletId: string,
  amount: bigint,
): Promise<void> {
  await tx.wallet.update({
    where: { id: walletId },
    data: { pendingBalance: { decrement: amount }, balance: { increment: amount } },
  });
}

export interface LedgerReportFilter {
  from?: string;
  to?: string;
  direction?: "CREDIT" | "DEBIT";
}

function ledgerWhere(walletId: string, filter: LedgerReportFilter) {
  const createdAt = dayRangeBounds(filter.from, filter.to);
  return {
    walletId,
    ...(filter.direction ? { direction: filter.direction } : {}),
    ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
  };
}

const REPORT_PAGE_SIZE = 50;

/** The member's account report: every ledger entry in the chosen dates, newest first. */
export async function listLedgerReport(
  walletId: string,
  filter: LedgerReportFilter & { cursor?: string },
) {
  const rows = await prisma.walletTransaction.findMany({
    where: ledgerWhere(walletId, filter),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: REPORT_PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > REPORT_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, REPORT_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Totals over the whole filtered range, not just the visible page. */
export async function sumLedgerReport(walletId: string, filter: LedgerReportFilter) {
  const grouped = await prisma.walletTransaction.groupBy({
    by: ["direction"],
    where: ledgerWhere(walletId, filter),
    _sum: { amount: true },
    _count: true,
  });
  const credit = grouped.find((g) => g.direction === "CREDIT");
  const debit = grouped.find((g) => g.direction === "DEBIT");
  return {
    credit: credit?._sum.amount ?? 0n,
    debit: debit?._sum.amount ?? 0n,
    count: (credit?._count ?? 0) + (debit?._count ?? 0),
  };
}

/** One wallet's money in and out per day, for the member dashboard chart. Days with no movement are left out. */
export async function getDailyActivityForWallet(
  walletId: string,
  from: Date,
  to: Date,
): Promise<{ day: string; credits: bigint; debits: bigint }[]> {
  const rows = await prisma.$queryRaw<{ day: string; direction: string; amount: bigint }[]>`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           direction,
           COALESCE(SUM(amount), 0)::bigint AS amount
    FROM wallet_transactions
    WHERE wallet_id = ${walletId}::uuid AND created_at >= ${from} AND created_at <= ${to}
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

/** Whether the member has a wallet PIN, without handing the hash to the caller. */
export async function hasWalletPin(ownerUserId: string): Promise<boolean> {
  const wallet = await prisma.wallet.findUnique({
    where: { ownerUserId },
    select: { walletPinHash: true },
  });
  return wallet?.walletPinHash != null;
}

/** A manual top-up by this admin, of this amount, into this wallet since `since`: the double-click guard. */
export function findRecentManualTopup(input: {
  walletId: string;
  adminUserId: string;
  amount: bigint;
  since: Date;
}) {
  return prisma.walletTransaction.findFirst({
    where: {
      walletId: input.walletId,
      type: "TOPUP",
      referenceType: "MANUAL_TOPUP",
      referenceId: input.adminUserId,
      amount: input.amount,
      createdAt: { gte: input.since },
    },
    select: { id: true },
  });
}

/** A wallet by id; throws when it does not exist. */
export function getWalletByIdOrThrow(id: string) {
  return prisma.wallet.findUniqueOrThrow({ where: { id } });
}
