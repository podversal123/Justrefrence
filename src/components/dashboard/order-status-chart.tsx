"use client";

import { useT } from "@/i18n/provider";
import { ChartCard, DonutBreakdown, VIZ } from "./chart-kit";

interface StatusCount {
  status: string;
  count: number;
}

/** Eight raw statuses are too many colours to tell apart, so they are grouped by what they mean. */
const GROUPS = [
  { key: "waiting", statuses: ["PLACED", "PAID"], color: VIZ[3] },
  { key: "progress", statuses: ["PROCESSING", "SHIPPED"], color: VIZ[0] },
  { key: "delivered", statuses: ["DELIVERED", "COMPLETED"], color: VIZ[2] },
  { key: "stopped", statuses: ["CANCELLED", "REFUNDED"], color: VIZ[1] },
] as const;

export function OrderStatusChart({ data }: { data: StatusCount[] }) {
  const t = useT();
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const labels: Record<(typeof GROUPS)[number]["key"], string> = {
    waiting: t("Waiting to be processed"),
    progress: t("Being prepared or on the way"),
    delivered: t("Delivered or completed"),
    stopped: t("Cancelled or refunded"),
  };
  const slices = GROUPS.map((group) => ({
    key: group.key,
    label: labels[group.key],
    color: group.color,
    value: data
      .filter((d) => (group.statuses as readonly string[]).includes(d.status))
      .reduce((sum, d) => sum + d.count, 0),
  }));

  return (
    <ChartCard
      title={t("Orders by status")}
      description={
        total === 1
          ? t("1 order in this period.")
          : t("{count} orders in this period.", { count: total })
      }
    >
      <DonutBreakdown
        data={slices}
        centerLabel={t("orders")}
        emptyMessage={t("Orders will show here as customers place them.")}
      />
    </ChartCard>
  );
}
