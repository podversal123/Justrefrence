import { describe, expect, it } from "vitest";
import { computeCommissionAmount } from "@/server/domain/commission/commission-math";

describe("computeCommissionAmount", () => {
  it("computes a PERCENT_OF_ORDER commission deterministically", () => {
    const amount = computeCommissionAmount(
      { rateBasis: "PERCENT_OF_ORDER", rateValueBps: 500, rateValueFixed: null }, // 5%
      100000n,
    );
    expect(amount).toBe(5000n);
  });

  it("computes a PERCENT_OF_VENDOR_SALE commission the same way as PERCENT_OF_ORDER given the same base", () => {
    const base = 73400n;
    const order = computeCommissionAmount(
      { rateBasis: "PERCENT_OF_ORDER", rateValueBps: 1000, rateValueFixed: null },
      base,
    );
    const vendorSale = computeCommissionAmount(
      { rateBasis: "PERCENT_OF_VENDOR_SALE", rateValueBps: 1000, rateValueFixed: null },
      base,
    );
    expect(vendorSale).toBe(order);
  });

  it("computes a PERCENT_OF_PLATFORM_FEE commission against whatever base is passed", () => {
    const amount = computeCommissionAmount(
      { rateBasis: "PERCENT_OF_PLATFORM_FEE", rateValueBps: 2000, rateValueFixed: null }, // 20%
      500n,
    );
    expect(amount).toBe(100n);
  });

  it("returns the flat amount for FIXED regardless of base", () => {
    const amount = computeCommissionAmount(
      { rateBasis: "FIXED", rateValueBps: null, rateValueFixed: 2500n },
      999999n,
    );
    expect(amount).toBe(2500n);
  });

  it("is deterministic — identical inputs always produce the identical output", () => {
    const rule = { rateBasis: "PERCENT_OF_ORDER" as const, rateValueBps: 333, rateValueFixed: null };
    const results = Array.from({ length: 20 }, () => computeCommissionAmount(rule, 123457n));
    expect(new Set(results).size).toBe(1);
  });

  it("throws if a PERCENT_* rule has no rateValueBps", () => {
    expect(() =>
      computeCommissionAmount({ rateBasis: "PERCENT_OF_ORDER", rateValueBps: null, rateValueFixed: null }, 100n),
    ).toThrow();
  });

  it("throws if a FIXED rule has no rateValueFixed", () => {
    expect(() =>
      computeCommissionAmount({ rateBasis: "FIXED", rateValueBps: null, rateValueFixed: null }, 100n),
    ).toThrow();
  });

  it("throws for a negative calculation base", () => {
    expect(() =>
      computeCommissionAmount({ rateBasis: "PERCENT_OF_ORDER", rateValueBps: 500, rateValueFixed: null }, -1n),
    ).toThrow();
  });

  it("rounds half up on the final paise, same as every other rate calculation in the codebase", () => {
    // 1% of 50 paise = 0.5, rounds up to 1 (matches applyRateBps's documented behavior).
    const amount = computeCommissionAmount(
      { rateBasis: "PERCENT_OF_ORDER", rateValueBps: 100, rateValueFixed: null },
      50n,
    );
    expect(amount).toBe(1n);
  });
});
