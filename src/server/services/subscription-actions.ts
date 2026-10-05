"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import {
  createPlan,
  setPlanActive,
} from "@/server/repositories/subscription/subscription-plan-repository";
import { createSubscriptionPlanSchema } from "@/lib/schemas/wallet";
import { recordAudit } from "@/server/domain/audit/record";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

/** Pricing/eligibility are fully configurable here — Q-16. Never hardcode a plan price/duration elsewhere. */

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
  logger.error("subscription_action_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallback },
    meta: { requestId: requestId() },
  };
}

export async function createSubscriptionPlanAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ planId: string }>> {
  let session;
  try {
    session = await authorize("subscription_plan:manage");
  } catch (error) {
    return failureFrom(error, "You don't have permission to manage subscription plans.");
  }

  const parsed = createSubscriptionPlanSchema.safeParse({
    code: formData.get("code"),
    type: formData.get("type"),
    priceRupees: formData.get("priceRupees"),
    durationDays: formData.get("durationDays") || undefined,
    benefits: formData.get("benefits") || undefined,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the plan fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  let plan;
  try {
    plan = await createPlan({
      code: parsed.data.code,
      type: parsed.data.type,
      price: BigInt(Math.round(parsed.data.priceRupees * 100)),
      durationDays: parsed.data.durationDays ?? null,
      benefits: parsed.data.benefits ? { description: parsed.data.benefits } : null,
      createdBy: session.userId,
    });
  } catch (error) {
    return failureFrom(error, "Could not create that plan.");
  }

  await recordAudit({
    actorId: session.userId,
    action: "SUBSCRIPTION_PLAN_CREATED",
    entityType: "subscription_plans",
    entityId: plan.id,
    after: {
      code: plan.code,
      type: plan.type,
      price: plan.price.toString(),
      durationDays: plan.durationDays,
    },
  });

  revalidatePath("/admin/subscription-plans");
  return { success: true, data: { planId: plan.id }, meta: { requestId: requestId() } };
}

export async function setSubscriptionPlanActiveAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("subscription_plan:manage");
  } catch (error) {
    return failureFrom(error, "You don't have permission to manage subscription plans.");
  }

  const planId = String(formData.get("planId") ?? "");
  const active = formData.get("active") === "true";
  if (!planId) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing plan id." },
      meta: { requestId: requestId() },
    };
  }

  await setPlanActive(planId, active);
  await recordAudit({
    actorId: session.userId,
    action: active ? "SUBSCRIPTION_PLAN_ACTIVATED" : "SUBSCRIPTION_PLAN_DEACTIVATED",
    entityType: "subscription_plans",
    entityId: planId,
  });

  revalidatePath("/admin/subscription-plans");
  return { success: true, data: null, meta: { requestId: requestId() } };
}
