import { describe, expect, it } from "vitest";
import { verifyCheckoutSignature, verifyWebhookSignature } from "@/server/domain/payment/razorpay-signature";
import { createHmac } from "node:crypto";

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

describe("verifyCheckoutSignature", () => {
  it("verifies a correctly computed signature", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const signature = createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

    expect(verifyCheckoutSignature(orderId, paymentId, signature, KEY_SECRET)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const signature = createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

    expect(verifyCheckoutSignature(orderId, "pay_different", signature, KEY_SECRET)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const signature = createHmac("sha256", "wrong_secret").update(`${orderId}|${paymentId}`).digest("hex");

    expect(verifyCheckoutSignature(orderId, paymentId, signature, KEY_SECRET)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifyCheckoutSignature("order_1", "pay_1", "short", KEY_SECRET)).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  it("verifies a correctly computed webhook signature over the raw body", () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { foo: "bar" } });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

    expect(verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)).toBe(true);
  });

  it("rejects when the body was modified after signing (even by whitespace)", () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");

    expect(verifyWebhookSignature(`${rawBody} `, signature, WEBHOOK_SECRET)).toBe(false);
  });

  it("rejects a signature computed with the wrong webhook secret", () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });
    const signature = createHmac("sha256", "wrong_secret").update(rawBody).digest("hex");

    expect(verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)).toBe(false);
  });
});
