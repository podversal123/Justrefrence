import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Receipt, ShoppingCart } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  listOrdersForBuyer,
  listOrdersForVendor,
} from "@/server/repositories/commerce/order-repository";
import {
  SALE_STAGES,
  statusesForSaleStage,
  type SaleStage,
} from "@/server/domain/commerce/order-stage";
import { saleViewQuerySchema } from "@/lib/schemas/commerce";
import { buttonVariants } from "@/components/ui/button";
import { CursorPagination } from "@/components/ui/pagination";
import { OrderStageList, StageTabs, type StageOrder } from "@/components/orders/order-stage-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Sale & Purchase") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function SalePurchasePage({ searchParams }: PageProps) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const query = saleViewQuerySchema.parse(await searchParams);
  // Only a seller has a "sale" side; anyone else sees their purchases.
  const side = query.side === "sale" && session.vendorProfileId ? "sale" : "purchase";

  const filters = { limit: 20, cursor: query.cursor, statuses: statusesForSaleStage(query.stage) };
  const { items, nextCursor } =
    side === "sale" && session.vendorProfileId
      ? await listOrdersForVendor(session.vendorProfileId, filters)
      : await listOrdersForBuyer(session.userId, filters);

  const orders: StageOrder[] = items.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    grandTotal: order.grandTotal,
    status: order.status,
    itemCount: order.items.length,
    counterparty:
      "buyer" in order
        ? (order.buyer.fullName ?? order.buyer.email)
        : (order as { vendor: { businessName: string } }).vendor.businessName,
  }));

  const stageLabels: Record<SaleStage, string> = {
    new: side === "sale" ? t("New sale") : t("New purchase"),
    old: side === "sale" ? t("Old sale") : t("Old purchase"),
  };
  const href = (nextSide: string, stage: string) =>
    `/sale-purchase?side=${nextSide}&stage=${stage}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{t("Sale & Purchase")}</h1>
          <p className="text-muted-foreground">
            {t("New means still in progress. Old means completed, cancelled or refunded.")}
          </p>
        </div>
        <Link href={"/cart" as Route} className={buttonVariants({ variant: "outline" })}>
          <ShoppingCart />
          {t("My cart")}
        </Link>
      </div>

      {session.vendorProfileId ? (
        <StageTabs
          tabs={[
            {
              key: "purchase",
              label: t("Purchase"),
              href: href("purchase", query.stage),
              active: side === "purchase",
            },
            {
              key: "sale",
              label: t("Sale"),
              href: href("sale", query.stage),
              active: side === "sale",
            },
          ]}
        />
      ) : null}

      <StageTabs
        tabs={SALE_STAGES.map((stage) => ({
          key: stage,
          label: stageLabels[stage],
          href: href(side, stage),
          active: query.stage === stage,
        }))}
      />

      <OrderStageList
        orders={orders}
        emptyIcon={Receipt}
        emptyTitle={t("Nothing here yet")}
        emptyDescription={
          side === "sale"
            ? t("Orders placed with your business will show up here.")
            : t("Your orders will show up here.")
        }
      />

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
