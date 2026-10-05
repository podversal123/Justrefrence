// No "server-only" import — orchestration layer, same rationale as
// checkout-service.ts. Its dependencies (order-repository, invoice-repository,
// invoice-pdf, invoice-storage) each carry their own guard.
import {
  createInvoice,
  getInvoiceByOrderId,
  setInvoiceNumber,
  setInvoicePdfPath,
} from "@/server/repositories/commerce/invoice-repository";
import { getOrderDetail } from "@/server/repositories/commerce/order-repository";
import { allocateAmount } from "@/server/domain/commerce/money";
import { formatInvoiceNumber, getFinancialYear } from "@/server/domain/commerce/financial-year";
import { renderInvoicePdf } from "@/server/lib/invoice-pdf";
import { uploadInvoicePdf } from "@/server/lib/invoice-storage";
import { NotFoundError } from "@/server/lib/errors";

type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

/** Renders the invoice PDF from the order row, uploads it, and records its storage path. */
async function renderAndStoreInvoicePdf(
  order: OrderDetail,
  invoice: { id: string; invoiceNumber: string; financialYear: string; issuedAt: Date },
): Promise<string> {
  const pdf = await renderInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    financialYear: invoice.financialYear,
    orderNumber: order.orderNumber ?? order.id,
    issuedAt: invoice.issuedAt,
    buyer: { name: order.buyer.fullName ?? order.buyer.email, email: order.buyer.email },
    vendor: { name: order.vendor.businessName, gstin: order.vendor.gstin },
    items: order.items.map((item) => ({
      title: item.titleSnapshot,
      qty: item.qty,
      unitPrice: item.unitPriceSnapshot.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
    subtotal: order.subtotal.toString(),
    discountTotal: order.discountTotal.toString(),
    gstTotal: order.taxTotal.toString(),
    platformFee: order.platformFeeTotal.toString(),
    grandTotal: order.grandTotal.toString(),
    currency: order.currency,
  });

  const storagePath = `${order.id}/${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`;
  await uploadInvoicePdf(storagePath, pdf);
  await setInvoicePdfPath(invoice.id, storagePath);
  return storagePath;
}

/**
 * Returns the storage path of an order's invoice PDF, creating whatever is
 * missing: the invoice itself, or just its PDF. The PDF step can fail
 * independently of order placement (storage outage, missing bucket) and is
 * deliberately non-fatal there (checkout-service.ts logs and continues) — so
 * the first download after such a failure repairs it instead of leaving the
 * buyer with "invoice not available" forever.
 */
export async function ensureInvoicePdf(orderId: string): Promise<string> {
  let invoice = await getInvoiceByOrderId(orderId);
  if (!invoice) invoice = await generateInvoiceForOrder(orderId);
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (invoice.pdfStoragePath) return invoice.pdfStoragePath;

  const order = await getOrderDetail(orderId);
  if (!order) throw new NotFoundError("Order not found.");
  if (!invoice.invoiceNumber)
    throw new NotFoundError("Invoice is still being numbered. Try again shortly.");

  return renderAndStoreInvoicePdf(order, {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    financialYear: invoice.financialYear,
    issuedAt: invoice.createdAt,
  });
}

/**
 * Generates (or returns the existing) invoice for a PLACED order — one
 * invoice per order, created right after order creation (checkout-service.ts)
 * so the buyer/vendor always have a document to view/download. Every figure
 * is re-read from the order row, never recomputed from anything
 * client-supplied.
 */
export async function generateInvoiceForOrder(orderId: string) {
  const existing = await getInvoiceByOrderId(orderId);
  if (existing) return existing;

  const order = await getOrderDetail(orderId);
  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  const financialYear = getFinancialYear(order.createdAt);

  // GST is allocated across items proportionally to their line total, so
  // the sum of invoice_items.gst_amount always equals orders.tax_total
  // exactly (same allocateAmount() used to split the cross-cart coupon
  // discount — see docs/adr/0013).
  const lineTotals = order.items.map((item) => item.lineTotal);
  const gstShares = allocateAmount(order.taxTotal, lineTotals);

  const created = await createInvoice({
    orderId: order.id,
    financialYear,
    buyerSnapshot: { name: order.buyer.fullName ?? order.buyer.email, email: order.buyer.email },
    vendorSnapshot: { name: order.vendor.businessName, gstin: order.vendor.gstin },
    subtotal: order.subtotal,
    gstTotal: order.taxTotal,
    platformFee: order.platformFeeTotal,
    grandTotal: order.grandTotal,
    items: order.items.map((item, i) => ({
      orderItemId: item.id,
      hsnCode: null,
      gstRateBps: 0, // informational per-line rate isn't tracked separately from the order-level rate in this phase
      gstAmount: gstShares[i] ?? 0n,
      lineTotal: item.lineTotal,
    })),
  });

  const invoiceNumber = formatInvoiceNumber(financialYear, created.invoiceSeq);
  await setInvoiceNumber(created.id, invoiceNumber);

  await renderAndStoreInvoicePdf(order, {
    id: created.id,
    invoiceNumber,
    financialYear,
    issuedAt: created.createdAt,
  });

  return getInvoiceByOrderId(orderId);
}
