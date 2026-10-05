import { describe, expect, it } from "vitest";
import {
  assertPaymentTransition,
  canTransitionPayment,
} from "@/server/domain/payment/payment-state-machine";

describe("canTransitionPayment", () => {
  it("allows SYSTEM to capture a CREATED payment directly", () => {
    expect(canTransitionPayment("CREATED", "CAPTURED", "SYSTEM")).toBe(true);
  });

  it("allows the AUTHORIZED -> CAPTURED path some payment methods take", () => {
    expect(canTransitionPayment("CREATED", "AUTHORIZED", "SYSTEM")).toBe(true);
    expect(canTransitionPayment("AUTHORIZED", "CAPTURED", "SYSTEM")).toBe(true);
  });

  it("allows marking a payment FAILED from CREATED or AUTHORIZED", () => {
    expect(canTransitionPayment("CREATED", "FAILED", "SYSTEM")).toBe(true);
    expect(canTransitionPayment("AUTHORIZED", "FAILED", "SYSTEM")).toBe(true);
  });

  it("allows refunding only a CAPTURED payment", () => {
    expect(canTransitionPayment("CAPTURED", "REFUNDED", "FINANCE")).toBe(true);
    expect(canTransitionPayment("CREATED", "REFUNDED", "FINANCE")).toBe(false);
  });

  it("denies FINANCE/ADMIN from capturing or failing a payment directly (system-verified only)", () => {
    expect(canTransitionPayment("CREATED", "CAPTURED", "ADMIN")).toBe(false);
    expect(canTransitionPayment("CREATED", "CAPTURED", "FINANCE")).toBe(false);
  });

  it("treats FAILED and REFUNDED as terminal", () => {
    expect(canTransitionPayment("FAILED", "CREATED", "SYSTEM")).toBe(false);
    expect(canTransitionPayment("REFUNDED", "CAPTURED", "SYSTEM")).toBe(false);
  });

  it("rejects an illegal jump", () => {
    expect(canTransitionPayment("FAILED", "CAPTURED", "SYSTEM")).toBe(false);
  });
});

describe("assertPaymentTransition", () => {
  it("returns the target status on a legal transition", () => {
    expect(assertPaymentTransition("CREATED", "CAPTURED", "SYSTEM")).toBe("CAPTURED");
  });

  it("throws on an illegal transition — e.g. re-capturing an already-captured payment", () => {
    expect(() => assertPaymentTransition("CAPTURED", "CAPTURED", "SYSTEM")).toThrow();
  });
});
