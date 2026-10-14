// No "server-only" import — orchestration layer; every dependency below
// (Prisma, the catalog repository registry, the commerce repositories)
// already carries its own "server-only" guard. Kept importable from
// integration tests with those mocked — see
// tests/integration/checkout-actions.test.ts. Same precedent as
// registration-service.ts (Phase 4) and listing-service.ts (Phase 3).
import { prisma } from "@/server/lib/prisma";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  getOpenCartWithItems,
  getOrCreateOpenCart,
} from "@/server/repositories/commerce/cart-repository";
import { findCouponByCode, getCouponUsage } from "@/server/repositories/commerce/coupon-repository";
import {
  createCheckout,
  findCheckoutByIdempotencyKey,
  markCartCheckedOut,
} from "@/server/repositories/commerce/order-repository";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";
import { getPricingConfig } from "@/server/lib/pricing-config";
import { allocateAmount } from "@/server/domain/commerce/money";
import {
  computeOrderPricing,
  computeSubtotal,
  type PricedLine,
} from "@/server/domain/commerce/pricing";
import { couponFailureMessage, validateCoupon } from "@/server/domain/commerce/coupon";
import { createVendorOrder } from "@/server/domain/commerce/order-creation";
import { generateInvoiceForOrder } from "@/server/domain/commerce/invoice-service";
import { recordAudit } from "@/server/domain/audit/record";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { CatalogItemKind } from "@/generated/prisma/enums";

interface ResolvedLine extends PricedLine {
  itemType: CatalogItemKind;
  itemId: string;
  title: string;
  vendorId: string;
  vendorBusinessName: string;
}

/**
 * Re-fetches EVERY cart item's price/availability from the catalog
 * server-side — the client never supplies a price, and even a price the
 * client remembers from when the item was added to cart is discarded here.
 * Throws if anything is no longer purchasable, so a checkout either
 * proceeds against fully current data or fails outright (never silently
 * drops an item).
 */
async function resolveCartLines(
  items: { itemType: CatalogItemKind; itemId: string; qty: number }[],
): Promise<ResolvedLine[]> {
  const resolved: ResolvedLine[] = [];

  for (const item of items) {
    const repo = getCatalogRepository(item.itemType);
    const listing = await repo.getById(item.itemId);

    if (!listing || listing.deletedAt) {
      throw new ValidationError(`An item in your cart is no longer available.`);
    }
    if (listing.approvalStatus !== "APPROVED" || !listing.isActive) {
      throw new ValidationError(`"${listing.title}" is no longer available.`);
    }
    if (listing.price === null) {
      throw new ValidationError(
        `"${listing.title}" requires a custom quote and can't be checked out directly.`,
      );
    }
    if (item.itemType === "PRODUCT" && listing.stock < item.qty) {
      throw new ConflictError(
        `Only ${listing.stock} left of "${listing.title}" — reduce the quantity.`,
      );
    }

    resolved.push({
      itemType: item.itemType,
      itemId: item.itemId,
      title: listing.title,
      vendorId: listing.vendorId,
      vendorBusinessName: listing.vendor?.businessName ?? "—",
      unitPrice: listing.price as bigint,
      qty: item.qty,
    });
  }

  return resolved;
}

function groupByVendor(lines: ResolvedLine[]): Map<string, ResolvedLine[]> {
  const groups = new Map<string, ResolvedLine[]>();
  for (const line of lines) {
    const existing = groups.get(line.vendorId);
    if (existing) existing.push(line);
    else groups.set(line.vendorId, [line]);
  }
  return groups;
}

export interface PlaceOrderResult {
  checkoutId: string;
  orderIds: string[];
}

