// No "server-only" import — orchestration layer; every dependency below
// already carries its own "server-only" guard (payment-repository.ts is
// the one exception, for the same reason wallet-repository.ts is — see
// its own doc comment). Same precedent as checkout-service.ts (Phase 5).
import { prisma } from "@/server/lib/prisma";
import {
  createPayment,
  getPaymentByIdempotencyKey,
  getPaymentByProviderOrderId,
  listPaymentsForCheckout,
  tryCapturePayment,
  tryMarkPaymentFailed,
  tryMarkPaymentRefunded,
} from "@/server/repositories/payment/payment-repository";
import {
  createPaymentEvent,
  findEventByProviderEventId,
} from "@/server/repositories/payment/payment-event-repository";
import { createPaymentTransaction } from "@/server/repositories/payment/payment-transaction-repository";
import {
  createRazorpayOrder,
  createRazorpayRefund,
  getRazorpayKeySecret,
  getRazorpayWebhookSecret,
} from "@/server/lib/razorpay-client";
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/server/domain/payment/razorpay-signature";
import { transitionOrderStatusBySystem } from "@/server/domain/commerce/order-service";
import { recordAudit } from "@/server/domain/audit/record";
import { logger } from "@/server/lib/logger";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

/** Every order under a checkout, summed — one Razorpay order per checkout, not per vendor-order. See ADR-0016. */
export async function getCheckoutPayableAmount(
  checkoutId: string,
): Promise<{ amount: bigint; currency: string }> {
  const orders = await prisma.order.findMany({
    where: { checkoutId },
    select: { grandTotal: true, currency: true },
  });
  if (orders.length === 0) {
    throw new NotFoundError("No orders found for this checkout.");
  }
  return {
    amount: orders.reduce((sum, o) => sum + o.grandTotal, 0n),
    currency: orders[0]!.currency,
  };
}

export interface CreatePaymentOrderResult {
  paymentId: string;
  providerOrderId: string;
  amount: bigint;
  currency: string;
  keyId: string | null;
}

/**
 * Step 1 of the flow in the Phase 8 brief: Order(s) already exist (Phase
 * 5) → this creates the "Payment Order" (a Razorpay order + our own
 * `Payment` row). Idempotent on `idempotencyKey` (duplicate-submit safe)
 * and refuses to create a second payable order once the checkout already
 * has a CAPTURED payment (duplicate-payment safe).
 */
export async function createPaymentOrderForCheckout(
  checkoutId: string,
  payerId: string,
  idempotencyKey: string,
): Promise<CreatePaymentOrderResult> {
  // Ownership: only the buyer who placed this checkout may pay for it.
  const checkout = await prisma.checkout.findUnique({
    where: { id: checkoutId },
    select: { buyerId: true },
  });
  if (!checkout || checkout.buyerId !== payerId) {
    throw new NotFoundError("Checkout not found.");
  }

  const scopedKey = scopedIdempotencyKey("payment-order", payerId, idempotencyKey);
  const toResult = (p: {
    id: string;
    providerOrderId: string;
    amount: bigint;
    currency: string;
  }) => ({
    paymentId: p.id,
    providerOrderId: p.providerOrderId,
    amount: p.amount,
    currency: p.currency,
    keyId: process.env["RAZORPAY_KEY_ID"] ?? null,
  });

  const existing = await getPaymentByIdempotencyKey(scopedKey);
  if (existing) {
    if (existing.checkoutId !== checkoutId) {
      throw new ConflictError(
        "This request id was already used for a different checkout. Refresh and try again.",
      );
    }
    return toResult(existing);
  }

  const priorPayments = await listPaymentsForCheckout(checkoutId);
  if (priorPayments.some((p) => p.status === "CAPTURED")) {
    throw new ConflictError("This checkout has already been paid for.");
  }

  const { amount, currency } = await getCheckoutPayableAmount(checkoutId);
  if (amount <= 0n) {
    throw new ValidationError("Nothing to pay for this checkout.");
  }

  // Key-independent guard: an unpaid Razorpay order for this checkout and
  // amount is reused rather than minting another one per fresh key.
  const openPayment = priorPayments.find(
    (p) => p.status === "CREATED" && p.amount === amount && p.currency === currency,
  );
  if (openPayment) return toResult(openPayment);

  const razorpayOrder = await createRazorpayOrder({
    amountPaise: amount,
    currency,
    receipt: checkoutId,
  });

  let payment;
  try {
    payment = await createPayment({
      checkoutId,
      payerId,
      purpose: "ORDER",
      providerOrderId: razorpayOrder.id,
      amount,
      currency,
      idempotencyKey: scopedKey,
    });
  } catch (error) {
    // Concurrent same-key request won the unique index — answer with its
    // payment (the extra, never-paid Razorpay order we just made is inert).
    if (isUniqueConstraintViolation(error)) {
      const winner = await getPaymentByIdempotencyKey(scopedKey);
      if (winner && winner.checkoutId === checkoutId) return toResult(winner);
    }
    throw error;
  }

  await recordAudit({
    actorId: payerId,
    action: "PAYMENT_ORDER_CREATED",
    entityType: "payments",
    entityId: payment.id,
    after: { checkoutId, providerOrderId: razorpayOrder.id, amount: amount.toString() },
  });

  return {
    paymentId: payment.id,
    providerOrderId: razorpayOrder.id,
    amount,
    currency,
    keyId: process.env["RAZORPAY_KEY_ID"] ?? null,
  };
}

