// No "server-only" import — orchestration layer, same rationale as checkout-service.ts
// (every repository below already carries its own guard).
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogItemKind } from "@/generated/prisma/enums";
import {
  createOrder,
  createOrderItems,
  createOrderStatusHistory,
  decrementProductStock,
  setOrderNumber,
} from "@/server/repositories/commerce/order-repository";
import { createCouponRedemption } from "@/server/repositories/commerce/coupon-repository";
import { computeOrderPricing, computeSubtotal } from "@/server/domain/commerce/pricing";
import { formatOrderNumber } from "@/server/domain/commerce/order-number";
import { createPendingCommissionsForOrder } from "@/server/domain/commission/commission-service";
import { ConflictError } from "@/server/lib/errors";

export interface OrderLineInput {
  itemType: CatalogItemKind;
  itemId: string;
  title: string;
  unitPrice: bigint;
  qty: number;
}

/**
 * Writes ONE vendor's order inside the caller's transaction: stock, pricing,
 * order + number, items, status history, optional coupon redemption and the
 * pending commissions. Shared by cart checkout and auction payment so the two
 * can never drift apart. Everything is atomic with the caller's transaction —
 * if any step throws, no order, stock change or commission is left behind.
 */
export async function createVendorOrder(
  tx: Prisma.TransactionClient,
  input: {
    checkoutId: string;
    vendorId: string;
    buyerId: string;
    memberId: string;
    lines: OrderLineInput[];
    discount: bigint;
    couponId: string | null;
    gstRateBps: number;
    platformFeeRateBps: number;
  },
): Promise<{ orderId: string; grandTotal: bigint }> {
  const { lines } = input;

  // Stock defense happens INSIDE the transaction, per line, before any order row is
  // written — if a product is out of stock by now the whole transaction rolls back.
  for (const line of lines) {
    if (line.itemType === "PRODUCT") {
      const ok = await decrementProductStock(tx, line.itemId, line.qty);
      if (!ok) {
        throw new ConflictError(`"${line.title}" just sold out — please update your cart.`);
      }
    }
  }

  const pricing = computeOrderPricing({
    subtotal: computeSubtotal(lines),
    discount: input.discount,
    gstRateBps: input.gstRateBps,
    platformFeeRateBps: input.platformFeeRateBps,
  });

  const order = await createOrder(tx, {
    checkoutId: input.checkoutId,
    vendorId: input.vendorId,
    buyerId: input.buyerId,
    subtotal: pricing.subtotal,
    discountTotal: pricing.discountTotal,
    taxTotal: pricing.taxTotal,
    platformFeeTotal: pricing.platformFeeTotal,
    grandTotal: pricing.grandTotal,
    currency: "INR",
  });

  await setOrderNumber(tx, order.id, formatOrderNumber(order.orderSeq));
  await createOrderItems(
    tx,
    lines.map((line) => ({
      orderId: order.id,
      itemType: line.itemType,
      itemId: line.itemId,
      titleSnapshot: line.title,
      unitPriceSnapshot: line.unitPrice,
      qty: line.qty,
      lineTotal: line.unitPrice * BigInt(line.qty),
    })),
  );
  await createOrderStatusHistory(tx, {
    orderId: order.id,
    fromStatus: null,
    toStatus: "PLACED",
    actorId: input.buyerId,
  });

  if (input.couponId && input.discount > 0n) {
    await createCouponRedemption(tx, {
      couponId: input.couponId,
      memberId: input.memberId,
      orderId: order.id,
      amountDiscounted: input.discount,
    });
  }

  // Commission accrual is atomic with order creation — if anything in this transaction
  // fails, no PENDING commission is left dangling for an order that never got placed.
  await createPendingCommissionsForOrder(
    tx,
    {
      id: order.id,
      buyerId: input.buyerId,
      buyerMemberId: input.memberId,
      platformFeeTotal: pricing.platformFeeTotal,
    },
    lines.map((line) => ({
      itemType: line.itemType,
      lineTotal: line.unitPrice * BigInt(line.qty),
    })),
  );

  return { orderId: order.id, grandTotal: pricing.grandTotal };
}
