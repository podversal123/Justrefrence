"use client";

import { useLocale, useT } from "@/i18n/provider";
import { localeTag, type Locale } from "@/i18n/locales";
import { ChartCard, DonutBreakdown, HorizontalBars, TrendChart, VIZ } from "./chart-kit";

function shortDay(day: string, locale: Locale): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(localeTag(locale), {
    month: "short",
    day: "numeric",
  });
}

/** New members per day over the chosen period. */
export function MembersJoinedChart({ data }: { data: { day: string; count: number }[] }) {
  const t = useT();
  const locale = useLocale();
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const rows = data.map((d) => ({ label: shortDay(d.day, locale), members: d.count }));

  return (
    <ChartCard
      title={t("Members joined")}
      description={
        total === 1
          ? t("1 new member in this period.")
          : t("{count} new members in this period.", { count: total })
      }
    >
      <TrendChart
        data={rows}
        series={[{ key: "members", label: t("New members"), color: VIZ[0] }]}
        kind="bar"
        emptyMessage={t("New members will show here as they join.")}
      />
    </ChartCard>
  );
}

/** How the live catalogue splits between products, services and projects. */
export function CatalogMixChart({
  products,
  services,
  projects,
  title,
  description,
}: {
  products: number;
  services: number;
  projects: number;
  /** Lets the vendor dashboard word it as their own listings. */
  title?: string;
  description?: string;
}) {
  const t = useT();
  return (
    <ChartCard
      title={title ?? t("Catalogue mix")}
      description={description ?? t("Live listings by type.")}
    >
      <DonutBreakdown
        centerLabel={t("listings")}
        emptyMessage={t("Listings will show here once they are approved.")}
        data={[
          { key: "products", label: t("Products"), value: products, color: VIZ[0] },
          { key: "services", label: t("Services"), value: services, color: VIZ[1] },
          { key: "projects", label: t("Projects"), value: projects, color: VIZ[2] },
        ]}
      />
    </ChartCard>
  );
}

const VENDOR_STATUS = [
  { status: "APPROVED", color: VIZ[2] },
  { status: "PENDING", color: VIZ[3] },
  { status: "SUSPENDED", color: VIZ[1] },
  { status: "REJECTED", color: VIZ[4] },
] as const;

/** Vendors by where they stand with the platform. */
export function VendorStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const t = useT();
  const labels: Record<string, string> = {
    APPROVED: t("Approved"),
    PENDING: t("Waiting for review"),
    SUSPENDED: t("Suspended"),
    REJECTED: t("Rejected"),
  };
  return (
    <ChartCard title={t("Vendors by status")} description={t("Everyone who applied to sell.")}>
      <DonutBreakdown
        centerLabel={t("vendors")}
        emptyMessage={t("Vendors will show here once someone applies.")}
        data={VENDOR_STATUS.map((v) => ({
          key: v.status,
          label: labels[v.status] ?? v.status,
          color: v.color,
          value: data.find((d) => d.status === v.status)?.count ?? 0,
        }))}
      />
    </ChartCard>
  );
}

/** The categories with the most live listings. */
export function CategoryListingsChart({ data }: { data: { label: string; count: number }[] }) {
  const t = useT();
  return (
    <ChartCard
      title={t("Top categories")}
      description={t("Categories with the most live listings.")}
    >
      <HorizontalBars
        data={data.map((d) => ({ label: d.label, value: d.count }))}
        color={VIZ[0]}
        emptyMessage={t("Categories will show here once listings go live.")}
      />
    </ChartCard>
  );
}
