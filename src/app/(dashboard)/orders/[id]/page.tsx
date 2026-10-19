import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getOrderDetail } from "@/server/repositories/commerce/order-repository";
import { canViewOrder, resolveActorRole } from "@/server/domain/commerce/order-service";
import { getAvailableTransitions } from "@/server/domain/commerce/order-state-machine";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Separator } from "@/components/ui/separator";
import { OrderTracker } from "@/components/orders/order-tracker";
import { OrderStatusActions } from "./order-status-actions";
import { InvoiceDownloadButton } from "./invoice-download-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Order detail") };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  const actorContext = {
    userId: session.userId,
    roles: session.roles,
    vendorProfileId: session.vendorProfileId,
  };

  if (!canViewOrder(actorContext, order)) notFound();

  let availableTransitions: ReturnType<typeof getAvailableTransitions> = [];
  try {
    const resolved = resolveActorRole(actorContext, order);
    availableTransitions = getAvailableTransitions(order.status, {
      role: resolved.role,
      isOwner: resolved.isOwner,
    });
  } catch {
    // Staff with order:read:any but no direct relationship can still VIEW
    // (canViewOrder above already allowed it) but has no transition rights.
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1>{t("Order {number}", { number: order.orderNumber ?? order.id })}</h1>
          <p className="text-muted-foreground">
            {order.vendor.businessName} ·{" "}
            {t("Placed {date}", { date: order.createdAt.toLocaleString() })}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.titleSnapshot} × {item.qty}
                {item.listingId ? (
                  <span className="text-muted-foreground ml-2 font-mono text-xs">
                    {item.listingId}
                  </span>
                ) : null}
              </span>
              <span>{formatPaise(item.lineTotal.toString())}</span>
            </div>
          ))}
          <Separator />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Subtotal")}</span>
              <span>{formatPaise(order.subtotal.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Discount")}</span>
              <span>-{formatPaise(order.discountTotal.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Tax (GST)")}</span>
              <span>{formatPaise(order.taxTotal.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Platform fee")}</span>
              <span>{formatPaise(order.platformFeeTotal.toString())}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t("Total")}</span>
              <span>{formatPaise(order.grandTotal.toString())}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Order tracking")}</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderTracker status={order.status} history={order.statusHistory} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <InvoiceDownloadButton orderId={order.id} hasInvoice={order.invoice !== null} />
        {availableTransitions.length > 0 ? (
          <OrderStatusActions orderId={order.id} transitions={availableTransitions} />
        ) : null}
      </div>
    </div>
  );
}
