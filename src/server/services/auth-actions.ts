"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/server/lib/prisma";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/schemas/auth";
import { loginRateLimiter, passwordResetRateLimiter } from "@/server/lib/rate-limit";
import {
  afterFailedAttempt,
  afterSuccessfulAttempt,
  isLocked,
} from "@/server/domain/identity/account-lock";
import { recordAudit } from "@/server/domain/audit/record";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Application-service layer for the email + password auth flows — see
 * docs/architecture.md §2 (layering rule). Server Actions are the caller;
 * this is where Supabase Auth is invoked, rate limiting is enforced, account
 * lock is tracked, and every attempt is audit-logged. Mobile-OTP
 * registration/login lives in member-actions.ts (Phase 4) — see
 * docs/adr/0012-otp-session-bridge.md; both channels share the same
 * account-lock policy (src/server/domain/identity/account-lock.ts) so
 * neither can be used to bypass the other's lockout.
 */

export async function loginAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid email and password.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  const ip = await clientIp();
  const rateLimitKey = `login:${parsed.data.email}:${ip ?? "unknown"}`;
  const { allowed } = await loginRateLimiter.consume(rateLimitKey);

  if (!allowed) {
    await recordAudit({
      actorId: null,
      action: "LOGIN_RATE_LIMITED",
      entityType: "users",
      entityId: parsed.data.email,
      ip,
    });
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many login attempts. Please try again in a few minutes.",
      },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  const localUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (
    localUser &&
    isLocked({
      failedLoginAttempts: localUser.failedLoginAttempts,
      lockedUntil: localUser.lockedUntil,
    })
  ) {
    await recordAudit({
      actorId: null,
      action: "LOGIN_BLOCKED_ACCOUNT_LOCKED",
      entityType: "users",
      entityId: localUser.id,
      ip,
    });
    return {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many failed attempts. This account is temporarily locked — try again later.",
      },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Account-lock protection (Phase 4) — tracked on the local `users` row
    // since Supabase Auth has no first-class failed-attempt counter we can
    // read back. Shared policy with mobile-OTP login, see
    // src/server/domain/identity/account-lock.ts.
    if (localUser) {
      const next = afterFailedAttempt({
        failedLoginAttempts: localUser.failedLoginAttempts,
        lockedUntil: localUser.lockedUntil,
      });
      await prisma.user.update({
        where: { id: localUser.id },
        data: { failedLoginAttempts: next.failedLoginAttempts, lockedUntil: next.lockedUntil },
      });
    }
    await recordAudit({
      actorId: null,
      action: "LOGIN_FAILED",
      entityType: "users",
      entityId: parsed.data.email,
      ip,
    });
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Incorrect email or password." },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  const reset = afterSuccessfulAttempt();
  await prisma.user.update({
    where: { id: data.user.id },
    data: { failedLoginAttempts: reset.failedLoginAttempts, lockedUntil: reset.lockedUntil },
  });

  await recordAudit({
    actorId: data.user.id,
    action: "LOGIN_SUCCEEDED",
    entityType: "users",
    entityId: data.user.id,
    ip,
  });

  redirect("/dashboard");
}

export async function forgotPasswordAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ message: string }>> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid email address.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  const ip = await clientIp();
  const { allowed } = await passwordResetRateLimiter.consume(`reset:${parsed.data.email}`);

  // Always return the same response whether the account exists or not, and
  // whether it was rate-limited or not — an account-enumeration guard, per
  // docs/security.md's minimum-data-exposure principle.
  const genericResponse: ApiResult<{ message: string }> = {
    success: true,
    data: { message: "If an account exists for that email, a reset link has been sent." },
    meta: { requestId: crypto.randomUUID() },
  };

  if (!allowed) {
    logger.warn("password_reset_rate_limited", { ip });
    return genericResponse;
  }

  const supabase = await createClient();
  const appBaseUrl = process.env["APP_BASE_URL"] ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appBaseUrl}/reset-password`,
  });

  if (error) {
    // Still return the generic response to the client (no enumeration), but
    // log the real failure server-side.
    logger.error("password_reset_request_failed", { message: error.message });
  }

  await recordAudit({
    actorId: null,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "users",
    entityId: parsed.data.email,
    ip,
  });

  return genericResponse;
}

export async function resetPasswordAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the password requirements below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Your password reset link has expired. Please request a new one.",
      },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Could not update your password. Try again." },
      meta: { requestId: crypto.randomUUID() },
    };
  }

  await recordAudit({
    actorId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "users",
    entityId: user.id,
  });

  redirect("/login");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (user) {
    await recordAudit({
      actorId: user.id,
      action: "LOGOUT",
      entityType: "users",
      entityId: user.id,
    });
  }

  redirect("/login");
}
