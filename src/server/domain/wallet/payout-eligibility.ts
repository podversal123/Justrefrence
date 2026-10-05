/**
 * Pure payout eligibility check — Q-11: "Require verified email, PAN, and
 * bank account before a payout request is accepted." No I/O; the caller
 * resolves the actual facts.
 */

export interface PayoutEligibilityContext {
  emailVerified: boolean;
  hasPan: boolean;
  hasVerifiedBankAccount: boolean;
}

export type PayoutEligibilityFailure = "EMAIL_NOT_VERIFIED" | "PAN_MISSING" | "BANK_ACCOUNT_NOT_VERIFIED";

export interface PayoutEligibilityResult {
  eligible: boolean;
  failure?: PayoutEligibilityFailure;
}

const FAILURE_MESSAGES: Record<PayoutEligibilityFailure, string> = {
  EMAIL_NOT_VERIFIED: "Verify your email address before requesting a payout.",
  PAN_MISSING: "Add your PAN to your profile before requesting a payout.",
  BANK_ACCOUNT_NOT_VERIFIED: "Add and verify a bank account before requesting a payout.",
};

export function payoutEligibilityMessage(failure: PayoutEligibilityFailure): string {
  return FAILURE_MESSAGES[failure];
}

export function evaluatePayoutEligibility(context: PayoutEligibilityContext): PayoutEligibilityResult {
  if (!context.emailVerified) return { eligible: false, failure: "EMAIL_NOT_VERIFIED" };
  if (!context.hasPan) return { eligible: false, failure: "PAN_MISSING" };
  if (!context.hasVerifiedBankAccount) return { eligible: false, failure: "BANK_ACCOUNT_NOT_VERIFIED" };
  return { eligible: true };
}
