import "server-only";
import { logger } from "@/server/lib/logger";

/**
 * Thin fetch()-based Razorpay REST client — see
 * docs/adr/0016-razorpay-payment-integration.md for why this isn't the
 * `razorpay` npm SDK. Falls back to a clearly-logged synthetic response
 * when credentials are absent (this environment's placeholder-only
 * .env.local), the same dev-fallback pattern already established for
 * MSG91/Resend (src/server/lib/notification-providers.ts) — never silently
 * treated as a real successful payment.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function getCredentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret || keyId === "REPLACE_ME" || keySecret === "REPLACE_ME") return null;
  return { keyId, keySecret };
}

export function getRazorpayKeySecret(): string | null {
  return getCredentials()?.keySecret ?? null;
}

export function getRazorpayWebhookSecret(): string | null {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  return secret && secret !== "REPLACE_ME" ? secret : null;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/** amountPaise — Razorpay's API also takes the smallest currency unit, so no conversion happens here. */
export async function createRazorpayOrder(input: {
  amountPaise: bigint;
  currency: string;
  receipt: string;
}): Promise<RazorpayOrder> {
  const credentials = getCredentials();

  if (!credentials) {
    const fallbackId = `order_dev_${input.receipt}`;
    logger.info("razorpay_dev_fallback_create_order", { receipt: input.receipt, amount: input.amountPaise.toString() });
    return { id: fallbackId, amount: Number(input.amountPaise), currency: input.currency, status: "created" };
  }

  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: Number(input.amountPaise),
      currency: input.currency,
      receipt: input.receipt,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("razorpay_create_order_failed", { status: response.status, body });
    throw new Error(`Razorpay order creation failed (${response.status}).`);
  }

  return (await response.json()) as RazorpayOrder;
}

export interface RazorpayRefund {
  id: string;
  amount: number;
  status: string;
}

export async function createRazorpayRefund(input: {
  providerPaymentId: string;
  amountPaise: bigint;
}): Promise<RazorpayRefund> {
  const credentials = getCredentials();

  if (!credentials || input.providerPaymentId.startsWith("pay_dev_")) {
    const fallbackId = `rfnd_dev_${input.providerPaymentId}`;
    logger.info("razorpay_dev_fallback_refund", { providerPaymentId: input.providerPaymentId });
    return { id: fallbackId, amount: Number(input.amountPaise), status: "processed" };
  }

  const response = await fetch(`${RAZORPAY_API_BASE}/payments/${input.providerPaymentId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ amount: Number(input.amountPaise) }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("razorpay_refund_failed", { status: response.status, body });
    throw new Error(`Razorpay refund failed (${response.status}).`);
  }

  return (await response.json()) as RazorpayRefund;
}
