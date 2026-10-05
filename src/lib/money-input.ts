/**
 * Exact rupee-string -> paise conversion for form fields (never floating
 * point; see docs/database.md "Money model"). Accepts "1500" or "1499.50"
 * (at most 2 decimals, at most 10 integer digits) and returns BigInt paise,
 * or null for anything else.
 */
export function rupeesToPaise(value: string | null | undefined): bigint | null {
  const text = (value ?? "").trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
}
