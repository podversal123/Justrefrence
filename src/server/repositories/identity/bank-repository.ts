import "server-only";
import { prisma } from "@/server/lib/prisma";

/**
 * One primary payout account per user in this phase — see profile UI.
 * Explicit `select`: callers only ever need masked/display fields, never the
 * encrypted account-number ciphertext or internal ids like `verifiedBy` —
 * without this, those leak into the Server→Client Component RSC payload for
 * any page that passes this result as a prop (see security audit finding).
 */
export async function getBankAccount(userId: string) {
  return prisma.bankAccount.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      accountHolderName: true,
      accountNoMasked: true,
      ifsc: true,
      branchAddress: true,
      verifiedAt: true,
    },
  });
}

/** Admin-only KYC check — marks the member's current bank account verified. */
export async function verifyBankAccount(bankAccountId: string, verifiedBy: string) {
  return prisma.bankAccount.update({
    where: { id: bankAccountId },
    data: { verifiedAt: new Date(), verifiedBy },
  });
}

export interface UpsertBankAccountInput {
  userId: string;
  accountHolderName: string;
  accountNoEncrypted: Buffer;
  accountNoMasked: string;
  ifsc: string;
  branchAddress: string | null;
}

/**
 * Replacing a bank account resets verification (a changed account number
 * must be re-checked by admin, per docs/database-tables.md's
 * `verified_at`/`verified_by` fields) — soft-deletes the old row rather than
 * editing it in place, since bank details are audited on every add/remove
 * (docs/security.md §7).
 */
export async function upsertBankAccount(input: UpsertBankAccountInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.bankAccount.findFirst({
      where: { userId: input.userId, deletedAt: null },
    });
    if (existing) {
      await tx.bankAccount.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    }
    return tx.bankAccount.create({
      data: {
        userId: input.userId,
        accountHolderName: input.accountHolderName,
        accountNoEncrypted: new Uint8Array(input.accountNoEncrypted),
        accountNoMasked: input.accountNoMasked,
        ifsc: input.ifsc,
        branchAddress: input.branchAddress,
      },
    });
  });
}
