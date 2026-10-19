import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  listOrdersForBuyer,
  listOrdersForVendor,
} from "@/server/repositories/commerce/order-repository";
import { statusesForProjectStage } from "@/server/domain/commerce/order-stage";
import { PROJECT_STAGES, type ProjectStage } from "@/server/domain/commerce/order-stage";
import { projectsViewQuerySchema } from "@/lib/schemas/commerce";
import { buttonVariants } from "@/components/ui/button";
import { CursorPagination } from "@/components/ui/pagination";
import { OrderStageList, StageTabs, type StageOrder } from "@/components/orders/order-stage-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Projects") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function MyProjectsPage({ searchParams }: PageProps) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const canSell = Boolean(session.vendorProfileId) && session.permissions.has("project:create");
  const query = projectsViewQuerySchema.parse(await searchParams);
  // Someone who isn't a seller has no "sold" side; fall back to what they ordered.
  const side = query.side === "sold" && session.vendorProfileId ? "sold" : "ordered";

  const filters = {
    limit: 20,
    cursor: query.cursor,
    statuses: statusesForProjectStage(query.stage),
    itemType: "PROJECT" as const,
  };
  const { items, nextCursor } =
    side === "sold" && session.vendorProfileId
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

  const stageLabels: Record<ProjectStage, string> = {
    running: t("Running"),
    complete: t("Complete"),
    cancelled: t("Cancelled"),
  };
  const href = (nextSide: string, stage: string) => `/my-projects?side=${nextSide}&stage=${stage}`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{t("Projects")}</h1>
          <p className="text-muted-foreground">
            {side === "sold"
              ? t("Projects customers ordered from you, by stage.")
              : t("Projects you ordered, by stage.")}
          </p>
        </div>
        {canSell ? (
          <Link
            href={"/vendor/catalog/projects/new" as Route}
            className={buttonVariants({ variant: "default" })}
          >
            <Plus />
            {t("Create new project")}
          </Link>
        ) : (
          <Link href={"/become-seller" as Route} className={buttonVariants({ variant: "outline" })}>
            {t("Become a seller to create projects")}
          </Link>
        )}
      </div>

      {session.vendorProfileId ? (
        <StageTabs
          tabs={[
            {
              key: "ordered",
              label: t("Ordered by me"),
              href: href("ordered", query.stage),
              active: side === "ordered",
            },
            {
              key: "sold",
              label: t("Sold by me"),
              href: href("sold", query.stage),
              active: side === "sold",
            },
          ]}
        />
      ) : null}

      <StageTabs
        tabs={PROJECT_STAGES.map((stage) => ({
          key: stage,
          label: stageLabels[stage],
          href: href(side, stage),
          active: query.stage === stage,
        }))}
      />

      <OrderStageList
        orders={orders}
        emptyIcon={Briefcase}
        emptyTitle={t("No {stage} projects", { stage: stageLabels[query.stage].toLowerCase() })}
        emptyDescription={t("Project orders will show up here.")}
      />

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
