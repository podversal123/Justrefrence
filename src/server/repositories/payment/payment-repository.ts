// Deliberately NO "server-only" import — same exception and rationale as
// wallet-repository.ts and epin-repository.ts: tryCapturePayment()'s
// atomic conditional transition is the race-safety/idempotency property
// the Phase 8 brief requires direct tests for (duplicate webhook,
// duplicate payment). Its only dependency (`@/server/lib/prisma`) still
// carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentPurpose, PaymentStatus } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export interface CreatePaymentInput {
  checkoutId: string | null;
  payerId: string;
  purpose: PaymentPurpose;
  providerOrderId: string;
  amount: bigint;
  currency: string;
  idempotencyKey: string;
}

export async function createPayment(input: CreatePaymentInput) {
  return prisma.payment.create({ data: input });
}

export async function getPaymentById(id: string) {
  return prisma.payment.findUnique({ where: { id } });
}

export async function getPaymentByProviderOrderId(providerOrderId: string) {
  return prisma.payment.findFirst({ where: { providerOrderId }, orderBy: { createdAt: "desc" } });
}

export async function getPaymentByIdempotencyKey(idempotencyKey: string) {
  return prisma.payment.findUnique({ where: { idempotencyKey } });
}

export async function listPaymentsForCheckout(checkoutId: string) {
  return prisma.payment.findMany({ where: { checkoutId }, orderBy: { createdAt: "desc" } });
}

/**
 * Atomic conditional transition to CAPTURED — `WHERE status IN
 * ('CREATED','AUTHORIZED')`, so a duplicate webhook delivery or a
 * duplicate client-callback firing twice can never both "win": only the
 * request whose UPDATE commits first sees a capturable status; the second
 * sees `CAPTURED` already and this returns `false` (a safe no-op), never a
 * second capture. See docs/adr/0016.
 */
export async function tryCapturePayment(tx: Tx, paymentId: string, providerPaymentId: string): Promise<boolean> {
  const result = await tx.payment.updateMany({
    where: { id: paymentId, status: { in: ["CREATED", "AUTHORIZED"] } },
    data: { status: "CAPTURED", providerPaymentId },
  });
  return result.count > 0;
}

export async function tryMarkPaymentFailed(tx: Tx, paymentId: string): Promise<boolean> {
  const result = await tx.payment.updateMany({
    where: { id: paymentId, status: { in: ["CREATED", "AUTHORIZED"] } },
    data: { status: "FAILED" },
  });
  return result.count > 0;
}

export async function tryMarkPaymentRefunded(tx: Tx, paymentId: string): Promise<boolean> {
  const result = await tx.payment.updateMany({
    where: { id: paymentId, status: "CAPTURED" },
    data: { status: "REFUNDED" },
  });
  return result.count > 0;
}

export interface PaymentListQuery {
  status?: PaymentStatus;
  cursor?: string;
  limit: number;
}

export async function listPaymentsForPayer(payerId: string, query: PaymentListQuery) {
  const rows = await prisma.payment.findMany({
    where: { payerId, ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}
