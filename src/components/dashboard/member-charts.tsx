"use client";

import { useT } from "@/i18n/provider";
import { formatRupeesCompact } from "@/lib/money";
import { ChartCard, DonutBreakdown, HorizontalBars, VIZ } from "./chart-kit";

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
