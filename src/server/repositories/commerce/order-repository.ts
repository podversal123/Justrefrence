import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogItemKind, OrderStatus } from "@/generated/prisma/enums";
import type { ResolvedDateRange } from "@/server/domain/dashboard/date-range";

type Tx = Prisma.TransactionClient;

export async function findCheckoutByIdempotencyKey(idempotencyKey: string) {
  return prisma.checkout.findUnique({
    where: { idempotencyKey },
    include: { orders: { select: { id: true } } },
  });
}

export async function createCheckout(
  tx: Tx,
  input: { cartId: string; buyerId: string; couponId: string | null; idempotencyKey: string },
) {
  return tx.checkout.create({
    data: {
      cartId: input.cartId,
      buyerId: input.buyerId,
      couponId: input.couponId,
      idempotencyKey: input.idempotencyKey,
      status: "COMPLETED",
    },
  });
}

export async function markCartCheckedOut(tx: Tx, cartId: string) {
  return tx.cart.update({ where: { id: cartId }, data: { status: "CHECKED_OUT" } });
}

/**
 * Atomic conditional decrement — the entire stock-race defense. The WHERE
 * clause (`stock: { gte: qty }`) is re-checked against the row Postgres
 * locks for the UPDATE's duration, so two concurrent decrements against the
 * same low-stock row can never both succeed: whichever commits first wins,
 * the second sees the now-lower stock and this returns count 0. No
 * explicit `SELECT ... FOR UPDATE` needed — see docs/adr/0013.
 */
export async function decrementProductStock(tx: Tx, productId: string, qty: number): Promise<boolean> {
  const result = await tx.product.updateMany({
    where: { id: productId, stock: { gte: qty } },
    data: { stock: { decrement: qty } },
  });
  return result.count === 1;
}

export interface CreateOrderInput {
  checkoutId: string;
  vendorId: string;
  buyerId: string;
  subtotal: bigint;
  discountTotal: bigint;
  taxTotal: bigint;
  platformFeeTotal: bigint;
  grandTotal: bigint;
  currency: string;
}

/** `orderNumber` is null until setOrderNumber() runs — orderSeq isn't known until this row exists. */
export async function createOrder(tx: Tx, input: CreateOrderInput) {
  return tx.order.create({ data: input });
}

export async function setOrderNumber(tx: Tx, orderId: string, orderNumber: string) {
  return tx.order.update({ where: { id: orderId }, data: { orderNumber } });
}

export interface CreateOrderItemInput {
  orderId: string;
  itemType: CatalogItemKind;
  itemId: string;
  titleSnapshot: string;
  unitPriceSnapshot: bigint;
  qty: number;
  lineTotal: bigint;
}

export async function createOrderItems(tx: Tx, items: CreateOrderItemInput[]) {
  return tx.orderItem.createMany({ data: items });
}

export async function createOrderStatusHistory(
  tx: Tx,
  input: {
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actorId: string | null;
    reason?: string | null;
  },
) {
  return tx.orderStatusHistory.create({ data: input });
}

export async function updateOrderStatus(tx: Tx, orderId: string, status: OrderStatus) {
  return tx.order.update({ where: { id: orderId }, data: { status } });
}

export async function getOrderDetail(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      vendor: { select: { id: true, userId: true, businessName: true, gstin: true } },
      buyer: { select: { id: true, email: true, fullName: true } },
      invoice: { select: { id: true, invoiceNumber: true, pdfStoragePath: true } },
    },
  });
}

export interface OrderListQuery {
  cursor?: string;
  limit: number;
  status?: OrderStatus;
}

export async function listOrdersForBuyer(buyerId: string, query: OrderListQuery) {
  const rows = await prisma.order.findMany({
    where: { buyerId, ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: { items: true, vendor: { select: { businessName: true } } },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function listOrdersForVendor(vendorId: string, query: OrderListQuery) {
  const rows = await prisma.order.findMany({
    where: { vendorId, ...(query.status ? { status: query.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: { items: true, buyer: { select: { email: true, fullName: true } } },
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

// --- Vendor dashboard aggregation ---
//
// Vendor-scoped siblings of the platform-wide equivalents in
// src/server/repositories/dashboard/dashboard-repository.ts
// (getOrderCountsByStatus / getTotalOrders / getTotalRevenue /
// getDailyRevenue) — same query shape, with a `vendorId` filter added, so a
// vendor's dashboard numbers are its own orders only. No vendor
// "commission"/"earnings" concept exists (commissions are keyed to the
// referring member, not the vendor); a vendor's own revenue is simply its
// own non-cancelled/refunded order value.

const VENDOR_REVENUE_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"];

function vendorDateWhere(range: ResolvedDateRange) {
  return range.from ? { gte: range.from, lte: range.to } : { lte: range.to };
}

export async function getOrderStatusCountsForVendor(
  vendorId: string,
  range: ResolvedDateRange,
): Promise<{ status: string; count: number }[]> {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: { vendorId, createdAt: vendorDateWhere(range) },
    _count: true,
  });
  return grouped.map((g) => ({ status: g.status, count: g._count }));
}

export async function getTotalOrdersForVendor(vendorId: string, range: ResolvedDateRange): Promise<number> {
  return prisma.order.count({ where: { vendorId, createdAt: vendorDateWhere(range) } });
}

export async function getTotalRevenueForVendor(vendorId: string, range: ResolvedDateRange): Promise<bigint> {
  const result = await prisma.order.aggregate({
    where: { vendorId, createdAt: vendorDateWhere(range), status: { in: VENDOR_REVENUE_STATUSES } },
    _sum: { grandTotal: true },
  });
  return result._sum?.grandTotal ?? 0n;
}

/** Daily revenue series for one vendor — RevenueChart's `data` prop, scoped. Raw SQL for the same day-truncation reason as getDailyRevenue(). */
export async function getDailyRevenueForVendor(
  vendorId: string,
  range: ResolvedDateRange,
): Promise<{ day: string; amount: bigint }[]> {
  const from = range.from ?? new Date(0);
  const rows = await prisma.$queryRaw<{ day: string; amount: bigint }[]>`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           COALESCE(SUM(grand_total), 0)::bigint AS amount
    FROM orders
    WHERE created_at >= ${from} AND created_at <= ${range.to}
      AND vendor_id = ${vendorId}
      AND status IN ('PAID','PROCESSING','SHIPPED','DELIVERED','COMPLETED')
    GROUP BY 1
    ORDER BY 1
  `;
  return rows;
}
