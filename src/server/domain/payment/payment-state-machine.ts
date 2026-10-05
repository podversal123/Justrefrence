/**
 * Pure payment status state machine — see docs/adr/0008-explicit-state-machines.md
 * and docs/adr/0016-razorpay-payment-integration.md. No I/O. The only code
 * path allowed to change `Payment.status` is assertPaymentTransition(),
 * called from payment-service.ts.
 */
import { ConflictError } from "@/server/lib/errors";

export const PAYMENT_STATUSES = ["CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentActorRole = "SYSTEM" | "ADMIN" | "FINANCE";

interface TransitionRule {
  to: PaymentStatus;
  roles: PaymentActorRole[];
}

/**
 * CREATED: the Razorpay order exists, nothing has been paid yet.
 * AUTHORIZED: Razorpay has authorized the charge (seen on some payment
 * methods/webhook sequences) but not yet captured — transient.
 * CAPTURED: money has actually moved — the ONLY status that marks orders
 * PAID. FAILED: the attempt didn't complete (declined, timed out,
 * abandoned). REFUNDED: a captured payment was reversed.
 */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, TransitionRule[]> = {
  CREATED: [
    { to: "AUTHORIZED", roles: ["SYSTEM"] },
    { to: "CAPTURED", roles: ["SYSTEM"] },
    { to: "FAILED", roles: ["SYSTEM", "ADMIN"] },
  ],
  AUTHORIZED: [
    { to: "CAPTURED", roles: ["SYSTEM"] },
    { to: "FAILED", roles: ["SYSTEM", "ADMIN"] },
  ],
  CAPTURED: [{ to: "REFUNDED", roles: ["SYSTEM", "ADMIN", "FINANCE"] }],
  FAILED: [],
  REFUNDED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus, actorRole: PaymentActorRole): boolean {
  const rule = PAYMENT_TRANSITIONS[from].find((r) => r.to === to);
  return rule !== undefined && rule.roles.includes(actorRole);
}

export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
  actorRole: PaymentActorRole,
): PaymentStatus {
  if (!canTransitionPayment(from, to, actorRole)) {
    throw new ConflictError(`Cannot move a payment from ${from} to ${to}.`);
  }
  return to;
}
