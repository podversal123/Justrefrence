import type { TranslateVars } from "@/i18n/locales";

/**
 * Bidders are shown as "Bidder 1", "Bidder 2" ... while identities are hidden. The domain code
 * builds that English label; this turns it into the visitor's language and leaves a real name alone.
 */
export function bidderLabelText(
  label: string,
  t: (text: string, vars?: TranslateVars) => string,
): string {
  const match = /^Bidder (\d+)$/.exec(label);
  return match ? t("Bidder {n}", { n: match[1]! }) : label;
}
