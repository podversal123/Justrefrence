import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { searchOrdersForStaff } from "@/server/repositories/commerce/order-search-repository";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import { StatusBadge, statusLabel } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPaise } from "@/lib/money";
import type { OrderStatus } from "@/generated/prisma/enums";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("All orders") };
}

const STATUSES: OrderStatus[] = [
  "PLACED",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("order:read:any")) redirect("/unauthorized");

  const params = await searchParams;
  const status = STATUSES.find((s) => s === params["status"]);
  const search = params["search"]?.slice(0, 100);
  const from = params["from"] && DATE_RE.test(params["from"]) ? params["from"] : undefined;
  const to = params["to"] && DATE_RE.test(params["to"]) ? params["to"] : undefined;

  const { orders, nextCursor } = await searchOrdersForStaff({
    search,
    status,
    from,
    to,
    cursor: params["cursor"],
  });
  const filtered = Boolean(search || status || from || to);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1>{t("All orders")}</h1>
        <p className="text-muted-foreground">
          {t("Search every order by order number, invoice number, buyer or vendor.")}
        </p>
      </div>

      <form method="get" role="search" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="o-search" className="text-xs font-medium">
            {t("Search")}
          </label>
          <Input
            id="o-search"
            name="search"
            defaultValue={search}
            placeholder={t("ORD-000001, INV/2026-27/…, buyer or vendor")}
            className="w-72"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="o-status" className="text-xs font-medium">
            {t("Status")}
          </label>
          <NativeSelect id="o-status" name="status" defaultValue={status ?? ""} className="w-40">
            <option value="">{t("All")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(statusLabel(s))}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <label htmlFor="o-from" className="text-xs font-medium">
            {t("From")}
          </label>
          <Input id="o-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="o-to" className="text-xs font-medium">
            {t("To")}
          </label>
          <Input id="o-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">{t("Apply")}</Button>
        {filtered ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={"/admin/orders" as Route}>{t("Clear")}</Link>}
          />
        ) : null}
      </form>

      {orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("No orders found")}
          description={
            filtered
              ? t("Try widening the filters.")
              : t("Orders appear here as customers place them.")
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Order")}</TableHead>
                <TableHead>{t("Invoice")}</TableHead>
                <TableHead>{t("Buyer")}</TableHead>
                <TableHead>{t("Vendor")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Date")}</TableHead>
                <TableHead className="text-right">{t("Total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${order.id}` as Route}
                      className="text-primary font-medium hover:underline"
                    >
                      {order.orderNumber ?? "View"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {order.invoice?.invoiceNumber ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.buyer.fullName ?? order.buyer.email}
                  </TableCell>
                  <TableCell className="text-sm">{order.vendor.businessName}</TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(order.createdAt)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPaise(order.grandTotal.toString(), order.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CursorPagination nextCursor={nextCursor} />
        </>
      )}
    </div>
  );
}
