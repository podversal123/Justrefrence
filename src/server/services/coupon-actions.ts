"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import {
  createCoupon,
  findCouponByCodeIncludingDeleted,
  setCouponDeleted,
} from "@/server/repositories/commerce/coupon-admin-repository";
import { createCouponSchema, setCouponActiveSchema } from "@/lib/schemas/coupon";
import { recordAudit } from "@/server/domain/audit/record";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "coupon_action_failed";

export async function createCouponAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ couponId: string }>> {
  let session;
  try {
    session = await authorize("coupon:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to create coupons.");
  }

  const parsed = createCouponSchema.safeParse({
    code: formData.get("code"),
    discountType: formData.get("discountType"),
    percent: formData.get("percent") || undefined,
    fixedRupees: formData.get("fixedRupees") || undefined,
    minOrderRupees: formData.get("minOrderRupees") || undefined,
    startsOn: formData.get("startsOn"),
    expiresOn: formData.get("expiresOn") || undefined,
    usageLimit: formData.get("usageLimit") || undefined,
    usageLimitPerMember: formData.get("usageLimitPerMember") || undefined,
  });
  if (!parsed.success) return validationFailure("Check the coupon fields below.", parsed.error);

  try {
    if (await findCouponByCodeIncludingDeleted(parsed.data.code)) {
      throw new ConflictError("A coupon with that code already exists.");
    }
    const coupon = await createCoupon({ ...parsed.data, createdBy: session.userId });
    await recordAudit({
      actorId: session.userId,
      action: "COUPON_CREATED",
      entityType: "coupons",
      entityId: coupon.id,
      after: {
        code: coupon.code,
        discountType: parsed.data.discountType,
        valuePercentBps: parsed.data.valuePercentBps,
        valueFixed: parsed.data.valueFixed?.toString() ?? null,
        minOrderAmount: parsed.data.minOrderAmount.toString(),
      },
    });
    revalidatePath("/admin/coupons");
    revalidatePath("/coupons");
    return { success: true, data: { couponId: coupon.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not create that coupon.");
  }
}

export async function setCouponActiveAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("coupon:update");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to change coupons.");
  }
  const parsed = setCouponActiveSchema.safeParse({
    couponId: formData.get("couponId"),
    active: formData.get("active"),
  });
  if (!parsed.success) return validationFailure("Invalid coupon change.", parsed.error);

  try {
    const changed = await setCouponDeleted(parsed.data.couponId, !parsed.data.active);
    if (!changed)
      throw new ConflictError(
        parsed.data.active
          ? "This coupon is already active."
          : "This coupon is already deactivated.",
      );
    await recordAudit({
      actorId: session.userId,
      action: parsed.data.active ? "COUPON_REACTIVATED" : "COUPON_DEACTIVATED",
      entityType: "coupons",
      entityId: parsed.data.couponId,
    });
    revalidatePath("/admin/coupons");
    revalidatePath("/coupons");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    if (error instanceof NotFoundError) return failureFrom(TAG, error);
    return failureFrom(TAG, error, "Could not change that coupon.");
  }
}
