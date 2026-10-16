"use client";

import { useLocale, useT } from "@/i18n/provider";
import { localeTag } from "@/i18n/locales";
import { formatRupeesCompact } from "@/lib/money";
import { ChartCard, DonutBreakdown, HorizontalBars, TrendChart, VIZ } from "./chart-kit";

/** Where a member's earnings come from: people they referred, or the people those people referred. */
export function EarningsSourceChart({ direct, indirect }: { direct: number; indirect: number }) {
  const t = useT();
  return (
    <ChartCard title={t("Where your earnings come from")} description={t("All time.")}>
      <DonutBreakdown
        centerLabel={t("earned")}
        format={formatRupeesCompact}
        emptyMessage={t("Your earnings will show here when people you referred buy.")}
        data={[
          { key: "direct", label: t("Direct"), value: direct, color: VIZ[0] },
          { key: "indirect", label: t("Indirect"), value: indirect, color: VIZ[1] },
        ]}
      />
    </ChartCard>
  );
}

/** How much of what was earned has already reached the wallet and how much is still waiting. */
export function EarningsStatusChart({ received, pending }: { received: number; pending: number }) {
  const t = useT();
  return (
    <ChartCard
      title={t("Earnings status")}
      description={t("Waiting earnings move to your wallet once they are released.")}
    >
      <HorizontalBars
        format={formatRupeesCompact}
        emptyMessage={t("Your earnings will show here when people you referred buy.")}
        data={[
          { label: t("In your wallet"), value: received },
          { label: t("Waiting to be released"), value: pending },
        ]}
        color={VIZ[2]}
      />
    </ChartCard>
  );
}

/** How many people the member has referred directly and through others. */
export function ReferralNetworkChart({ direct, indirect }: { direct: number; indirect: number }) {
  const t = useT();
  return (
    <ChartCard title={t("Your referral network")} description={t("People who joined through you.")}>
      <DonutBreakdown
        centerLabel={t("people")}
        emptyMessage={t("Share your referral link and the people who join will show here.")}
        data={[
          { key: "direct", label: t("Joined through you"), value: direct, color: VIZ[0] },
          { key: "indirect", label: t("Joined through them"), value: indirect, color: VIZ[1] },
        ]}
      />
    </ChartCard>
  );
}

function monthLabel(month: string, locale: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** Business per month: what the member bought themselves next to what their network bought. */
export function BusinessMonthlyChart({
  data,
}: {
  data: { month: string; own: number; referral: number }[];
}) {
  const t = useT();
  const locale = useLocale();
  const rows = data.map((d) => ({
    label: monthLabel(d.month, localeTag(locale)),
    own: d.own,
    referral: d.referral,
  }));
  return (
    <ChartCard title={t("Business by month")} description={t("The last 6 months.")}>
      <TrendChart
        data={rows}
        series={[
          { key: "own", label: t("My business"), color: VIZ[0] },
          { key: "referral", label: t("Referral business"), color: VIZ[1] },
        ]}
        kind="bar"
        format={formatRupeesCompact}
        emptyMessage={t("Business will show here once orders are paid.")}
      />
    </ChartCard>
  );
}

/** Who the business came from: the member, their direct referrals, or people further down. */
export function BusinessSplitChart({
  own,
  direct,
  indirect,
}: {
  own: number;
  direct: number;
  indirect: number;
}) {
  const t = useT();
  return (
    <ChartCard title={t("Where the business comes from")} description={t("For the dates chosen.")}>
      <DonutBreakdown
        centerLabel={t("business")}
        format={formatRupeesCompact}
        emptyMessage={t("Business will show here once orders are paid.")}
        data={[
          { key: "own", label: t("My business"), value: own, color: VIZ[0] },
          { key: "direct", label: t("Direct referrals"), value: direct, color: VIZ[1] },
          { key: "indirect", label: t("Indirect referrals"), value: indirect, color: VIZ[2] },
        ]}
      />
    </ChartCard>
  );
}
