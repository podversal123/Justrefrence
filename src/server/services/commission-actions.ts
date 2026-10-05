"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { createRuleVersion } from "@/server/repositories/commission/commission-rule-repository";
import { createCommissionRuleSchema } from "@/lib/schemas/commission";
import { recordAudit } from "@/server/domain/audit/record";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

/**
 * Commission rule configuration — `commission_rule:update` is SUPER_ADMIN
 * only (docs/rbac.md: "who may change money rules... FINANCE can
 * propose/draft a new rule version but not make it effective"). Never
 * hardcode a rate: this is the only write path into commission_rules.
 */

function requestId() {
  return crypto.randomUUID();
}

export async function createCommissionRuleAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ ruleId: string }>> {
  let session;
  try {
    session = await authorize("commission_rule:update");
  } catch {
    return {
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "You don't have permission to configure commission rules.",
      },
      meta: { requestId: requestId() },
    };
  }

  const parsed = createCommissionRuleSchema.safeParse({
    level: formData.get("level"),
    appliesTo: formData.get("appliesTo"),
    rateBasis: formData.get("rateBasis"),
    rateValuePercent: formData.get("rateValuePercent") || undefined,
    rateValueFixed: formData.get("rateValueFixed") || undefined,
    qualifyingEvent: formData.get("qualifyingEvent"),
    requiresActiveSubscription: formData.get("requiresActiveSubscription") === "on",
    minimumActivityCount: formData.get("minimumActivityCount") || undefined,
    releaseDelayDays: formData.get("releaseDelayDays"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  let rule;
  try {
    rule = await createRuleVersion({
      level: parsed.data.level,
      appliesTo: parsed.data.appliesTo,
      rateBasis: parsed.data.rateBasis,
      rateValueBps: parsed.data.rateValuePercent ?? null,
      rateValueFixed: parsed.data.rateValueFixed ?? null,
      qualifyingEvent: parsed.data.qualifyingEvent,
      requiresActiveSubscription: parsed.data.requiresActiveSubscription,
      minimumActivityCount: parsed.data.minimumActivityCount ?? null,
      releaseDelayDays: parsed.data.releaseDelayDays,
      createdBy: session.userId,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return {
        success: false,
        error: { code: error.code, message: error.message },
        meta: { requestId: requestId() },
      };
    }
    logger.error("commission_rule_create_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Could not save that rule." },
      meta: { requestId: requestId() },
    };
  }

  await recordAudit({
    actorId: session.userId,
    action: "COMMISSION_RULE_VERSION_CREATED",
    entityType: "commission_rules",
    entityId: rule.id,
    after: {
      level: rule.level,
      appliesTo: rule.appliesTo,
      rateBasis: rule.rateBasis,
      rateValueBps: rule.rateValueBps,
      rateValueFixed: rule.rateValueFixed?.toString() ?? null,
      releaseDelayDays: rule.releaseDelayDays,
    },
  });

  revalidatePath("/admin/commission-rules");
  return { success: true, data: { ruleId: rule.id }, meta: { requestId: requestId() } };
}
