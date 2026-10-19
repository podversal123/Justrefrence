/**
 * The public ID of a product, service or project, such as `PRD-000123`.
 *
 * It is worked out from `listingSeq`, a number the database hands out one per listing (each kind
 * has its own counter), so two listings of a kind can never share an ID and nothing here needs a
 * lookup or a retry. The prefix says which kind it is. Pure, no I/O.
 */
import type { CatalogKind } from "@/server/domain/catalog/types";

const PREFIX: Record<CatalogKind, string> = {
  PRODUCT: "PRD",
  SERVICE: "SRV",
  PROJECT: "PRJ",
};

const KIND_BY_PREFIX = new Map(
  (Object.entries(PREFIX) as [CatalogKind, string][]).map(([kind, prefix]) => [prefix, kind]),
);

/** Six digits to start with; a seventh digit simply appears after 999,999 listings of a kind. */
const MIN_DIGITS = 6;

/** `("PRODUCT", 123n)` -> `"PRD-000123"`. */
export function formatListingId(kind: CatalogKind, seq: bigint | number | string): string {
  const digits = BigInt(seq).toString();
  if (BigInt(seq) < 1n) throw new RangeError("A listing number starts at 1.");
  return `${PREFIX[kind]}-${digits.padStart(MIN_DIGITS, "0")}`;
}

/** `"prd-000123"` -> `{ kind: "PRODUCT", seq: 123n }`; anything else -> `null`. */
export function parseListingId(text: string): { kind: CatalogKind; seq: bigint } | null {
  const match = /^([A-Za-z]{3})-(\d{1,18})$/.exec(text.trim());
  if (!match) return null;
  const kind = KIND_BY_PREFIX.get(match[1]!.toUpperCase());
  const seq = BigInt(match[2]!);
  return kind && seq >= 1n ? { kind, seq } : null;
}
