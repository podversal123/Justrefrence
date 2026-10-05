import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  listInvoicesForBuyer,
  listInvoicesForVendor,
} from "@/server/repositories/commerce/order-search-repository";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InvoiceDownloadButton } from "../orders/[id]/invoice-download-button";

export const metadata: Metadata = { title: "Invoices" };

type Tab = "purchases" | "sales";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("invoice:read")) redirect("/unauthorized");

  const isVendor = Boolean(session.vendorProfileId);
  const requested = (await searchParams)["tab"];
  const tab: Tab = isVendor && requested === "sales" ? "sales" : "purchases";

  const invoices =
    tab === "sales" && session.vendorProfileId
      ? await listInvoicesForVendor(session.vendorProfileId)
      : await listInvoicesForBuyer(session.userId);

  const totals = invoices.reduce(
    (acc, inv) => ({
      subtotal: acc.subtotal + inv.subtotal,
      gst: acc.gst + inv.gstTotal,
      total: acc.total + inv.grandTotal,
    }),
    { subtotal: 0n, gst: 0n, total: 0n },
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "purchases", label: "Purchases" },
    ...(isVendor ? [{ key: "sales" as const, label: "Sales" }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>Invoices</h1>
        <p className="text-muted-foreground">
          Your billing history with GST. Each invoice is generated from its order and can be
          downloaded as a PDF.
        </p>
      </div>

      {tabs.length > 1 ? (
        <nav aria-label="Invoice type" className="flex gap-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/invoices?tab=${t.key}` as Route}
              aria-current={t.key === tab ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                t.key === tab
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description={
            tab === "sales"
              ? "Invoices appear here when customers order from you."
              : "An invoice is created automatically every time you place an order."
          }
        />
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["Before GST", totals.subtotal],
              ["GST", totals.gst],
              ["Total billed", totals.total],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border p-4">
                <dt className="text-muted-foreground text-xs">{label as string}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatPaise((value as bigint).toString(), "INR")}
                </dd>
              </div>
            ))}
          </dl>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>{tab === "sales" ? "Buyer" : "Seller"}</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium tabular-nums">
                    {inv.invoiceNumber ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/orders/${inv.order.id}` as Route}
                      className="text-primary hover:underline"
                    >
                      {inv.order.orderNumber ?? "View order"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {tab === "sales"
                      ? (inv.order.buyer.fullName ?? inv.order.buyer.email)
                      : inv.order.vendor.businessName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(inv.createdAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(inv.gstTotal.toString(), inv.order.currency)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPaise(inv.grandTotal.toString(), inv.order.currency)}
                  </TableCell>
                  <TableCell>
                    <InvoiceDownloadButton orderId={inv.order.id} hasInvoice />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
