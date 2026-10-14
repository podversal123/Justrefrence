import { getFormat, getT } from "@/i18n/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Vendor orders") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function VendorOrdersPage({ searchParams }: PageProps) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.vendorProfileId) redirect("/dashboard");

  const parsed = orderListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : orderListQuerySchema.parse({});

  const { items, nextCursor } = await listOrdersForVendor(session.vendorProfileId, query);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div>
        <h1>{t("Orders")}</h1>
        <p className="text-muted-foreground">{t("Orders placed with your business.")}</p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("No orders yet")}
          description={t("Orders you receive will show up here.")}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <Card className="transition-shadow hover:shadow-sm">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{order.orderNumber ?? order.id}</p>
                    <p className="text-muted-foreground text-sm">
                      {order.buyer.fullName ?? order.buyer.email} ·{" "}
                      {order.items.length === 1
                        ? t("1 item")
                        : t("{count} items", { count: order.items.length })}{" "}
                      · {formatDate(order.createdAt)}
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
