import { describe, expect, it } from "vitest";
import {
  allocateAmount,
  applyRateBps,
  percentToBps,
  roundHalfUpDiv,
} from "@/server/domain/commerce/money";

describe("roundHalfUpDiv", () => {
  it("rounds up at exactly half", () => {
    expect(roundHalfUpDiv(5n, 10n)).toBe(1n);
    expect(roundHalfUpDiv(15n, 10n)).toBe(2n);
  });

  it("rounds down below half", () => {
    expect(roundHalfUpDiv(4n, 10n)).toBe(0n);
  });

  it("throws for a non-positive denominator", () => {
    expect(() => roundHalfUpDiv(1n, 0n)).toThrow();
  });
});

describe("applyRateBps", () => {
  it("computes 18.5% of 10000 paise as 1850 paise", () => {
    expect(applyRateBps(10000n, 1850)).toBe(1850n);
  });

  it("rounds half up on the final paise", () => {
    // 1% of 50 paise = 0.5, rounds up to 1.
    expect(applyRateBps(50n, 100)).toBe(1n);
  });

  it("returns 0 for a 0% rate", () => {
    expect(applyRateBps(123456n, 0)).toBe(0n);
  });

  it("rejects a negative rate", () => {
    expect(() => applyRateBps(100n, -1)).toThrow();
  });
});

describe("percentToBps", () => {
  it("converts percent to basis points", () => {
    expect(percentToBps(18.5)).toBe(1850);
    expect(percentToBps(2)).toBe(200);
  });
});

describe("allocateAmount", () => {
  it("splits proportionally and sums exactly to the total", () => {
    const shares = allocateAmount(100n, [300n, 700n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(100n);
    expect(shares).toEqual([30n, 70n]);
  });

  it("never loses or gains a paise to rounding, even with an awkward split", () => {
    // 100 paise across 3 equal weights -> 33, 33, 33 + 1 leftover somewhere.
    const shares = allocateAmount(100n, [1n, 1n, 1n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(100n);
  });

  it("returns all zeros when the total is zero", () => {
    expect(allocateAmount(0n, [100n, 200n])).toEqual([0n, 0n]);
  });

  it("returns all zeros when every weight is zero", () => {
    expect(allocateAmount(500n, [0n, 0n])).toEqual([0n, 0n]);
  });

  it("returns an empty array for no weights", () => {
    expect(allocateAmount(100n, [])).toEqual([]);
  });

  it("gives the entire amount to a single weight", () => {
    expect(allocateAmount(999n, [1n])).toEqual([999n]);
  });
});
