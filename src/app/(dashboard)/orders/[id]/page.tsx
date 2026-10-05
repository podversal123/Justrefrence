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
import { OrderStatusActions } from "./order-status-actions";
import { InvoiceDownloadButton } from "./invoice-download-button";

export const metadata: Metadata = { title: "Order detail" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps) {
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
          <h1>Order {order.orderNumber ?? order.id}</h1>
          <p className="text-muted-foreground">
            {order.vendor.businessName} · Placed {order.createdAt.toLocaleString()}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.titleSnapshot} × {item.qty}
              </span>
              <span>{formatPaise(item.lineTotal.toString())}</span>
            </div>
          ))}
          <Separator />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPaise(order.subtotal.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span>-{formatPaise(order.discountTotal.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (GST)</span>
              <span>{formatPaise(order.taxTotal.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Platform fee</span>
              <span>{formatPaise(order.platformFeeTotal.toString())}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatPaise(order.grandTotal.toString())}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {order.statusHistory.map((entry) => (
            <div key={entry.id} className="flex justify-between text-sm">
              <span>
                {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}
                {entry.reason ? ` — ${entry.reason}` : ""}
              </span>
              <span className="text-muted-foreground">{entry.createdAt.toLocaleString()}</span>
            </div>
          ))}
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
