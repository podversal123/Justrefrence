import { describe, expect, it } from "vitest";
import {
  assertPayoutTransition,
  canTransitionPayout,
} from "@/server/domain/wallet/payout-state-machine";

describe("canTransitionPayout", () => {
  it("allows FINANCE to approve a requested payout", () => {
    expect(canTransitionPayout("REQUESTED", "APPROVED", "FINANCE")).toBe(true);
  });

  it("allows rejecting a requested payout", () => {
    expect(canTransitionPayout("REQUESTED", "REJECTED", "ADMIN")).toBe(true);
  });

  it("follows APPROVED -> PROCESSING -> PAID", () => {
    expect(canTransitionPayout("APPROVED", "PROCESSING", "FINANCE")).toBe(true);
    expect(canTransitionPayout("PROCESSING", "PAID", "FINANCE")).toBe(true);
  });

  it("allows PROCESSING -> FAILED", () => {
    expect(canTransitionPayout("PROCESSING", "FAILED", "FINANCE")).toBe(true);
  });

  it("rejects an illegal jump from REQUESTED straight to PAID", () => {
    expect(canTransitionPayout("REQUESTED", "PAID", "FINANCE")).toBe(false);
  });

  it("treats REJECTED, PAID, and FAILED as terminal", () => {
    expect(canTransitionPayout("REJECTED", "APPROVED", "ADMIN")).toBe(false);
    expect(canTransitionPayout("PAID", "PROCESSING", "ADMIN")).toBe(false);
    expect(canTransitionPayout("FAILED", "PROCESSING", "ADMIN")).toBe(false);
  });
});

describe("assertPayoutTransition", () => {
  it("returns the target status on a legal transition", () => {
    expect(assertPayoutTransition("REQUESTED", "APPROVED", "FINANCE")).toBe("APPROVED");
  });

  it("throws on an illegal transition", () => {
    expect(() => assertPayoutTransition("PAID", "REQUESTED", "ADMIN")).toThrow();
  });
});
