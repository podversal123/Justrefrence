/**
 * Order pricing — the one place subtotal/discount/tax/platform-fee/total
 * are computed, always server-side, always from prices re-fetched from the
 * catalog (never a client-supplied value). No I/O, unit-tested directly.
 * See docs/adr/0013-commerce-money-math.md.
 */
import { applyRateBps } from "@/server/domain/commerce/money";

export interface PricedLine {
  unitPrice: bigint;
  qty: number;
}

export function computeSubtotal(lines: PricedLine[]): bigint {
  return lines.reduce((sum, line) => sum + line.unitPrice * BigInt(line.qty), 0n);
}

export interface OrderPricingInput {
  subtotal: bigint;
  /** This order's share of a cross-cart coupon discount, already allocated — see allocateAmount(). */
  discount: bigint;
  gstRateBps: number;
  platformFeeRateBps: number;
}

export interface OrderPricingResult {
  subtotal: bigint;
  discountTotal: bigint;
  taxTotal: bigint;
  platformFeeTotal: bigint;
  grandTotal: bigint;
}

/**
 * grandTotal = subtotal - discount + tax + platformFee.
 *
 * Tax is computed on the POST-discount taxable base (standard GST practice
 * for a trade discount shown on the invoice) — docs/business-rules.md Q-19
 * default, pending the client's CA confirmation. Platform fee is computed
 * on the PRE-discount subtotal (the platform's fee on the listed value,
 * independent of a buyer-facing coupon) — docs/business-rules.md Q-20
 * default, rate itself TBD and read from system_settings.
 */
export function computeOrderPricing(input: OrderPricingInput): OrderPricingResult {
  if (input.discount > input.subtotal) {
    throw new Error("Discount cannot exceed the order subtotal.");
  }

  const taxableBase = input.subtotal - input.discount;
  const taxTotal = applyRateBps(taxableBase, input.gstRateBps);
  const platformFeeTotal = applyRateBps(input.subtotal, input.platformFeeRateBps);
  const grandTotal = taxableBase + taxTotal + platformFeeTotal;

  return {
    subtotal: input.subtotal,
    discountTotal: input.discount,
    taxTotal,
    platformFeeTotal,
    grandTotal,
  };
}
