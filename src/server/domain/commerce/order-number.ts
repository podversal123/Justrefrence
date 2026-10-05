/**
 * Pure order-number formatting — mirrors
 * src/server/domain/identity/member-id.ts's two-step pattern (the
 * DB-assigned `orderSeq` isn't known until the row exists).
 */
const ORDER_NUMBER_PREFIX = "ORD-";
const ORDER_NUMBER_PAD = 6;

export function formatOrderNumber(orderSeq: bigint): string {
  return `${ORDER_NUMBER_PREFIX}${orderSeq.toString().padStart(ORDER_NUMBER_PAD, "0")}`;
}
