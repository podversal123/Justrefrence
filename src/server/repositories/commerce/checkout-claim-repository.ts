// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. The two ways of
// turning a won auction or an awarded bid into an order share these reads and are tested against a fake database
// client; the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Tx } from "@/server/repositories/transaction";

/** The checkout made under this request key, with its order ids, to answer a repeated payment request. */
export function findCheckoutWithOrders(idempotencyKey: string) {
  return prisma.checkout.findUnique({
    where: { idempotencyKey },
    include: { orders: { select: { id: true } } },
  });
}

/** A cart that exists only to hold the checkout of an order that did not come from shopping. */
export function createCheckedOutCart(tx: Tx, ownerUserId: string) {
  return tx.cart.create({ data: { ownerUserId, status: "CHECKED_OUT" } });
}
