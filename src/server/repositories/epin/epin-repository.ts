// Deliberately NO "server-only" import — same exception and rationale as
// wallet-repository.ts: tryClaimFreshEpin()'s atomic conditional claim is
// the race-safety property this file needs direct tests for. Its only
// dependency (`@/server/lib/prisma`) still carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { EpinStatus } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export interface CreateEpinInput {
  codeHash: string;
  codeLast4: string;
  planId: string;
  price: bigint;
  generatedBy: string;
  expiresAt: Date | null;
}

export async function createEpin(input: CreateEpinInput) {
  return prisma.epin.create({ data: input });
}

/** The ONLY lookup path at redemption time — by the deterministic hash of the code the member typed in. See ADR-0015. */
export async function findEpinByCodeHash(codeHash: string) {
  return prisma.epin.findUnique({ where: { codeHash } });
}

export async function getEpinById(id: string) {
  return prisma.epin.findUnique({ where: { id }, include: { plan: true, redemption: true } });
}

export interface EpinSearchQuery {
  status?: EpinStatus;
  codeLast4?: string;
  planId?: string;
  cursor?: string;
  limit: number;
}

/** Admin/support "search" — by status/last4/plan, never by the raw code (which is never stored). */
export async function searchEpins(query: EpinSearchQuery) {
  const rows = await prisma.epin.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.codeLast4 ? { codeLast4: query.codeLast4 } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: { plan: { select: { code: true, type: true } }, redemption: true },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function updateEpinStatus(tx: Tx, id: string, status: EpinStatus) {
  return tx.epin.update({ where: { id }, data: { status } });
}

/**
 * Atomic conditional claim — `WHERE status = 'FRESH'` — the redemption
 * equivalent of wallet-repository.ts's conditional debit. Two concurrent
 * redemption attempts against the same e-pin can never both succeed: only
 * the request whose UPDATE commits first sees `status = 'FRESH'`; the
 * second's WHERE no longer matches. See ADR-0015 and epin-service.ts.
 */
export async function tryClaimFreshEpin(tx: Tx, id: string): Promise<boolean> {
  const result = await tx.epin.updateMany({ where: { id, status: "FRESH" }, data: { status: "USED" } });
  return result.count > 0;
}

export async function createRedemption(
  tx: Tx,
  input: { epinId: string; redeemedBy: string; resultingSubscriptionId: string | null },
) {
  return tx.epinRedemption.create({ data: input });
}

export async function findExpiredFreshEpins(now: Date = new Date()) {
  return prisma.epin.findMany({ where: { status: "FRESH", expiresAt: { lte: now } } });
}
