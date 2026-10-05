import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { OrderStatus } from "@/generated/prisma/enums";

const PAGE_SIZE = 50;

export interface StaffOrderFilter {
  /** Matches order number, invoice number, buyer email/name or vendor business name. */
  search?: string;
  status?: OrderStatus;
  /** Inclusive date range on order date (YYYY-MM-DD). */
  from?: string;
  to?: string;
  cursor?: string;
}

function dayRange(from?: string, to?: string) {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end;
  }
  return Object.keys(range).length ? range : undefined;
}

/**
 * Staff-wide order search ("Members Invoice Search" in the workflow doc):
 * one box finds an order by its number, its invoice number, the buyer or the
 * vendor. Keyset-paginated; selects list columns only.
 */
export async function searchOrdersForStaff(filter: StaffOrderFilter) {
  const search = filter.search?.trim();
  const createdAt = dayRange(filter.from, filter.to);

  const rows = await prisma.order.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" } },
              { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
              { buyer: { email: { contains: search, mode: "insensitive" } } },
              { buyer: { fullName: { contains: search, mode: "insensitive" } } },
              { vendor: { businessName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      orderNumber: true,
      status: true,
      grandTotal: true,
      currency: true,
      createdAt: true,
      buyer: { select: { fullName: true, email: true } },
      vendor: { select: { businessName: true } },
      invoice: { select: { invoiceNumber: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const orders = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { orders, nextCursor: hasMore ? (orders.at(-1)?.id ?? null) : null };
}

const INVOICE_LIST_SELECT = {
  id: true,
  invoiceNumber: true,
  financialYear: true,
  subtotal: true,
  gstTotal: true,
  platformFee: true,
  grandTotal: true,
  createdAt: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      currency: true,
      buyer: { select: { fullName: true, email: true } },
      vendor: { select: { businessName: true } },
    },
  },
} as const;

const INVOICE_LIMIT = 100;

/** Invoices for orders this user BOUGHT. */
export async function listInvoicesForBuyer(buyerId: string) {
  return prisma.invoice.findMany({
    where: { order: { buyerId } },
    orderBy: { createdAt: "desc" },
    take: INVOICE_LIMIT,
    select: INVOICE_LIST_SELECT,
  });
}

/** Invoices for orders placed with this vendor (sales). */
export async function listInvoicesForVendor(vendorId: string) {
  return prisma.invoice.findMany({
    where: { order: { vendorId } },
    orderBy: { createdAt: "desc" },
    take: INVOICE_LIMIT,
    select: INVOICE_LIST_SELECT,
  });
}
