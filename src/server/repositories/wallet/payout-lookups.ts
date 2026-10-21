// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. Payout requests are
// tested against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";

/** What the payout eligibility check needs: the account, the member profile and the chosen bank account. */
export function loadPayoutApplicant(userId: string, bankAccountId: string) {
  return Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.memberProfile.findUnique({ where: { userId } }),
    prisma.bankAccount.findFirst({ where: { id: bankAccountId, userId, deletedAt: null } }),
  ]);
}

export function findLedgerEntryByKey(idempotencyKey: string) {
  return prisma.walletTransaction.findUnique({ where: { idempotencyKey } });
}

export function findPayoutRequestRow(id: string) {
  return prisma.payoutRequest.findUnique({ where: { id } });
}

/** An identical payout still waiting since `since`: the double-click guard. */
export function findRecentOpenPayout(input: {
  walletId: string;
  bankAccountId: string;
  amount: bigint;
  since: Date;
}) {
  return prisma.payoutRequest.findFirst({
    where: {
      walletId: input.walletId,
      bankAccountId: input.bankAccountId,
      amount: input.amount,
      status: "REQUESTED",
      createdAt: { gte: input.since },
    },
    select: { id: true },
  });
}
