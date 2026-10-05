import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatPaise } from "@/lib/money";

/**
 * Server-rendered invoice PDF — see docs/adr/0007-pdf-generation.md. Fixed,
 * predictable layout; every figure here is passed in already computed
 * server-side (invoice-service.ts), never trusted from a client.
 */

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  col: { flexDirection: "column", gap: 2 },
  label: { color: "#555" },
  sectionTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  table: { marginTop: 16, borderTop: "1pt solid #ccc" },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #eee",
    paddingVertical: 6,
  },
  tableHeader: { fontFamily: "Helvetica-Bold", backgroundColor: "#f5f5f5" },
  cellTitle: { flex: 3 },
  cellQty: { flex: 1, textAlign: "right" },
  cellPrice: { flex: 1.5, textAlign: "right" },
  totals: { marginTop: 16, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", gap: 24, marginBottom: 2 },
  grandTotal: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 4 },
});

export interface InvoicePdfData {
  invoiceNumber: string;
  financialYear: string;
  orderNumber: string;
  issuedAt: Date;
  buyer: { name: string; email: string };
  vendor: { name: string; gstin: string | null };
  items: { title: string; qty: number; unitPrice: string; lineTotal: string }[];
  subtotal: string;
  discountTotal: string;
  gstTotal: string;
  platformFee: string;
  grandTotal: string;
  currency: string;
}

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Tax Invoice</Text>
        <Text style={styles.subtitle}>
          {data.invoiceNumber} · FY {data.financialYear} · Order {data.orderNumber} ·{" "}
          {data.issuedAt.toISOString().slice(0, 10)}
        </Text>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Billed to</Text>
            <Text>{data.buyer.name}</Text>
            <Text style={styles.label}>{data.buyer.email}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Sold by</Text>
            <Text>{data.vendor.name}</Text>
            {data.vendor.gstin ? <Text style={styles.label}>GSTIN: {data.vendor.gstin}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.cellTitle}>Item</Text>
            <Text style={styles.cellQty}>Qty</Text>
            <Text style={styles.cellPrice}>Unit price</Text>
            <Text style={styles.cellPrice}>Line total</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.cellTitle}>{item.title}</Text>
              <Text style={styles.cellQty}>{item.qty}</Text>
              <Text style={styles.cellPrice}>{formatPaise(item.unitPrice, data.currency)}</Text>
              <Text style={styles.cellPrice}>{formatPaise(item.lineTotal, data.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Subtotal</Text>
            <Text>{formatPaise(data.subtotal, data.currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Discount</Text>
            <Text>-{formatPaise(data.discountTotal, data.currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>GST</Text>
            <Text>{formatPaise(data.gstTotal, data.currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Platform fee</Text>
            <Text>{formatPaise(data.platformFee, data.currency)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>Total</Text>
            <Text>{formatPaise(data.grandTotal, data.currency)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
