/**
 * Account-lock protection policy — pure state evaluation, no I/O. Applied to
 * BOTH email/password login (auth-actions.ts) and mobile-OTP login
 * (otp-login-service.ts) against the same `User.failedLoginAttempts` /
 * `lockedUntil` fields, so the two channels can't be used to bypass each
 * other's lockout.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LockState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** Next state after a failed attempt — locks once the threshold is hit. */
export function afterFailedAttempt(state: LockState, now: Date = new Date()): LockState {
  const attempts = state.failedLoginAttempts + 1;
  const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
  return {
    failedLoginAttempts: attempts,
    lockedUntil: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) : state.lockedUntil,
  };
}

/** Next state after a successful attempt — always clears the counter/lock. */
export function afterSuccessfulAttempt(): LockState {
  return { failedLoginAttempts: 0, lockedUntil: null };
}
