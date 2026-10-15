"use client";

import { useLocale, useT } from "@/i18n/provider";
import { localeTag, type Locale } from "@/i18n/locales";
import { ChartCard, TrendChart, VIZ } from "./chart-kit";
import { formatRupeesCompact } from "@/lib/money";

interface WalletPoint {
  day: string;
  credits: string;
  debits: string;
}

function shortDay(day: string, locale: Locale): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(localeTag(locale), {
    month: "short",
    day: "numeric",
  });
}

/**
 * Money in and money out per day. `title` and `description` let the member dashboard reuse it for
 * one person's own wallet; by default it is the platform-wide view admins see.
 */
export function WalletActivityChart({
  data,
  title,
  description,
}: {
  data: WalletPoint[];
  title?: string;
  description?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const rows = data.map((d) => ({
    label: shortDay(d.day, locale),
    in: Number(d.credits) / 100,
    out: Number(d.debits) / 100,
  }));

  return (
    <ChartCard
      title={title ?? t("Wallet activity")}
      description={description ?? t("Credits vs. debits across all member wallets.")}
    >
      <TrendChart
        data={rows}
        series={[
          { key: "in", label: t("Money in"), color: VIZ[0] },
          { key: "out", label: t("Money out"), color: VIZ[1] },
        ]}
        kind="bar"
        format={formatRupeesCompact}
        emptyMessage={t("Money in and out of the wallet will show here.")}
      />
    </ChartCard>
  );
}
