import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/server/domain/commission/eligibility";

describe("evaluateEligibility", () => {
  it("is eligible when no requirements are configured", () => {
    const result = evaluateEligibility(
      { requiresActiveSubscription: false, minimumActivityCount: null },
      { hasActiveSubscription: false, activityCount: 0 },
    );
    expect(result).toEqual({ eligible: true });
  });

  it("rejects when an active subscription is required but absent", () => {
    const result = evaluateEligibility(
      { requiresActiveSubscription: true, minimumActivityCount: null },
      { hasActiveSubscription: false, activityCount: 100 },
    );
    expect(result).toEqual({ eligible: false, failure: "SUBSCRIPTION_REQUIRED" });
  });

  it("passes when the required active subscription is present", () => {
    const result = evaluateEligibility(
      { requiresActiveSubscription: true, minimumActivityCount: null },
      { hasActiveSubscription: true, activityCount: 0 },
    );
    expect(result.eligible).toBe(true);
  });

  it("rejects when activity is below the configured minimum", () => {
    const result = evaluateEligibility(
      { requiresActiveSubscription: false, minimumActivityCount: 3 },
      { hasActiveSubscription: false, activityCount: 2 },
    );
    expect(result).toEqual({ eligible: false, failure: "MINIMUM_ACTIVITY_NOT_MET" });
  });

  it("passes when activity exactly meets the minimum", () => {
    const result = evaluateEligibility(
      { requiresActiveSubscription: false, minimumActivityCount: 3 },
      { hasActiveSubscription: false, activityCount: 3 },
    );
    expect(result.eligible).toBe(true);
  });

  it("checks subscription before activity, reporting the first failure", () => {
    const result = evaluateEligibility(
      { requiresActiveSubscription: true, minimumActivityCount: 5 },
      { hasActiveSubscription: false, activityCount: 0 },
    );
    expect(result.failure).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("requires both conditions when both are configured", () => {
    const result = evaluateEligibility(
      { requiresActiveSubscription: true, minimumActivityCount: 5 },
      { hasActiveSubscription: true, activityCount: 2 },
    );
    expect(result).toEqual({ eligible: false, failure: "MINIMUM_ACTIVITY_NOT_MET" });
  });
});
