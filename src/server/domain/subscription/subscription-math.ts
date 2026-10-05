/**
 * Pure subscription period calculation — no I/O. Pricing/eligibility are
 * fully configurable via SubscriptionPlan rows (Q-16); never hardcode a
 * duration or price anywhere else.
 */

export type SubscriptionPlanType = "YEARLY" | "TIME_BOUND" | "LIFETIME";

export interface SubscriptionPlanPeriod {
  type: SubscriptionPlanType;
  durationDays: number | null;
}

/** LIFETIME -> no expiry. YEARLY/TIME_BOUND -> starts + durationDays. */
export function computeSubscriptionExpiry(plan: SubscriptionPlanPeriod, startsAt: Date): Date | null {
  if (plan.type === "LIFETIME") return null;
  if (plan.durationDays === null) {
    throw new Error(`${plan.type} plans must set durationDays.`);
  }
  return new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
}

export function isSubscriptionCurrentlyActive(
  status: "ACTIVE" | "EXPIRED" | "CANCELLED",
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (status !== "ACTIVE") return false;
  if (expiresAt === null) return true; // lifetime
  return expiresAt.getTime() > now.getTime();
}
