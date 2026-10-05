/**
 * Paise ↔ display formatting — see docs/database.md "Money model". Amounts
 * are strings at this boundary (BigInt isn't JSON-safe across the RSC
 * client/server split), so every formatter here takes a string | null.
 */
export function formatPaise(paise: string | null, currency = "INR"): string {
  if (paise === null) return "Quote on request";
  const rupees = Number(BigInt(paise)) / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(rupees);
}

/**
 * Integer paise -> the plain rupee string an editor field should show
 * ("150000" -> "1500", "149950" -> "1499.50"). Exact string arithmetic; the
 * inverse of the catalog schemas' price parsing.
 */
export function paiseToRupeesInput(paise: string | null | undefined): string {
  if (paise === null || paise === undefined || paise === "") return "";
  const value = BigInt(paise);
  const rupees = value / 100n;
  const fraction = value % 100n;
  return fraction === 0n ? rupees.toString() : `${rupees}.${fraction.toString().padStart(2, "0")}`;
}
