import { describe, expect, it } from "vitest";
import {
  OTP_LENGTH,
  OTP_MAX_VERIFY_ATTEMPTS,
  generateOtpCode,
  hashOtpCode,
  hasExceededVerifyAttempts,
  isOtpExpired,
  otpExpiresAt,
  verifyOtpCode,
} from "@/server/domain/identity/otp";

describe("generateOtpCode", () => {
  it("generates a numeric code of the configured length", () => {
    const code = generateOtpCode();
    expect(code).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
  });

  it("generates different codes across calls (not deterministic)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("hashOtpCode / verifyOtpCode", () => {
  it("hashes deterministically and verifies a matching code", async () => {
    const hash1 = await hashOtpCode("123456");
    const hash2 = await hashOtpCode("123456");
    expect(hash1).toBe(hash2);
    expect(await verifyOtpCode("123456", hash1)).toBe(true);
  });

  it("rejects a non-matching code", async () => {
    const hash = await hashOtpCode("123456");
    expect(await verifyOtpCode("654321", hash)).toBe(false);
  });

  it("never stores the raw code in the hash output", async () => {
    const hash = await hashOtpCode("123456");
    expect(hash).not.toContain("123456");
  });
});

describe("otpExpiresAt / isOtpExpired", () => {
  it("expires exactly 5 minutes after issuance", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiresAt = otpExpiresAt(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(5 * 60 * 1000);
  });

  it("is not expired before expiresAt and is expired at/after it", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const expiresAt = otpExpiresAt(now);
    expect(isOtpExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isOtpExpired(expiresAt, expiresAt)).toBe(true);
  });
});

describe("hasExceededVerifyAttempts", () => {
  it("allows attempts under the limit and blocks at/over it", () => {
    expect(hasExceededVerifyAttempts(OTP_MAX_VERIFY_ATTEMPTS - 1)).toBe(false);
    expect(hasExceededVerifyAttempts(OTP_MAX_VERIFY_ATTEMPTS)).toBe(true);
  });
});
