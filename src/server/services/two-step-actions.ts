"use server";

import { redirect } from "next/navigation";
import { msg } from "@/i18n/locales";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next";
import { recordAudit } from "@/server/domain/audit/record";
import { parseTwoStepCode, qrImageSrc } from "@/server/domain/identity/two-step";
import { twoStepRateLimiter } from "@/server/lib/rate-limit";
import {
  AuthenticationError,
  ConflictError,
  RateLimitedError,
  ValidationError,
} from "@/server/lib/errors";
import { failureFrom, requestId } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Two-step login with an authenticator app (Supabase Auth TOTP factors). These actions only need a
 * signed-in user, not a permission: a staff account that still owes its code has none until it finishes.
 * The six-digit code is never logged or stored by us.
 */

const TAG = "two_step_action_failed";
const WRONG_CODE = msg("That code is not correct. Check the time on your phone and try again.");

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthenticationError();
  return { supabase, user };
}

async function checkRate(userId: string) {
  const { allowed } = await twoStepRateLimiter.consume(`two-step:${userId}`);
  if (!allowed) {
    throw new RateLimitedError("Too many wrong codes. Please wait a few minutes and try again.");
  }
}

/** Challenges the factor and checks the code; throws a friendly error if Supabase says no. */
async function challengeAndVerify(
  supabase: Awaited<ReturnType<typeof createClient>>,
  factorId: string,
  code: string,
) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw new ValidationError(WRONG_CODE);
  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) throw new ValidationError(WRONG_CODE);
}

export interface EnrollmentStart {
  factorId: string;
  qrSrc: string;
  secret: string;
}

/** Step 1: make a new authenticator entry and hand back its QR code and typed-in key. */
export async function startTwoStepEnrollmentAction(): Promise<ApiResult<EnrollmentStart>> {
  try {
    const { supabase } = await signedInUser();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    if ((factors?.totp ?? []).length > 0) {
      throw new ConflictError("Two-step login is already on for this account.");
    }
    // An earlier set-up that was never finished would block a new one with the same name.
    for (const stale of (factors?.all ?? []).filter(
      (factor) => factor.factor_type === "totp" && factor.status === "unverified",
    )) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id });
    }
    const enrolled = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Just Reference",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    });
    if (enrolled.error) throw new ValidationError("Could not start the set-up. Try again.");
    return {
      success: true,
      data: {
        factorId: enrolled.data.id,
        qrSrc: qrImageSrc(enrolled.data.totp.qr_code),
        secret: enrolled.data.totp.secret,
      },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(TAG, error, "Could not start the set-up. Try again.");
  }
}

/** Step 2: the member types the first code from the app; that proves it works and turns two-step on. */
export async function confirmTwoStepEnrollmentAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const code = parseTwoStepCode(formData.get("code"));
  const factorId = formData.get("factorId");
  const next = safeNextPath(formData.get("next"));
  if (!code || typeof factorId !== "string" || factorId === "") {
    return failureFrom(TAG, new ValidationError("Enter the 6-digit code from your app."), "");
  }
  try {
    const { supabase, user } = await signedInUser();
    await checkRate(user.id);
    await challengeAndVerify(supabase, factorId, code);
    await recordAudit({
      actorId: user.id,
      action: "TWO_STEP_ENABLED",
      entityType: "users",
      entityId: user.id,
    });
  } catch (error) {
    return failureFrom(TAG, error, "Could not turn on two-step login.");
  }
  redirect(next as never);
}

/** Sign-in step: the code from the app, checked against the account's verified authenticator. */
export async function verifyTwoStepAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const code = parseTwoStepCode(formData.get("code"));
  const next = safeNextPath(formData.get("next"));
  if (!code) {
    return failureFrom(TAG, new ValidationError("Enter the 6-digit code from your app."), "");
  }
  let userId: string | null = null;
  try {
    const { supabase, user } = await signedInUser();
    userId = user.id;
    await checkRate(user.id);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (!factor) throw new ConflictError("Two-step login is not set up for this account yet.");
    await challengeAndVerify(supabase, factor.id, code);
    await recordAudit({
      actorId: user.id,
      action: "TWO_STEP_VERIFIED",
      entityType: "users",
      entityId: user.id,
    });
  } catch (error) {
    if (userId && error instanceof ValidationError) {
      await recordAudit({
        actorId: userId,
        action: "TWO_STEP_FAILED",
        entityType: "users",
        entityId: userId,
      }).catch(() => undefined);
    }
    return failureFrom(TAG, error, "Could not check the code.");
  }
  redirect(next as never);
}

/** Turns two-step off for the signed-in account. Supabase only allows this once the code has been entered this session. */
export async function removeTwoStepAction(
  _prev: unknown,
  _formData: FormData,
): Promise<ApiResult<null>> {
  try {
    const { supabase, user } = await signedInUser();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.totp ?? []) {
      const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) {
        throw new ValidationError("Enter your code again first, then turn two-step login off.");
      }
    }
    await recordAudit({
      actorId: user.id,
      action: "TWO_STEP_DISABLED",
      entityType: "users",
      entityId: user.id,
    });
  } catch (error) {
    return failureFrom(TAG, error, "Could not turn off two-step login.");
  }
  redirect("/two-step");
}
