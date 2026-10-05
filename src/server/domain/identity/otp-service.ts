// Deliberately no "server-only" import — this is the orchestration layer
// (rate limiting + hashing + persistence + provider dispatch), matching the
// listing-service.ts precedent: its dependencies (otp-repository,
// notification-providers, rate-limit) each carry their own "server-only"
// guard, so this file stays importable from integration tests with those
// dependencies mocked (see tests/integration/registration-actions.test.ts).
import {
  generateOtpCode,
  hasExceededVerifyAttempts,
  hashOtpCode,
  isOtpExpired,
  otpExpiresAt,
  verifyOtpCode,
} from "@/server/domain/identity/otp";
import { maskDestination } from "@/server/domain/identity/masking";
import {
  consumeOtp,
  createOtp,
  findLatestActiveOtp,
  incrementOtpAttempt,
} from "@/server/repositories/identity/otp-repository";
import { otpRequestRateLimiter } from "@/server/lib/rate-limit";
import { sendEmail, sendSms, sendWhatsApp } from "@/server/lib/notification-providers";
import { RateLimitedError, ValidationError } from "@/server/lib/errors";
import type { OtpChannel, OtpPurpose } from "@/generated/prisma/enums";

export interface RequestOtpInput {
  userId: string;
  destination: string; // raw email or phone, never persisted in the clear beyond the masked form
  channel: OtpChannel;
  purpose: OtpPurpose;
}

export interface RequestOtpResult {
  maskedDestination: string;
}

/** Shared by registration (any channel) and mobile-OTP login (SMS) — see docs/adr/0012-otp-session-bridge.md. */
export async function requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
  const { allowed } = await otpRequestRateLimiter.consume(`otp:${input.channel}:${input.destination}`);
  if (!allowed) {
    throw new RateLimitedError("Too many code requests. Please wait a few minutes and try again.");
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const destinationMasked = maskDestination(input.destination, input.channel);

  await createOtp({
    userId: input.userId,
    channel: input.channel,
    purpose: input.purpose,
    destinationMasked,
    codeHash,
    expiresAt: otpExpiresAt(),
  });

  const vars = { code, purpose: input.purpose };
  if (input.channel === "EMAIL") {
    await sendEmail({ to: input.destination, template: "otp_code", vars });
  } else if (input.channel === "WHATSAPP") {
    await sendWhatsApp({ to: input.destination, template: "otp_code", vars });
  } else {
    await sendSms({ to: input.destination, template: "otp_code", vars });
  }

  return { maskedDestination: destinationMasked };
}

export interface VerifyOtpInput {
  userId: string;
  purpose: OtpPurpose;
  code: string;
}

/** Throws ValidationError/RateLimitedError on failure; resolves silently on success. */
export async function verifyOtp(input: VerifyOtpInput): Promise<void> {
  const otp = await findLatestActiveOtp(input.userId, input.purpose);

  if (!otp) {
    throw new ValidationError("No active code found. Request a new one.");
  }
  if (hasExceededVerifyAttempts(otp.attemptCount)) {
    throw new RateLimitedError("Too many incorrect attempts. Request a new code.");
  }
  if (isOtpExpired(otp.expiresAt)) {
    throw new ValidationError("That code has expired. Request a new one.");
  }

  const matches = await verifyOtpCode(input.code, otp.codeHash);
  if (!matches) {
    await incrementOtpAttempt(otp.id);
    throw new ValidationError("Incorrect code. Please try again.");
  }

  await consumeOtp(otp.id);
}
