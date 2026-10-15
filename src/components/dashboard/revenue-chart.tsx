"use client";

import { useLocale, useT } from "@/i18n/provider";
import { localeTag, type Locale } from "@/i18n/locales";
import { ChartCard, TrendChart, VIZ } from "./chart-kit";
import { formatRupeesCompact } from "@/lib/money";

interface RevenuePoint {
  day: string;
  amount: string; // paise, stringified for the client boundary
}

function shortDay(day: string, locale: Locale): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(localeTag(locale), { month: "short", day: "numeric" });
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const t = useT();
  const locale = useLocale();
  const rows = data.map((d) => ({
    label: shortDay(d.day, locale),
    revenue: Number(d.amount) / 100,
  }));

  return (
    <ChartCard title={t("Revenue")} description={t("Captured order value per day.")}>
      <TrendChart
        data={rows}
        series={[{ key: "revenue", label: t("Revenue"), color: VIZ[0] }]}
        format={formatRupeesCompact}
        emptyMessage={t("Revenue will show here once orders are paid.")}
      />
    </ChartCard>
  );
}
