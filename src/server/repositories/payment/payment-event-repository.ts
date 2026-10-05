import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function findEventByProviderEventId(provider: string, eventId: string) {
  return prisma.paymentEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
}

export interface CreatePaymentEventInput {
  provider: string;
  eventId: string;
  paymentId: string | null;
  signatureValid: boolean;
  rawPayload: Prisma.InputJsonValue;
  processedAt: Date | null;
}

/**
 * Append-only (ADR-0002) — every signature check this system ever
 * performed, valid or invalid, is inserted here, never silently dropped.
 * The `(provider, eventId)` unique constraint is webhook dedup: Razorpay
 * (like most providers) may redeliver the same event, and this makes a
 * redelivery a cheap, safe no-op rather than reprocessing.
 */
export async function createPaymentEvent(tx: Tx, input: CreatePaymentEventInput) {
  return tx.paymentEvent.create({ data: input });
}

export async function markEventProcessed(tx: Tx, id: string) {
  return tx.paymentEvent.update({ where: { id }, data: { processedAt: new Date() } });
}
