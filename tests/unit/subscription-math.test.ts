import { describe, expect, it } from "vitest";
import {
  computeSubscriptionExpiry,
  isSubscriptionCurrentlyActive,
} from "@/server/domain/subscription/subscription-math";

describe("computeSubscriptionExpiry", () => {
  it("returns null for a LIFETIME plan", () => {
    expect(computeSubscriptionExpiry({ type: "LIFETIME", durationDays: null }, new Date())).toBeNull();
  });

  it("computes expiry for a YEARLY plan (365 days)", () => {
    const startsAt = new Date("2026-01-01T00:00:00Z");
    const expiresAt = computeSubscriptionExpiry({ type: "YEARLY", durationDays: 365 }, startsAt);
    expect(expiresAt?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("computes expiry for a TIME_BOUND plan from its configured duration", () => {
    const startsAt = new Date("2026-01-01T00:00:00Z");
    const expiresAt = computeSubscriptionExpiry({ type: "TIME_BOUND", durationDays: 30 }, startsAt);
    expect(expiresAt?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("throws if a non-LIFETIME plan has no durationDays configured", () => {
    expect(() => computeSubscriptionExpiry({ type: "YEARLY", durationDays: null }, new Date())).toThrow();
  });
});

describe("isSubscriptionCurrentlyActive", () => {
  it("is active when status is ACTIVE and not yet expired", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const expiresAt = new Date("2026-12-31T00:00:00Z");
    expect(isSubscriptionCurrentlyActive("ACTIVE", expiresAt, now)).toBe(true);
  });

  it("is active with no expiry (lifetime)", () => {
    expect(isSubscriptionCurrentlyActive("ACTIVE", null)).toBe(true);
  });

  it("is not active once past expiresAt", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    const expiresAt = new Date("2026-12-31T00:00:00Z");
    expect(isSubscriptionCurrentlyActive("ACTIVE", expiresAt, now)).toBe(false);
  });

  it("is not active when status is EXPIRED or CANCELLED regardless of dates", () => {
    expect(isSubscriptionCurrentlyActive("EXPIRED", null)).toBe(false);
    expect(isSubscriptionCurrentlyActive("CANCELLED", null)).toBe(false);
  });
});
