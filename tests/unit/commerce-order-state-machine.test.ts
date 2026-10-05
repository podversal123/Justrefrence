import { describe, expect, it } from "vitest";
import {
  assertOrderTransition,
  canTransitionOrder,
} from "@/server/domain/commerce/order-state-machine";

describe("canTransitionOrder", () => {
  it("allows SYSTEM to move PLACED -> PAID", () => {
    expect(canTransitionOrder("PLACED", "PAID", { role: "SYSTEM" })).toBe(true);
  });

  it("allows the owning vendor to move PAID -> PROCESSING", () => {
    expect(canTransitionOrder("PAID", "PROCESSING", { role: "VENDOR", isOwner: true })).toBe(true);
  });

  it("denies a non-owning vendor the same transition", () => {
    expect(canTransitionOrder("PAID", "PROCESSING", { role: "VENDOR", isOwner: false })).toBe(false);
  });

  it("denies CUSTOMER from moving PAID -> PROCESSING (vendor-only step)", () => {
    expect(canTransitionOrder("PAID", "PROCESSING", { role: "CUSTOMER", isOwner: true })).toBe(false);
  });

  it("allows the owning customer to confirm DELIVERED -> COMPLETED", () => {
    expect(canTransitionOrder("DELIVERED", "COMPLETED", { role: "CUSTOMER", isOwner: true })).toBe(
      true,
    );
  });

  it("denies a non-owning customer from confirming someone else's order", () => {
    expect(canTransitionOrder("DELIVERED", "COMPLETED", { role: "CUSTOMER", isOwner: false })).toBe(
      false,
    );
  });

  it("denies cancelling an order that has already shipped (pre-ship only)", () => {
    expect(canTransitionOrder("SHIPPED", "CANCELLED", { role: "CUSTOMER", isOwner: true })).toBe(
      false,
    );
    expect(canTransitionOrder("SHIPPED", "CANCELLED", { role: "ADMIN" })).toBe(false);
  });

  it("allows ADMIN to cancel pre-ship", () => {
    expect(canTransitionOrder("PLACED", "CANCELLED", { role: "ADMIN" })).toBe(true);
    expect(canTransitionOrder("PROCESSING", "CANCELLED", { role: "ADMIN" })).toBe(true);
  });

  it("rejects an illegal status jump", () => {
    expect(canTransitionOrder("PLACED", "DELIVERED", { role: "ADMIN" })).toBe(false);
  });

  it("treats CANCELLED and REFUNDED as terminal", () => {
    expect(canTransitionOrder("CANCELLED", "PLACED", { role: "ADMIN" })).toBe(false);
    expect(canTransitionOrder("REFUNDED", "PAID", { role: "ADMIN" })).toBe(false);
  });
});

describe("assertOrderTransition", () => {
  it("returns the target status on a legal transition", () => {
    expect(assertOrderTransition("SHIPPED", "DELIVERED", { role: "VENDOR", isOwner: true })).toBe(
      "DELIVERED",
    );
  });

  it("throws on an illegal transition", () => {
    expect(() => assertOrderTransition("DELIVERED", "PLACED", { role: "ADMIN" })).toThrow();
  });
});
