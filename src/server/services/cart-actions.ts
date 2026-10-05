"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  findCartItem,
  getCartItemOwnedBy,
  getOrCreateOpenCart,
  removeCartItem,
  upsertCartItemQty,
} from "@/server/repositories/commerce/cart-repository";
import {
  addToCartSchema,
  removeCartItemSchema,
  updateCartItemSchema,
} from "@/lib/schemas/commerce";
import { AppError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

/**
 * Cart mutations — "own cart only" (docs/rbac.md §4, `cart:manage`), always
 * derived from the caller's own session, never a client-supplied cart id.
 */

function requestId() {
  return crypto.randomUUID();
}

function failureFrom(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): ApiResult<never> {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      meta: { requestId: requestId() },
    };
  }
  logger.error("cart_action_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallback },
    meta: { requestId: requestId() },
  };
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ValidationError("Please sign in to manage your cart.");
  return user.id;
}

export async function addToCartAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return failureFrom(error);
  }

  const parsed = addToCartSchema.safeParse({
    itemType: formData.get("itemType"),
    itemId: formData.get("itemId"),
    qty: formData.get("qty") ?? "1",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid item.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  try {
    const listing = await getCatalogRepository(parsed.data.itemType).getById(parsed.data.itemId);
    if (
      !listing ||
      listing.deletedAt ||
      listing.approvalStatus !== "APPROVED" ||
      !listing.isActive
    ) {
      throw new NotFoundError("That item is not available.");
    }
    if (listing.price === null) {
      throw new ValidationError(
        "This item requires a custom quote and can't be added to the cart.",
      );
    }

    const cart = await getOrCreateOpenCart(userId);
    const existing = await findCartItem(cart.id, parsed.data.itemType, parsed.data.itemId);
    const nextQty = (existing?.qty ?? 0) + parsed.data.qty;

    if (parsed.data.itemType === "PRODUCT" && listing.stock < nextQty) {
      throw new ValidationError(`Only ${listing.stock} left in stock.`);
    }

    await upsertCartItemQty(cart.id, parsed.data.itemType, parsed.data.itemId, nextQty);
  } catch (error) {
    return failureFrom(error, "Could not add that item to your cart.");
  }

  revalidatePath("/cart");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function updateCartItemQtyAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return failureFrom(error);
  }

  const parsed = updateCartItemSchema.safeParse({
    cartItemId: formData.get("cartItemId"),
    qty: formData.get("qty"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid quantity." },
      meta: { requestId: requestId() },
    };
  }

  try {
    const cartItem = await getCartItemOwnedBy(userId, parsed.data.cartItemId);
    if (!cartItem) throw new NotFoundError("Cart item not found.");

    const listing = await getCatalogRepository(cartItem.itemType).getById(cartItem.itemId);
    if (listing && cartItem.itemType === "PRODUCT" && listing.stock < parsed.data.qty) {
      throw new ValidationError(`Only ${listing.stock} left in stock.`);
    }

    await upsertCartItemQty(cartItem.cartId, cartItem.itemType, cartItem.itemId, parsed.data.qty);
  } catch (error) {
    return failureFrom(error, "Could not update your cart.");
  }

  revalidatePath("/cart");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function removeCartItemAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return failureFrom(error);
  }

  const parsed = removeCartItemSchema.safeParse({ cartItemId: formData.get("cartItemId") });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid request." },
      meta: { requestId: requestId() },
    };
  }

  const cartItem = await getCartItemOwnedBy(userId, parsed.data.cartItemId);
  if (!cartItem) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Cart item not found." },
      meta: { requestId: requestId() },
    };
  }

  await removeCartItem(cartItem.cartId, cartItem.id);

  revalidatePath("/cart");
  return { success: true, data: null, meta: { requestId: requestId() } };
}
