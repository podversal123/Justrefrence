import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listOrdersForVendor } from "@/server/repositories/commerce/order-repository";
import { orderListQuerySchema } from "@/lib/schemas/commerce";
import { formatPaise } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";

export const metadata: Metadata = { title: "Vendor orders" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function VendorOrdersPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.vendorProfileId) redirect("/dashboard");

  const parsed = orderListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : orderListQuerySchema.parse({});

  const { items, nextCursor } = await listOrdersForVendor(session.vendorProfileId, query);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div>
        <h1>Orders</h1>
        <p className="text-muted-foreground">Orders placed with your business.</p>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Receipt} title="No orders yet" description="Orders you receive will show up here." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{order.orderNumber ?? order.id}</p>
                    <p className="text-muted-foreground text-sm">
                      {order.buyer.fullName ?? order.buyer.email} · {order.items.length} item
                      {order.items.length === 1 ? "" : "s"} · {order.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatPaise(order.grandTotal.toString())}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
