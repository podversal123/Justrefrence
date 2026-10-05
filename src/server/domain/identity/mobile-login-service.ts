// No "server-only" import — orchestration layer, same rationale as
// registration-service.ts.
import { prisma } from "@/server/lib/prisma";
import { requestOtp, verifyOtp } from "@/server/domain/identity/otp-service";
import { mintSessionForVerifiedUser } from "@/server/domain/identity/session-bridge";
import {
  afterFailedAttempt,
  afterSuccessfulAttempt,
  isLocked,
} from "@/server/domain/identity/account-lock";
import { recordAudit } from "@/server/domain/audit/record";
import { AccountBlockedError, AuthenticationError, RateLimitedError } from "@/server/lib/errors";

/**
 * Mobile-number OTP login (docs/business-rules.md Q-32/Q-33: login by email
 * or mobile only, never by Member ID). Always returns the same generic
 * outcome whether the phone is registered or not, to avoid account
 * enumeration — matching forgotPasswordAction's discipline in auth-actions.ts.
 */
export async function requestMobileLoginOtp(phone: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return; // no enumeration — caller always shows the generic "code sent" message

  if (user.status === "BLOCKED") return; // same reason — don't reveal block state pre-auth
  if (isLocked({ failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil })) {
    return;
  }

  await requestOtp({ userId: user.id, destination: phone, channel: "SMS", purpose: "LOGIN" });
}

export interface ConfirmMobileLoginResult {
  email: string;
}

export async function confirmMobileLoginOtp(
  phone: string,
  code: string,
  ip: string | null,
): Promise<ConfirmMobileLoginResult> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new AuthenticationError("Incorrect mobile number or code.");
  }

  if (user.status === "BLOCKED") {
    throw new AccountBlockedError();
  }

  if (isLocked({ failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil })) {
    throw new RateLimitedError("Too many failed attempts. Try again later.");
  }

  try {
    await verifyOtp({ userId: user.id, purpose: "LOGIN", code });
  } catch (error) {
    const nextLockState = afterFailedAttempt({
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: nextLockState.failedLoginAttempts,
        lockedUntil: nextLockState.lockedUntil,
      },
    });
    await recordAudit({ actorId: null, action: "LOGIN_FAILED", entityType: "users", entityId: user.id, ip });
    throw error;
  }

  const resetLockState = afterSuccessfulAttempt();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: resetLockState.failedLoginAttempts,
      lockedUntil: resetLockState.lockedUntil,
    },
  });

  await mintSessionForVerifiedUser(user.email);

  await recordAudit({
    actorId: user.id,
    action: "LOGIN_SUCCEEDED",
    entityType: "users",
    entityId: user.id,
    ip,
  });

  return { email: user.email };
}
