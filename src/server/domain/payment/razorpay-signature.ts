/**
 * Razorpay signature verification — pure, no I/O, no env access (secrets
 * are passed in by the caller; the env-reading wrapper is
 * src/server/lib/razorpay-client.ts). Both signature schemes are
 * HMAC-SHA256, but over different material — see
 * docs/adr/0016-razorpay-payment-integration.md for why BOTH paths are
 * accepted and why neither one is "trusting the frontend."
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * The checkout.js success-callback signature: HMAC-SHA256 of
 * `"{order_id}|{payment_id}"` keyed by RAZORPAY_KEY_SECRET. Verifiable
 * server-side with no trust placed in the browser's "it succeeded" claim —
 * only in Razorpay's own cryptographic signature.
 */
export function verifyCheckoutSignature(
  providerOrderId: string,
  providerPaymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  const expected = hmacHex(keySecret, `${providerOrderId}|${providerPaymentId}`);
  return safeEqualHex(expected, signature);
}

/**
 * The webhook signature: HMAC-SHA256 of the RAW request body (not the
 * parsed JSON — whitespace/key-order changes would break verification)
 * keyed by RAZORPAY_WEBHOOK_SECRET, sent in the `X-Razorpay-Signature` header.
 */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = hmacHex(webhookSecret, rawBody);
  return safeEqualHex(expected, signature);
}
