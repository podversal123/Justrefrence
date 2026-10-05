import { describe, expect, it } from "vitest";
import { evaluatePayoutEligibility } from "@/server/domain/wallet/payout-eligibility";

const FULLY_ELIGIBLE = { emailVerified: true, hasPan: true, hasVerifiedBankAccount: true };

describe("evaluatePayoutEligibility", () => {
  it("is eligible when all three conditions are met", () => {
    expect(evaluatePayoutEligibility(FULLY_ELIGIBLE)).toEqual({ eligible: true });
  });

  it("requires a verified email first", () => {
    const result = evaluatePayoutEligibility({ ...FULLY_ELIGIBLE, emailVerified: false });
    expect(result).toEqual({ eligible: false, failure: "EMAIL_NOT_VERIFIED" });
  });

  it("requires a PAN on file", () => {
    const result = evaluatePayoutEligibility({ ...FULLY_ELIGIBLE, hasPan: false });
    expect(result).toEqual({ eligible: false, failure: "PAN_MISSING" });
  });

  it("requires a verified bank account", () => {
    const result = evaluatePayoutEligibility({ ...FULLY_ELIGIBLE, hasVerifiedBankAccount: false });
    expect(result).toEqual({ eligible: false, failure: "BANK_ACCOUNT_NOT_VERIFIED" });
  });

  it("checks in order: email, then PAN, then bank account", () => {
    const result = evaluatePayoutEligibility({
      emailVerified: false,
      hasPan: false,
      hasVerifiedBankAccount: false,
    });
    expect(result.failure).toBe("EMAIL_NOT_VERIFIED");
  });
});
