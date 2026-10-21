// Deliberately NO "server-only" import: same exception and rationale as payment-repository.ts. The payment flow
// is tested against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";

/** Only who placed a checkout, to decide whether someone may pay for it. */
export function findCheckoutBuyer(checkoutId: string) {
  return prisma.checkout.findUnique({ where: { id: checkoutId }, select: { buyerId: true } });
}

/** A checkout, only if it belongs to this buyer. */
export function findOwnedCheckout(checkoutId: string, buyerId: string) {
  return prisma.checkout.findFirst({ where: { id: checkoutId, buyerId }, select: { id: true } });
}

/** The amounts of every order under a checkout (one payment covers them all). */
export function findCheckoutOrderTotals(checkoutId: string) {
  return prisma.order.findMany({
    where: { checkoutId },
    select: { grandTotal: true, currency: true },
  });
}

export function findCheckoutOrderStatuses(checkoutId: string) {
  return prisma.order.findMany({ where: { checkoutId }, select: { id: true, status: true } });
}

export function findCheckoutOrderIds(checkoutId: string) {
  return prisma.order.findMany({ where: { checkoutId }, select: { id: true } });
}

export function findPaymentById(id: string) {
  return prisma.payment.findUnique({ where: { id } });
}

/** The captured payment of a checkout, if there is one. */
export function findCapturedPayment(checkoutId: string) {
  return prisma.payment.findFirst({
    where: { checkoutId, status: "CAPTURED" },
    select: { id: true },
  });
}

/** Payments still waiting for the gateway since before `cutoff`. */
export function findStaleCreatedPayments(cutoff: Date) {
  return prisma.payment.findMany({ where: { status: "CREATED", createdAt: { lte: cutoff } } });
}

export function findWalletBalance(userId: string) {
  return prisma.wallet.findUnique({ where: { ownerUserId: userId }, select: { balance: true } });
}