async function markCheckoutOrdersPaid(checkoutId: string | null): Promise<void> {
  if (!checkoutId) return;
  const orders = await prisma.order.findMany({
    where: { checkoutId },
    select: { id: true, status: true },
  });
  for (const order of orders) {
    if (order.status !== "PLACED") continue; // already moved on (e.g. admin manually marked it) — don't fight that
    try {
      await transitionOrderStatusBySystem(order.id, "PAID", "Payment captured");
    } catch (error) {
      logger.error("mark_order_paid_failed", {
        orderId: order.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function finalizeCapture(
  payment: { id: string; checkoutId: string | null; amount: bigint },
  providerPaymentId: string,
): Promise<boolean> {
  const captured = await prisma.$transaction(async (tx) => {
    const applied = await tryCapturePayment(tx, payment.id, providerPaymentId);
    if (applied) {
      await createPaymentTransaction(tx, {
        paymentId: payment.id,
        type: "CAPTURE",
        amount: payment.amount,
        providerReference: providerPaymentId,
      });
    }
    return applied;
  });

  if (captured) {
    await recordAudit({
      actorId: null,
      action: "PAYMENT_CAPTURED",
      entityType: "payments",
      entityId: payment.id,
      after: { providerPaymentId, amount: payment.amount.toString() },
    });
    await markCheckoutOrdersPaid(payment.checkoutId);
  }

  return captured;
}

export interface VerifyCheckoutCallbackInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

/**
 * Step 3's synchronous path: the browser's checkout.js success callback.
 * The signature is cryptographically verified — this is NOT "trusting the
 * frontend," it's trusting Razorpay's own HMAC, which the browser cannot
 * forge. An invalid signature capture NOTHING. See ADR-0016.
 */
export async function verifyCheckoutCallback(
  input: VerifyCheckoutCallbackInput,
): Promise<{ captured: boolean }> {
  const keySecret = getRazorpayKeySecret();
  const payment = await getPaymentByProviderOrderId(input.providerOrderId);
  if (!payment) {
    throw new NotFoundError("Payment order not found.");
  }

  const valid = keySecret
    ? verifyCheckoutSignature(
        input.providerOrderId,
        input.providerPaymentId,
        input.signature,
        keySecret,
      )
    : input.signature.startsWith("dev_"); // dev-fallback mode (no live credentials) — see razorpay-client.ts

  await prisma
    .$transaction((tx) =>
      createPaymentEvent(tx, {
        provider: "RAZORPAY",
        eventId: `callback:${input.providerPaymentId}`,
        paymentId: payment.id,
        signatureValid: valid,
        rawPayload: { source: "checkout_callback", ...input } as Prisma.InputJsonValue,
        processedAt: valid ? new Date() : null,
      }),
    )
    .catch(() => undefined); // a duplicate callback event id is a harmless, expected no-op — see processWebhookEvent for the authoritative path

  if (!valid) {
    logger.error("payment_callback_invalid_signature", { providerOrderId: input.providerOrderId });
    throw new AuthorizationError("Payment verification failed.");
  }

  const captured = await finalizeCapture(payment, input.providerPaymentId);
  return { captured };
}

export interface WebhookProcessResult {
  accepted: boolean;
  reason?: string;
}

/**
 * Step 3's authoritative, resilient path — server-to-server, immune to a
 * closed browser tab. Idempotent against redelivery via the
 * `(provider, eventId)` unique constraint. An invalid signature is
 * recorded (signatureValid=false) and REJECTED — never finalizes anything.
 */
export async function processWebhookEvent(
  rawBody: string,
  signatureHeader: string | null,
): Promise<WebhookProcessResult> {
  const webhookSecret = getRazorpayWebhookSecret();
  const valid = webhookSecret
    ? Boolean(signatureHeader) && verifyWebhookSignature(rawBody, signatureHeader!, webhookSecret)
    : true; // dev-fallback: no secret configured yet

  let parsed: {
    event?: string;
    payload?: {
      payment?: { entity?: Record<string, unknown> };
      refund?: { entity?: Record<string, unknown> };
    };
  };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { accepted: false, reason: "Malformed payload." };
  }

  const entity = parsed.payload?.payment?.entity ?? parsed.payload?.refund?.entity;
  const eventId = (entity?.["id"] as string | undefined) ?? `unknown:${Date.now()}`;

  const existingEvent = await findEventByProviderEventId("RAZORPAY", eventId);
  if (existingEvent) {
    // Duplicate webhook delivery — Razorpay (like most providers) may
    // redeliver the same event; this is a safe, cheap no-op, not an error.
    return { accepted: true, reason: "duplicate" };
  }

  const providerOrderId = entity?.["order_id"] as string | undefined;
  const payment = providerOrderId ? await getPaymentByProviderOrderId(providerOrderId) : null;

  await prisma.$transaction((tx) =>
    createPaymentEvent(tx, {
      provider: "RAZORPAY",
      eventId,
      paymentId: payment?.id ?? null,
      signatureValid: valid,
      rawPayload: parsed as Prisma.InputJsonValue,
      processedAt: valid ? new Date() : null,
    }),
  );

  if (!valid) {
    logger.error("payment_webhook_invalid_signature", { eventId });
    return { accepted: false, reason: "Invalid signature." };
  }

  if (!payment) {
    logger.error("payment_webhook_unknown_order", { eventId, providerOrderId });
    return { accepted: false, reason: "Unknown payment order." };
  }

  if (parsed.event === "payment.captured") {
    const providerPaymentId = (entity?.["id"] as string | undefined) ?? payment.providerOrderId;
    await finalizeCapture(payment, providerPaymentId);
  } else if (parsed.event === "payment.failed") {
    await markPaymentFailed(payment.id, "Razorpay reported payment.failed");
  }

  return { accepted: true };
}

export async function markPaymentFailed(paymentId: string, reason: string): Promise<boolean> {
  const applied = await prisma.$transaction((tx) => tryMarkPaymentFailed(tx, paymentId));
  if (applied) {
    await recordAudit({
      actorId: null,
      action: "PAYMENT_FAILED",
      entityType: "payments",
      entityId: paymentId,
      after: { reason },
    });
  }
  return applied;
}

/** Marks CREATED payments older than `timeoutMinutes` as FAILED — the "payment timeout" path. */
export async function expireStalePayments(
  timeoutMinutes = 30,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000);
  const stale = await prisma.payment.findMany({
    where: { status: "CREATED", createdAt: { lte: cutoff } },
  });

  let count = 0;
  for (const payment of stale) {
    const applied = await markPaymentFailed(
      payment.id,
      `Timed out after ${timeoutMinutes} minutes`,
    );
    if (applied) count++;
  }
  return count;
}

/** ADMIN/FINANCE-initiated refund — the verified result (not the admin's own session) is what flips the order to REFUNDED. See ADR-0016. */
export async function initiateRefund(paymentId: string, actorId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new NotFoundError("Payment not found.");
  if (payment.status !== "CAPTURED") {
    throw new ConflictError("Only a captured payment can be refunded.");
  }
  if (!payment.providerPaymentId) {
    throw new ValidationError("This payment has no provider payment id to refund.");
  }

  const refund = await createRazorpayRefund({
    providerPaymentId: payment.providerPaymentId,
    amountPaise: payment.amount,
  });

  await prisma.$transaction(async (tx) => {
    const applied = await tryMarkPaymentRefunded(tx, paymentId);
    if (!applied) throw new ConflictError("This payment is no longer refundable.");
    await createPaymentTransaction(tx, {
      paymentId,
      type: "REFUND",
      amount: payment.amount,
      providerReference: refund.id,
    });
  });

  await recordAudit({
    actorId,
    action: "PAYMENT_REFUNDED",
    entityType: "payments",
    entityId: paymentId,
    after: { refundId: refund.id, amount: payment.amount.toString() },
  });

  if (payment.checkoutId) {
    const orders = await prisma.order.findMany({
      where: { checkoutId: payment.checkoutId },
      select: { id: true },
    });
    for (const order of orders) {
      try {
        await transitionOrderStatusBySystem(order.id, "REFUNDED", "Payment refunded");
      } catch (error) {
        logger.error("mark_order_refunded_failed", {
          orderId: order.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
