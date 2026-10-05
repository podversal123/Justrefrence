import "server-only";
import { getOpenCartWithItems } from "@/server/repositories/commerce/cart-repository";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { computeSubtotal } from "@/server/domain/commerce/pricing";
import type { CatalogItemKind } from "@/generated/prisma/enums";

/**
 * Read-only cart composition for the cart page — re-fetches each item's
 * CURRENT price/availability (never trusts anything cached on the cart row
 * itself, which only ever stores itemType/itemId/qty) and flags items that
 * are no longer purchasable rather than silently hiding them, so the buyer
 * can see why their total might differ from what they remembered.
 */

export interface CartLineView {
  cartItemId: string;
  itemType: CatalogItemKind;
  itemId: string;
  title: string;
  slug: string | null;
  primaryImagePath: string | null;
  vendorId: string;
  vendorBusinessName: string;
  unitPrice: bigint | null;
  qty: number;
  maxQty: number | null;
  available: boolean;
  unavailableReason: string | null;
}

export interface CartVendorGroup {
  vendorId: string;
  vendorBusinessName: string;
  lines: CartLineView[];
  subtotal: bigint;
}

export interface CartView {
  cartId: string | null;
  groups: CartVendorGroup[];
  subtotal: bigint;
  hasUnavailableItems: boolean;
  isEmpty: boolean;
}

export async function buildCartView(userId: string): Promise<CartView> {
  const cart = await getOpenCartWithItems(userId);
  if (!cart || cart.items.length === 0) {
    return { cartId: cart?.id ?? null, groups: [], subtotal: 0n, hasUnavailableItems: false, isEmpty: true };
  }

  const lines: CartLineView[] = [];

  for (const item of cart.items) {
    const repo = getCatalogRepository(item.itemType);
    const listing = await repo.getById(item.itemId);

    if (!listing || listing.deletedAt) {
      lines.push({
        cartItemId: item.id,
        itemType: item.itemType,
        itemId: item.itemId,
        title: "Item no longer available",
        slug: null,
        primaryImagePath: null,
        vendorId: "",
        vendorBusinessName: "",
        unitPrice: null,
        qty: item.qty,
        maxQty: null,
        available: false,
        unavailableReason: "This listing has been removed.",
      });
      continue;
    }

    const isActive = listing.approvalStatus === "APPROVED" && listing.isActive;
    const stock: number | null = item.itemType === "PRODUCT" ? listing.stock : null;
    const outOfStock = stock !== null && stock < item.qty;

    lines.push({
      cartItemId: item.id,
      itemType: item.itemType,
      itemId: item.itemId,
      title: listing.title,
      slug: listing.slug,
      primaryImagePath: listing.images?.[0]?.storagePath ?? null,
      vendorId: listing.vendorId,
      vendorBusinessName: listing.vendor?.businessName ?? "—",
      unitPrice: listing.price,
      qty: item.qty,
      maxQty: stock,
      available: isActive && listing.price !== null && !outOfStock,
      unavailableReason: !isActive
        ? "No longer available."
        : listing.price === null
          ? "Requires a custom quote."
          : outOfStock
            ? `Only ${stock} left in stock.`
            : null,
    });
  }

  const groupsByVendor = new Map<string, CartLineView[]>();
  for (const line of lines) {
    const key = line.vendorId || "unavailable";
    const existing = groupsByVendor.get(key);
    if (existing) existing.push(line);
    else groupsByVendor.set(key, [line]);
  }

  const groups: CartVendorGroup[] = [...groupsByVendor.entries()].map(([vendorId, groupLines]) => ({
    vendorId,
    vendorBusinessName: groupLines[0]?.vendorBusinessName ?? "—",
    lines: groupLines,
    subtotal: computeSubtotal(
      groupLines.filter((l) => l.available).map((l) => ({ unitPrice: l.unitPrice!, qty: l.qty })),
    ),
  }));

  return {
    cartId: cart.id,
    groups,
    subtotal: groups.reduce((sum, g) => sum + g.subtotal, 0n),
    hasUnavailableItems: lines.some((l) => !l.available),
    isEmpty: false,
  };
}
