import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { CatalogItemKind } from "@/generated/prisma/enums";

/**
 * "One open cart per user" is an application-level invariant (Prisma has no
 * partial/filtered unique index in its schema DSL) — see the schema comment
 * on the Cart model and docs/adr/0013-commerce-money-math.md.
 */
export async function getOrCreateOpenCart(ownerUserId: string) {
  const existing = await prisma.cart.findFirst({ where: { ownerUserId, status: "OPEN" } });
  if (existing) return existing;
  return prisma.cart.create({ data: { ownerUserId, status: "OPEN" } });
}

export async function getOpenCartWithItems(ownerUserId: string) {
  return prisma.cart.findFirst({
    where: { ownerUserId, status: "OPEN" },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
}

export async function findCartItem(cartId: string, itemType: CatalogItemKind, itemId: string) {
  return prisma.cartItem.findUnique({
    where: { cartId_itemType_itemId: { cartId, itemType, itemId } },
  });
}

export async function upsertCartItemQty(
  cartId: string,
  itemType: CatalogItemKind,
  itemId: string,
  qty: number,
) {
  return prisma.cartItem.upsert({
    where: { cartId_itemType_itemId: { cartId, itemType, itemId } },
    update: { qty },
    create: { cartId, itemType, itemId, qty },
  });
}

export async function removeCartItem(cartId: string, cartItemId: string) {
  return prisma.cartItem.deleteMany({ where: { id: cartItemId, cartId } });
}

/** Lightweight count for header badges — no per-item catalog lookups, unlike buildCartView(). */
export async function countOpenCartItems(ownerUserId: string): Promise<number> {
  const cart = await prisma.cart.findFirst({ where: { ownerUserId, status: "OPEN" } });
  if (!cart) return 0;
  return prisma.cartItem.count({ where: { cartId: cart.id } });
}

export async function getCartItemOwnedBy(ownerUserId: string, cartItemId: string) {
  return prisma.cartItem.findFirst({
    where: { id: cartItemId, cart: { ownerUserId, status: "OPEN" } },
  });
}
