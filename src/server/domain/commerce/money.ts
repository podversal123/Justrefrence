/**
 * Integer-only money/rate math — see docs/adr/0002-money-representation.md
 * and docs/adr/0013-commerce-money-math.md. No I/O, no floats, no
 * Decimal/numeric arithmetic anywhere; everything is bigint paise and
 * integer "basis points ×100" rates. Unit-tested directly.
 */

/** Round-half-up integer division: (numerator + denominator/2) / denominator. */
export function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error("denominator must be positive");
  }
  return (numerator + denominator / 2n) / denominator;
}

/**
 * amount (paise) × rate (basis points, i.e. percent×100) → paise,
 * round-half-up. E.g. applyRateBps(10000n, 1850) = round(10000 × 18.5%) = 1850.
 */
export function applyRateBps(amountPaise: bigint, rateBps: number): bigint {
  if (rateBps < 0) {
    throw new Error("rateBps must not be negative");
  }
  return roundHalfUpDiv(amountPaise * BigInt(rateBps), 10000n);
}

/** `18.5` (percent) -> `1850` (basis points). Input boundary only (admin forms), never used in money math itself. */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * Splits `total` across `weights` proportionally, every share rounded down,
 * with the leftover paise (from rounding) added to the LARGEST weight's
 * share — standard "largest remainder" allocation so the shares always sum
 * to exactly `total` (never more, never less because of independent
 * rounding) regardless of how many parts there are. Used to apportion a
 * single cross-cart coupon discount across each vendor's split order.
 */
export function allocateAmount(total: bigint, weights: bigint[]): bigint[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0n);
  if (weightSum === 0n) return weights.map(() => 0n);

  const shares = weights.map((w) => (total * w) / weightSum);
  const allocated = shares.reduce((a, b) => a + b, 0n);
  let remainder = total - allocated;

  // Give the leftover paise to the largest-weight entries first, one paise
  // at a time, so the result never deviates from `total` by even 1 paise.
  const order = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => (b.w > a.w ? 1 : b.w < a.w ? -1 : 0));

  const result = [...shares];
  for (const { i } of order) {
    if (remainder <= 0n) break;
    result[i] = (result[i] ?? 0n) + 1n;
    remainder -= 1n;
  }
  return result;
}