export async function placeOrder(
  buyerId: string,
  memberId: string,
  input: { idempotencyKey: string; couponCode?: string },
): Promise<PlaceOrderResult> {
  // Idempotent replay: the exact same submission returns the exact same
  // result instead of creating anything new — this is what makes a
  // doubled-up checkout request (double-click, network retry) safe.
  const idempotencyKey = scopedIdempotencyKey("checkout", buyerId, input.idempotencyKey);
  const existingCheckout = await findCheckoutByIdempotencyKey(idempotencyKey);
  if (existingCheckout) {
    return { checkoutId: existingCheckout.id, orderIds: existingCheckout.orders.map((o) => o.id) };
  }

  const cart = await getOpenCartWithItems(buyerId);
  if (!cart || cart.items.length === 0) {
    throw new ValidationError("Your cart is empty.");
  }

  const resolvedLines = await resolveCartLines(cart.items);
  const cartSubtotal = computeSubtotal(resolvedLines);
  const vendorGroups = [...groupByVendor(resolvedLines).entries()];

  const coupon = input.couponCode ? await findCouponByCode(input.couponCode) : null;
  if (input.couponCode && !coupon) {
    throw new ValidationError(couponFailureMessage("NOT_FOUND"));
  }

  let totalDiscount = 0n;
  if (coupon) {
    const usage = await getCouponUsage(coupon.id, memberId);
    const validation = validateCoupon(coupon, cartSubtotal, usage, new Date(), memberId);
    if (!validation.valid) {
      throw new ValidationError(couponFailureMessage(validation.failure!));
    }
    totalDiscount = validation.discount!;
  }

  const vendorSubtotals = vendorGroups.map(([, lines]) => computeSubtotal(lines));
  const discountShares = allocateAmount(totalDiscount, vendorSubtotals);
  const pricingConfig = await getPricingConfig();

  let result: PlaceOrderResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const checkout = await createCheckout(tx, {
        cartId: cart.id,
        buyerId,
        couponId: coupon?.id ?? null,
        idempotencyKey,
      });

      const orderIds: string[] = [];

      for (let i = 0; i < vendorGroups.length; i++) {
        const [vendorId, lines] = vendorGroups[i]!;
        const created = await createVendorOrder(tx, {
          checkoutId: checkout.id,
          vendorId,
          buyerId,
          memberId,
          lines: lines.map((line) => ({
            itemType: line.itemType,
            itemId: line.itemId,
            title: line.title,
            unitPrice: line.unitPrice,
            qty: line.qty,
          })),
          discount: discountShares[i]!,
          couponId: coupon?.id ?? null,
          gstRateBps: pricingConfig.gstRateBps,
          platformFeeRateBps: pricingConfig.platformFeeRateBps,
        });
        orderIds.push(created.orderId);
      }

      await markCartCheckedOut(tx, cart.id);
      await getOrCreateOpenCart(buyerId); // the buyer's next "add to cart" needs a fresh OPEN cart

      return { checkoutId: checkout.id, orderIds };
    });
  } catch (error) {
    // Concurrent same-key submission: the unique index rejected the loser
    // (its whole transaction, including stock decrements, rolled back) —
    // answer with the winner's result, exactly like a sequential replay.
    if (isUniqueConstraintViolation(error)) {
      const winner = await findCheckoutByIdempotencyKey(idempotencyKey);
      if (winner) return { checkoutId: winner.id, orderIds: winner.orders.map((o) => o.id) };
    }
    throw error;
  }

  await recordAudit({
    actorId: buyerId,
    action: "ORDER_PLACED",
    entityType: "checkouts",
    entityId: result.checkoutId,
    after: { orderIds: result.orderIds, idempotencyKey },
  });

  for (const orderId of result.orderIds) {
    try {
      await generateInvoiceForOrder(orderId);
    } catch (error) {
      // Invoice generation failing must never undo an already-placed,
      // already-paid-for-stock order — same "log and continue" boundary as
      // welcome-notification delivery in Phase 4.
      logger.error("invoice_generation_failed", {
        orderId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export interface CheckoutPreviewGroup {
  vendorId: string;
  vendorBusinessName: string | undefined;
  lines: ResolvedLine[];
  pricing: ReturnType<typeof computeOrderPricing>;
}

export interface CheckoutPreview {
  groups: CheckoutPreviewGroup[];
  couponError: string | null;
  totalDiscount: bigint;
  grandTotal: bigint;
}

/**
 * Read-only — same resolveCartLines()/groupByVendor()/pricing math as
 * placeOrder(), but nothing is written. Used by the /checkout review page so
 * what the buyer sees is provably the same figures placeOrder() will charge,
 * not a separately-maintained estimate that could drift.
 */
export async function getCheckoutPreview(
  buyerId: string,
  memberId: string,
  couponCode?: string,
): Promise<CheckoutPreview> {
  const cart = await getOpenCartWithItems(buyerId);
  if (!cart || cart.items.length === 0) {
    throw new NotFoundError("Your cart is empty.");
  }

  const resolvedLines = await resolveCartLines(cart.items);
  const cartSubtotal = computeSubtotal(resolvedLines);
  const vendorGroups = [...groupByVendor(resolvedLines).entries()];

  let totalDiscount = 0n;
  let couponError: string | null = null;
  if (couponCode) {
    const coupon = await findCouponByCode(couponCode);
    if (!coupon) {
      couponError = couponFailureMessage("NOT_FOUND");
    } else {
      const usage = await getCouponUsage(coupon.id, memberId);
      const validation = validateCoupon(coupon, cartSubtotal, usage, new Date(), memberId);
      if (!validation.valid) {
        couponError = couponFailureMessage(validation.failure!);
      } else {
        totalDiscount = validation.discount!;
      }
    }
  }

  const vendorSubtotals = vendorGroups.map(([, lines]) => computeSubtotal(lines));
  const discountShares = allocateAmount(totalDiscount, vendorSubtotals);
  const pricingConfig = await getPricingConfig();

  const groups: CheckoutPreviewGroup[] = vendorGroups.map(([vendorId, lines], i) => ({
    vendorId,
    vendorBusinessName: lines[0]?.vendorBusinessName,
    lines,
    pricing: computeOrderPricing({
      subtotal: vendorSubtotals[i]!,
      discount: discountShares[i]!,
      gstRateBps: pricingConfig.gstRateBps,
      platformFeeRateBps: pricingConfig.platformFeeRateBps,
    }),
  }));

  return {
    groups,
    couponError,
    totalDiscount,
    grandTotal: groups.reduce((sum, g) => sum + g.pricing.grandTotal, 0n),
  };
}
