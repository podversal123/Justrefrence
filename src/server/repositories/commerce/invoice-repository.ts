import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface CreateInvoiceInput {
  orderId: string;
  financialYear: string;
  buyerSnapshot: Prisma.InputJsonObject;
  vendorSnapshot: Prisma.InputJsonObject;
  subtotal: bigint;
  gstTotal: bigint;
  platformFee: bigint;
  grandTotal: bigint;
  items: {
    orderItemId: string;
    hsnCode: string | null;
    gstRateBps: number;
    gstAmount: bigint;
    lineTotal: bigint;
  }[];
}

/**
 * Two-step create, same reason as MemberProfile/Order: `invoiceSeq` (which
 * `invoiceNumber` is formatted from) isn't known until the row exists.
 */
export async function createInvoice(input: CreateInvoiceInput) {
  const created = await prisma.invoice.create({
    data: {
      orderId: input.orderId,
      financialYear: input.financialYear,
      buyerSnapshot: input.buyerSnapshot,
      vendorSnapshot: input.vendorSnapshot,
      subtotal: input.subtotal,
      gstTotal: input.gstTotal,
      platformFee: input.platformFee,
      grandTotal: input.grandTotal,
      items: { createMany: { data: input.items } },
    },
  });
  return created;
}

export async function setInvoiceNumber(invoiceId: string, invoiceNumber: string) {
  return prisma.invoice.update({ where: { id: invoiceId }, data: { invoiceNumber } });
}

export async function setInvoicePdfPath(invoiceId: string, pdfStoragePath: string) {
  return prisma.invoice.update({ where: { id: invoiceId }, data: { pdfStoragePath } });
}

export async function getInvoiceByOrderId(orderId: string) {
  return prisma.invoice.findUnique({ where: { orderId }, include: { items: true } });
}
