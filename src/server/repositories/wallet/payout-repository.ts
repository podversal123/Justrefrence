import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PayoutStatus } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export interface CreatePayoutRequestInput {
  walletId: string;
  bankAccountId: string;
  amount: bigint;
  requestedBy: string;
}

export async function createPayoutRequest(tx: Tx, input: CreatePayoutRequestInput) {
  return tx.payoutRequest.create({ data: input });
}

export async function getPayoutRequestById(id: string) {
  return prisma.payoutRequest.findUnique({
    where: { id },
    include: { wallet: true, bankAccount: true, transaction: true },
  });
}

export async function updatePayoutStatus(
  tx: Tx,
  id: string,
  status: PayoutStatus,
  extra?: { approvedBy?: string | null; rejectedReason?: string | null },
) {
  return tx.payoutRequest.update({
    where: { id },
    data: { status, ...(extra ?? {}) },
  });
}

export interface PayoutListQuery {
  status?: PayoutStatus;
  cursor?: string;
  limit: number;
}

export async function listPayoutRequestsForWallet(walletId: string, query: PayoutListQuery) {
  const rows = await prisma.payoutRequest.findMany({
    where: { walletId, ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: { transaction: true },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function listAllPayoutRequests(query: PayoutListQuery) {
  const rows = await prisma.payoutRequest.findMany({
    where: { ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: {
      wallet: { select: { ownerUserId: true } },
      bankAccount: { select: { accountNoMasked: true, ifsc: true } },
      requester: { select: { email: true, fullName: true } },
    },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function createPayoutTransaction(
  tx: Tx,
  input: {
    payoutRequestId: string;
    transferReference: string | null;
    tdsDeducted: bigint;
    netAmount: bigint;
    paidAt: Date;
    recordedBy: string;
  },
) {
  return tx.payoutTransaction.create({ data: input });
}
