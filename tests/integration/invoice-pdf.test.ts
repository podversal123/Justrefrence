import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { renderInvoicePdf } = await import("@/server/lib/invoice-pdf");

const base = {
  invoiceNumber: "INV/2026-27/000001",
  financialYear: "2026-27",
  orderNumber: "ORD-000001",
  issuedAt: new Date("2026-10-19T10:00:00Z"),
  buyer: { name: "Buyer", email: "buyer@example.com" },
  vendor: { name: "Vendor Pvt Ltd", gstin: null },
  subtotal: "105000",
  discountTotal: "0",
  gstTotal: "0",
  platformFee: "0",
  grandTotal: "105000",
  currency: "INR",
};

describe("renderInvoicePdf", () => {
  it("renders a PDF for items with and without a listing ID", async () => {
    const pdf = await renderInvoicePdf({
      ...base,
      items: [
        {
          title: "ABC Fire Extinguisher 4 kg",
          listingId: "PRD-000001",
          qty: 1,
          unitPrice: "100000",
          lineTotal: "100000",
        },
        { title: "Item from before listing IDs", qty: 1, unitPrice: "5000", lineTotal: "5000" },
      ],
    } as never);
    const bytes = Buffer.from(pdf as Uint8Array);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
