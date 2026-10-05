import { describe, expect, it } from "vitest";
import {
  assertCommissionTransition,
  canTransitionCommission,
} from "@/server/domain/commission/commission-state-machine";

describe("canTransitionCommission", () => {
  it("allows SYSTEM to move PENDING -> ELIGIBLE", () => {
    expect(canTransitionCommission("PENDING", "ELIGIBLE", "SYSTEM")).toBe(true);
  });

  it("allows SYSTEM to move PENDING -> CANCELLED (order cancelled before completion)", () => {
    expect(canTransitionCommission("PENDING", "CANCELLED", "SYSTEM")).toBe(true);
  });

  it("allows SYSTEM to move ELIGIBLE -> AVAILABLE once the release window passes", () => {
    expect(canTransitionCommission("ELIGIBLE", "AVAILABLE", "SYSTEM")).toBe(true);
  });

  it("allows reversing from ELIGIBLE and from AVAILABLE (refund after confirmation either way)", () => {
    expect(canTransitionCommission("ELIGIBLE", "REVERSED", "SYSTEM")).toBe(true);
    expect(canTransitionCommission("AVAILABLE", "REVERSED", "SYSTEM")).toBe(true);
  });

  it("denies SYSTEM from cancelling an already-ELIGIBLE commission (admin-only override)", () => {
    expect(canTransitionCommission("ELIGIBLE", "CANCELLED", "SYSTEM")).toBe(false);
    expect(canTransitionCommission("ELIGIBLE", "CANCELLED", "ADMIN")).toBe(true);
  });

  it("rejects an illegal status jump", () => {
    expect(canTransitionCommission("PENDING", "AVAILABLE", "SYSTEM")).toBe(false);
  });

  it("treats REVERSED and CANCELLED as terminal", () => {
    expect(canTransitionCommission("REVERSED", "AVAILABLE", "ADMIN")).toBe(false);
    expect(canTransitionCommission("CANCELLED", "PENDING", "ADMIN")).toBe(false);
  });

  it("never allows AVAILABLE -> ELIGIBLE or any other backward move", () => {
    expect(canTransitionCommission("AVAILABLE", "ELIGIBLE", "ADMIN")).toBe(false);
    expect(canTransitionCommission("AVAILABLE", "PENDING", "ADMIN")).toBe(false);
  });
});

describe("assertCommissionTransition", () => {
  it("returns the target status on a legal transition", () => {
    expect(assertCommissionTransition("PENDING", "ELIGIBLE", "SYSTEM")).toBe("ELIGIBLE");
  });

  it("throws on an illegal transition", () => {
    expect(() => assertCommissionTransition("REVERSED", "AVAILABLE", "ADMIN")).toThrow();
  });
});
