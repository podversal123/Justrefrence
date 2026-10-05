"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { generateEpin, redeemEpin, revokeEpin } from "@/server/domain/epin/epin-service";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import { generateEpinSchema, redeemEpinSchema } from "@/lib/schemas/wallet";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
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
  // Never log the raw code — this catch-all only ever sees the Error's
  // message, and nothing upstream ever constructs an Error containing the
  // raw e-pin code. See docs/security.md and epin-service.ts's own comment.
  logger.error("epin_action_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallback },
    meta: { requestId: requestId() },
  };
}

export async function generateEpinAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ rawCode: string; codeLast4: string }>> {
  let session;
  try {
    session = await authorize("epin:generate");
  } catch (error) {
    return failureFrom(error, "You don't have permission to generate e-pins.");
  }

  const parsed = generateEpinSchema.safeParse({
    planId: formData.get("planId"),
    expiresInDays: formData.get("expiresInDays") || undefined,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Choose a plan." },
      meta: { requestId: requestId() },
    };
  }

  try {
    const result = await generateEpin({
      planId: parsed.data.planId,
      generatedBy: session.userId,
      expiresAt: parsed.data.expiresInDays
        ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    });
    revalidatePath("/admin/epins");
    return {
      success: true,
      data: { rawCode: result.rawCode, codeLast4: result.codeLast4 },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(error, "Could not generate an e-pin.");
  }
}

export async function redeemEpinAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("epin:redeem");
  } catch (error) {
    return failureFrom(error, "You don't have permission to redeem an e-pin.");
  }

  const parsed = redeemEpinSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Enter a valid e-pin code." },
      meta: { requestId: requestId() },
    };
  }

  const memberProfile = await getMemberProfileByUserId(session.userId);
  if (!memberProfile) {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Only registered members can redeem an e-pin." },
      meta: { requestId: requestId() },
    };
  }

  try {
    await redeemEpin(session.userId, memberProfile.id, parsed.data.code);
  } catch (error) {
    return failureFrom(error, "Could not redeem that e-pin.");
  }

  revalidatePath("/subscription");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function revokeEpinAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("epin:revoke");
  } catch (error) {
    return failureFrom(error, "You don't have permission to revoke e-pins.");
  }

  const epinId = String(formData.get("epinId") ?? "");
  if (!epinId) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing e-pin id." },
      meta: { requestId: requestId() },
    };
  }

  try {
    await revokeEpin(epinId, session.userId);
  } catch (error) {
    return failureFrom(error, "Could not revoke that e-pin.");
  }

  revalidatePath("/admin/epins");
  return { success: true, data: null, meta: { requestId: requestId() } };
}
