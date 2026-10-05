import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentTransactionType } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export async function createPaymentTransaction(
  tx: Tx,
  input: {
    paymentId: string;
    type: PaymentTransactionType;
    amount: bigint;
    providerReference: string | null;
  },
) {
  return tx.paymentTransaction.create({ data: input });
}

export async function listTransactionsForPayment(paymentId: string) {
  return prisma.paymentTransaction.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" } });
}
