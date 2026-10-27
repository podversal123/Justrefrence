import "server-only";
import { prisma } from "@/server/lib/prisma";

/**
 * One primary payout account per user in this phase — see profile UI.
 * Explicit `select`: callers only ever need masked/display fields, never the
 * encrypted account-number ciphertext or internal ids like `verifiedBy` —
 * without this, those leak into the Server→Client Component RSC payload for
 * any page that passes this result as a prop (see security audit finding).
 */
const DISPLAY_SELECT = {
  id: true,
  accountHolderName: true,
  accountType: true,
  accountNoMasked: true,
  ifsc: true,
  branchAddress: true,
  verifiedAt: true,
} as const;

/** The newest saved account: the one payouts and the wallet use. */
export async function getBankAccount(userId: string) {
  return prisma.bankAccount.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: DISPLAY_SELECT,
  });
}

/** Every saved account, newest first, for the Profile → Bank list. */
export async function listBankAccounts(userId: string) {
  return prisma.bankAccount.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: DISPLAY_SELECT,
  });
}

/** Soft-deletes one of the caller's own accounts (bank details are audited, never hard-deleted). */
export async function removeBankAccount(userId: string, bankAccountId: string) {
  const result = await prisma.bankAccount.updateMany({
    where: { id: bankAccountId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

/** Admin-only KYC check — marks the member's current bank account verified. */
export async function verifyBankAccount(bankAccountId: string, verifiedBy: string) {
  return prisma.bankAccount.update({
    where: { id: bankAccountId },
    data: { verifiedAt: new Date(), verifiedBy },
  });
}

export interface AddBankAccountInput {
  userId: string;
  accountType: "SAVINGS" | "CURRENT";
  accountHolderName: string;
  accountNoEncrypted: Buffer;
  accountNoMasked: string;
  ifsc: string;
  branchAddress: string | null;
}

/**
 * Adds an account alongside the ones already saved. Returns false when this account number is
 * already on file. The row is unique per user and masked number, so a previously removed one is
 * brought back, unverified (a re-added account must be re-checked by admin, per
 * docs/database-tables.md's `verified_at`/`verified_by` fields).
 */
export async function addBankAccount(input: AddBankAccountInput) {
  const data = {
    accountType: input.accountType,
    accountHolderName: input.accountHolderName,
    accountNoEncrypted: new Uint8Array(input.accountNoEncrypted),
    accountNoMasked: input.accountNoMasked,
    ifsc: input.ifsc,
    branchAddress: input.branchAddress,
  };
  return prisma.$transaction(async (tx) => {
    const same = await tx.bankAccount.findUnique({
      where: {
        userId_accountNoMasked: { userId: input.userId, accountNoMasked: input.accountNoMasked },
      },
    });
    if (same && same.deletedAt === null) return false;
    if (same) {
      await tx.bankAccount.update({
        where: { id: same.id },
        data: { ...data, deletedAt: null, verifiedAt: null, verifiedBy: null, createdAt: new Date() },
      });
    } else {
      await tx.bankAccount.create({ data: { userId: input.userId, ...data } });
    }
    return true;
  });
}
