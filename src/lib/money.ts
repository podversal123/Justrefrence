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

/**
 * Integer paise -> a plain two-decimal rupee string for spreadsheets and reports
 * ("150000" -> "1500.00", "5" -> "0.05", "-150" -> "-1.50"). Exact: no floating point.
 */
export function paiseToFixedRupees(paise: bigint | string): string {
  const value = BigInt(paise);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${rupees}.${fraction}`;
}
