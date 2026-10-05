/**
 * Deterministic commission calculation — pure, no I/O, unit-tested
 * directly. Reuses the exact same integer basis-points rate math already
 * established for coupons/GST/platform-fee (src/server/domain/commerce/money.ts)
 * — see docs/adr/0013-commerce-money-math.md and
 * docs/adr/0014-commission-engine.md. Never a float, never Decimal,
 * anywhere in this file.
 */
import { applyRateBps } from "@/server/domain/commerce/money";

export type CommissionRateBasis =
  | "PERCENT_OF_ORDER"
  | "PERCENT_OF_VENDOR_SALE"
  | "PERCENT_OF_PLATFORM_FEE"
  | "FIXED";

export interface CommissionRateSnapshot {
  rateBasis: CommissionRateBasis;
  rateValueBps: number | null;
  rateValueFixed: bigint | null;
}

/**
 * `baseAmount` is whatever the caller already resolved as the correct base
 * for this rule's basis (order/vendor-sale subtotal for the matching kind,
 * or platform fee total) — see docs/adr/0014 for why that resolution lives
 * one layer up (commission-service.ts), not here. This function is
 * intentionally ignorant of orders/kinds: given a basis + rate + base, the
 * calculated amount is always the same number, which is exactly what
 * "deterministic and auditable" requires.
 */
export function computeCommissionAmount(rule: CommissionRateSnapshot, baseAmount: bigint): bigint {
  if (rule.rateBasis === "FIXED") {
    if (rule.rateValueFixed === null) {
      throw new Error("FIXED commission rules must set rateValueFixed.");
    }
    return rule.rateValueFixed;
  }

  if (rule.rateValueBps === null) {
    throw new Error(`${rule.rateBasis} commission rules must set rateValueBps.`);
  }
  if (baseAmount < 0n) {
    throw new Error("Commission calculation base cannot be negative.");
  }
  return applyRateBps(baseAmount, rule.rateValueBps);
}
