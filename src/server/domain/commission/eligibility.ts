/**
 * Q-04 eligibility predicate — pure, no I/O. The caller resolves the actual
 * facts (does the beneficiary hold an active subscription, how many of
 * their own orders have they completed) and passes them in; this function
 * only encodes the RULE, not how to look the facts up. Evaluated once, at
 * commission-creation time, never retroactively — see
 * docs/business-rules.md Q-04 and docs/adr/0014-commission-engine.md.
 */

export interface EligibilityRule {
  requiresActiveSubscription: boolean;
  minimumActivityCount: number | null;
}

export interface EligibilityContext {
  hasActiveSubscription: boolean;
  activityCount: number;
}

export type EligibilityFailureReason = "SUBSCRIPTION_REQUIRED" | "MINIMUM_ACTIVITY_NOT_MET";

export interface EligibilityResult {
  eligible: boolean;
  failure?: EligibilityFailureReason;
}

export function evaluateEligibility(rule: EligibilityRule, context: EligibilityContext): EligibilityResult {
  if (rule.requiresActiveSubscription && !context.hasActiveSubscription) {
    return { eligible: false, failure: "SUBSCRIPTION_REQUIRED" };
  }
  if (rule.minimumActivityCount !== null && context.activityCount < rule.minimumActivityCount) {
    return { eligible: false, failure: "MINIMUM_ACTIVITY_NOT_MET" };
  }
  return { eligible: true };
}
