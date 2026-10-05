import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { OtpChannel, OtpPurpose } from "@/generated/prisma/enums";

/**
 * Thin CRUD over `otp_verifications` — no policy (expiry/attempt-limit
 * decisions) lives here, that's src/server/domain/identity/otp.ts. Matches
 * the vendor-repository.ts convention: repositories are Prisma-shaped I/O
 * only, orchestration lives one layer up in the *-service.ts files.
 */

export interface CreateOtpInput {
  userId: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  destinationMasked: string;
  codeHash: string;
  expiresAt: Date;
}

export async function createOtp(input: CreateOtpInput) {
  return prisma.otpVerification.create({ data: input });
}

/** Most recent, not-yet-consumed OTP for this user+purpose — what a verify attempt checks against. */
export async function findLatestActiveOtp(userId: string, purpose: OtpPurpose) {
  return prisma.otpVerification.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function incrementOtpAttempt(id: string) {
  return prisma.otpVerification.update({
    where: { id },
    data: { attemptCount: { increment: 1 } },
  });
}

export async function consumeOtp(id: string) {
  return prisma.otpVerification.update({
    where: { id },
    data: { consumedAt: new Date() },
  });
}
