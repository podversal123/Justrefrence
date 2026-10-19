import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { getFormat, getT } from "@/i18n/server";
import { formatPaise } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export interface StageTab {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

/** A row of link-buttons; one is highlighted. Plain links, so the page stays a Server Component. */
export function StageTabs({ tabs }: { tabs: StageTab[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href as Route}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: tab.active ? "default" : "outline", size: "sm" }),
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export interface StageOrder {
  id: string;
  orderNumber: string | null;
  createdAt: Date;
  grandTotal: bigint;
  status: string;
  itemCount: number;
  /** The other side of the order: the seller on a purchase, the buyer on a sale. */
  counterparty: string;
}

/** The orders under a stage tab, each linking to its order page; an empty state when there are none. */
export async function OrderStageList({
  orders,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  orders: StageOrder[];
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const t = await getT();
  const { formatDate } = await getFormat();

  if (orders.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <Link key={order.id} href={`/orders/${order.id}` as Route}>
          <Card className="transition-shadow hover:shadow-sm">
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium">{order.orderNumber ?? order.id}</p>
                <p className="text-muted-foreground text-sm">
                  {order.counterparty} ·{" "}
                  {order.itemCount === 1
                    ? t("1 item")
                    : t("{count} items", { count: order.itemCount })}{" "}
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
  );
}
