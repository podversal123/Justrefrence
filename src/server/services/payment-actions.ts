"use server";

import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/server/auth/session";
import { authorize } from "@/server/auth/authorize";
import {
  createPaymentOrderForCheckout,
  initiateRefund,
  verifyCheckoutCallback,
} from "@/server/domain/payment/payment-service";
import {
  createPaymentOrderSchema,
  initiateRefundSchema,
  verifyCheckoutCallbackSchema,
} from "@/lib/schemas/payment";
import { AppError, RateLimitedError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { paymentOrderRateLimiter } from "@/server/lib/rate-limit";
import type { ApiResult } from "@/lib/api-response";

function requestId() {
  return crypto.randomUUID();
}

function failureFrom(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): ApiResult<never> {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      meta: { requestId: requestId() },
    };
  }
  logger.error("payment_action_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallback },
    meta: { requestId: requestId() },
  };
}

export async function createPaymentOrderAction(
  _prevState: unknown,
  formData: FormData,
): Promise<
  ApiResult<{
    paymentId: string;
    providerOrderId: string;
    amountPaise: string;
    currency: string;
    keyId: string | null;
  }>
> {
  const session = await getAuthSession();
  if (!session) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const rateLimit = await paymentOrderRateLimiter.consume(`user:${session.userId}`);
  if (!rateLimit.allowed) {
    return failureFrom(
      new RateLimitedError("Too many payment attempts. Please wait a few minutes and try again."),
    );
  }

  const parsed = createPaymentOrderSchema.safeParse({
    checkoutId: formData.get("checkoutId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid payment request." },
      meta: { requestId: requestId() },
    };
  }

  try {
    const result = await createPaymentOrderForCheckout(
      parsed.data.checkoutId,
      session.userId,
      parsed.data.idempotencyKey,
    );
    return {
      success: true,
      data: {
        paymentId: result.paymentId,
        providerOrderId: result.providerOrderId,
        amountPaise: result.amount.toString(),
        currency: result.currency,
        keyId: result.keyId,
      },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(error, "Could not start payment for this checkout.");
  }
}

export async function verifyPaymentCallbackAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ captured: boolean }>> {
  const session = await getAuthSession();
  if (!session) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = verifyCheckoutCallbackSchema.safeParse({
    providerOrderId: formData.get("providerOrderId"),
    providerPaymentId: formData.get("providerPaymentId"),
    signature: formData.get("signature"),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid payment confirmation." },
      meta: { requestId: requestId() },
    };
  }

  try {
    const result = await verifyCheckoutCallback(parsed.data);
    revalidatePath("/orders");
    return { success: true, data: result, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(error, "Could not verify your payment.");
  }
}

export async function initiateRefundAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("payment:read"); // baseline gate; refund itself is ADMIN/FINANCE via the UI route, enforced below
  } catch (error) {
    return failureFrom(error, "You don't have permission to process refunds.");
  }

  if (!session.roles.some((r) => ["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(r))) {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Only admin or finance staff may issue a refund." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = initiateRefundSchema.safeParse({ paymentId: formData.get("paymentId") });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid refund request." },
      meta: { requestId: requestId() },
    };
  }

  try {
    await initiateRefund(parsed.data.paymentId, session.userId);
  } catch (error) {
    return failureFrom(error, "Could not process this refund.");
  }

  revalidatePath("/admin/payments");
  return { success: true, data: null, meta: { requestId: requestId() } };
}
