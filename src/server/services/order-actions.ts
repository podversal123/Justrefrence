"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/server/auth/session";
import { authorize } from "@/server/auth/authorize";
import { placeOrder } from "@/server/domain/commerce/checkout-service";
import { transitionOrderStatus, canViewOrder } from "@/server/domain/commerce/order-service";
import { getOrderDetail } from "@/server/repositories/commerce/order-repository";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import { ensureInvoicePdf } from "@/server/domain/commerce/invoice-service";
import { getInvoiceSignedUrl } from "@/server/lib/invoice-storage";
import { placeOrderSchema, updateOrderStatusSchema } from "@/lib/schemas/commerce";
import { AppError, AuthorizationError, NotFoundError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

/**
 * Checkout and order-status Server Actions. See
 * docs/adr/0013-commerce-money-math.md for idempotency, and
 * docs/adr/0008-explicit-state-machines.md for status transitions.
 */

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
  logger.error("order_action_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallback },
    meta: { requestId: requestId() },
  };
}

export async function placeOrderAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("order:create");
  } catch (error) {
    return failureFrom(error, "You don't have permission to place an order.");
  }

  const parsed = placeOrderSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
    couponCode: formData.get("couponCode") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid checkout request." },
      meta: { requestId: requestId() },
    };
  }

  const memberProfile = await getMemberProfileByUserId(session.userId);
  if (!memberProfile) {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Only registered members can place orders." },
      meta: { requestId: requestId() },
    };
  }

  let result;
  try {
    result = await placeOrder(session.userId, memberProfile.id, parsed.data);
  } catch (error) {
    return failureFrom(error, "Could not place your order.");
  }

  revalidatePath("/cart");
  revalidatePath("/orders");
  // Orders exist (PLACED) but aren't paid yet — Phase 8's payment step
  // happens next, keyed to the checkout (one Razorpay payment covers every
  // vendor-order split out of it). See docs/adr/0016-razorpay-payment-integration.md.
  redirect(`/checkout/pay?checkoutId=${result.checkoutId}`);
}

export async function updateOrderStatusAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const session = await getAuthSession();
  if (!session) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = updateOrderStatusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid status update." },
      meta: { requestId: requestId() },
    };
  }

  // No single authorize() permission call gates this one: which transition
  // a caller may trigger depends on BOTH their role AND whether they own
  // this specific order (e.g. CUSTOMER never holds order:update_status at
  // all per docs/rbac.md §4, yet is exactly who's allowed to confirm
  // DELIVERED -> COMPLETED on their own order). transitionOrderStatus()'s
  // resolveActorRole() + assertOrderTransition() is the real gate here —
  // it throws AuthorizationError for an actor with no relationship to the
  // order at all, and ConflictError for an actor who has one but isn't
  // allowed this specific transition.
  try {
    await transitionOrderStatus(
      parsed.data.orderId,
      parsed.data.status,
      { userId: session.userId, roles: session.roles, vendorProfileId: session.vendorProfileId },
      parsed.data.reason,
    );
  } catch (error) {
    return failureFrom(error, "Could not update the order status.");
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function getInvoiceDownloadUrlAction(
  orderId: string,
): Promise<ApiResult<{ url: string }>> {
  const session = await getAuthSession();
  if (!session) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  try {
    const order = await getOrderDetail(orderId);
    if (!order) throw new NotFoundError("Order not found.");

    const canView = canViewOrder(
      { userId: session.userId, roles: session.roles, vendorProfileId: session.vendorProfileId },
      order,
    );
    if (!canView) throw new AuthorizationError("You don't have access to this order's invoice.");

    // Self-healing: if the order's invoice PDF was never stored (the PDF step
    // is non-fatal at checkout), build and store it now.
    const pdfPath = await ensureInvoicePdf(orderId);
    const url = await getInvoiceSignedUrl(pdfPath);
    return { success: true, data: { url }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(error, "Could not retrieve the invoice.");
  }
}
