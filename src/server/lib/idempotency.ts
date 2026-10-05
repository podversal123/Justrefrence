/**
 * Idempotency keys arrive from the browser (`crypto.randomUUID()` in the
 * form components) and the DB columns are globally `@unique`. Two
 * consequences handled here, server-side, so no caller can get them wrong:
 *
 * 1. A raw client key could collide with — or deliberately replay — another
 *    user's key, returning someone else's checkout/payment/payout. Every
 *    client-supplied key is therefore namespaced by operation + acting user
 *    before it touches the DB, so a key is only ever valid for the
 *    (operation, user) that created it.
 * 2. Two concurrent requests with the SAME key can both pass the
 *    "already exists?" pre-check; the unique index then rejects the loser
 *    with Prisma P2002. Callers use isUniqueConstraintViolation() to turn
 *    that into a normal idempotent replay instead of a raw error.
 *
 * A client can still mint a fresh key per request — that cannot be
 * prevented by any key scheme — so money-moving flows also carry a
 * key-independent server-side duplicate guard (see payout-service.ts,
 * payment-service.ts, wallet-actions.ts).
 */
export type IdempotencyScope = "checkout" | "payment-order" | "payout" | "admin-topup";

export function scopedIdempotencyKey(
  scope: IdempotencyScope,
  actorId: string,
  clientKey: string,
): string {
  return `${scope}:${actorId}:${clientKey}`;
}

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}
