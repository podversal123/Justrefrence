/**
 * Pure OTP logic — deliberately has no "server-only" import and no I/O (no
 * Prisma, no provider calls), so it is directly unit-testable — see
 * tests/unit/otp.test.ts. Uses the global Web Crypto API (available in both
 * Node and Edge runtimes) rather than `node:crypto`, matching the
 * `crypto.randomUUID()` usage already established elsewhere in this codebase.
 *
 * Policy values (6 digits, 5-minute expiry) are fixed by
 * docs/notifications.md §5 and docs/security.md §2.
 */

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

/** Generates a random OTP_LENGTH-digit numeric code, e.g. "042817". */
export function generateOtpCode(): string {
  const digits = new Uint32Array(OTP_LENGTH);
  crypto.getRandomValues(digits);
  return Array.from(digits, (d) => (d % 10).toString()).join("");
}

/** SHA-256 hex digest of the code — the raw code is never persisted. */
export async function hashOtpCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish comparison of two equal-length hex hashes. */
export async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  const candidate = await hashOtpCode(code);
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

export function otpExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

export function isOtpExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function hasExceededVerifyAttempts(attemptCount: number): boolean {
  return attemptCount >= OTP_MAX_VERIFY_ATTEMPTS;
}
