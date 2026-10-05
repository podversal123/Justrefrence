import { describe, expect, it } from "vitest";
import {
  MAX_FAILED_ATTEMPTS,
  afterFailedAttempt,
  afterSuccessfulAttempt,
  isLocked,
} from "@/server/domain/identity/account-lock";

describe("isLocked", () => {
  it("is not locked when lockedUntil is null", () => {
    expect(isLocked({ failedLoginAttempts: 0, lockedUntil: null })).toBe(false);
  });

  it("is locked while now is before lockedUntil", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const lockedUntil = new Date(now.getTime() + 1000);
    expect(isLocked({ failedLoginAttempts: 5, lockedUntil }, now)).toBe(true);
  });

  it("is no longer locked once lockedUntil has passed", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const lockedUntil = new Date(now.getTime() - 1000);
    expect(isLocked({ failedLoginAttempts: 5, lockedUntil }, now)).toBe(false);
  });
});

describe("afterFailedAttempt", () => {
  it("increments the counter without locking below the threshold", () => {
    const state = afterFailedAttempt({ failedLoginAttempts: 0, lockedUntil: null });
    expect(state.failedLoginAttempts).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });

  it("locks the account once the threshold is reached", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const state = afterFailedAttempt(
      { failedLoginAttempts: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null },
      now,
    );
    expect(state.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(state.lockedUntil).not.toBeNull();
    expect(state.lockedUntil!.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("afterSuccessfulAttempt", () => {
  it("always resets to zero attempts and no lock", () => {
    expect(afterSuccessfulAttempt()).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
  });
});
