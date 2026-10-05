import { describe, expect, it } from "vitest";
import { computeOrderPricing, computeSubtotal } from "@/server/domain/commerce/pricing";

describe("computeSubtotal", () => {
  it("sums unit price × qty across lines", () => {
    expect(
      computeSubtotal([
        { unitPrice: 10000n, qty: 2 },
        { unitPrice: 5000n, qty: 1 },
      ]),
    ).toBe(25000n);
  });

  it("returns 0 for no lines", () => {
    expect(computeSubtotal([])).toBe(0n);
  });
});

describe("computeOrderPricing", () => {
  it("computes the full subtotal/discount/tax/platform-fee/total chain with no discount", () => {
    // subtotal 10000, 18% GST, 2% platform fee
    const result = computeOrderPricing({
      subtotal: 10000n,
      discount: 0n,
      gstRateBps: 1800,
      platformFeeRateBps: 200,
    });

    expect(result).toEqual({
      subtotal: 10000n,
      discountTotal: 0n,
      taxTotal: 1800n, // 18% of 10000
      platformFeeTotal: 200n, // 2% of 10000
      grandTotal: 12000n, // 10000 - 0 + 1800 + 200
    });
  });

  it("computes tax on the POST-discount taxable base", () => {
    const result = computeOrderPricing({
      subtotal: 10000n,
      discount: 1000n,
      gstRateBps: 1800,
      platformFeeRateBps: 0,
    });

    // taxable base = 9000, 18% of 9000 = 1620
    expect(result.taxTotal).toBe(1620n);
    expect(result.grandTotal).toBe(9000n + 1620n);
  });

  it("computes platform fee on the PRE-discount subtotal", () => {
    const result = computeOrderPricing({
      subtotal: 10000n,
      discount: 5000n,
      gstRateBps: 0,
      platformFeeRateBps: 500, // 5%
    });

    // platform fee is 5% of the FULL 10000 subtotal, not the discounted 5000
    expect(result.platformFeeTotal).toBe(500n);
  });

  it("rejects a discount larger than the subtotal", () => {
    expect(() =>
      computeOrderPricing({ subtotal: 100n, discount: 200n, gstRateBps: 0, platformFeeRateBps: 0 }),
    ).toThrow();
  });

  it("handles a zero-rate order (no GST, no platform fee configured)", () => {
    const result = computeOrderPricing({
      subtotal: 5000n,
      discount: 0n,
      gstRateBps: 0,
      platformFeeRateBps: 0,
    });
    expect(result.grandTotal).toBe(5000n);
  });
});
