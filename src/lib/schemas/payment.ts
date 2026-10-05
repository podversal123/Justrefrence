import { z } from "zod";

/** Razorpay payment validation — see docs/adr/0016-razorpay-payment-integration.md. */

export const createPaymentOrderSchema = z.object({
  checkoutId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});
export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;

export const verifyCheckoutCallbackSchema = z.object({
  providerOrderId: z.string().trim().min(1),
  providerPaymentId: z.string().trim().min(1),
  signature: z.string().trim().min(1),
});
export type VerifyCheckoutCallbackInput = z.infer<typeof verifyCheckoutCallbackSchema>;

export const initiateRefundSchema = z.object({
  paymentId: z.string().uuid(),
});
export type InitiateRefundInput = z.infer<typeof initiateRefundSchema>;
