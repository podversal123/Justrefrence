"use client";

import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/i18n/provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { niceTicks } from "@/lib/chart-scale";

/**
 * The pieces every dashboard chart is built from, so they all look and behave the same:
 * one validated colour set (see --viz-* in globals.css, checked for colour-blind safety in both
 * themes), a compact "nothing yet" state, a legend with the numbers written out (so no colour has to
 * be guessed), and a hidden table of the same numbers for screen readers.
 */

/** Categorical colours in their fixed order. Assigned by what a thing is, never by its rank. */
export const VIZ = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
  "var(--viz-5)",
] as const;

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
} as const;

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;

export function ChartCard({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Shown instead of a chart with nothing to plot: short, and says what will fill it. */
export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm">
      <BarChart3 className="size-5 opacity-60" aria-hidden="true" />
      <span className="max-w-[26ch] text-center">{message}</span>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-[3px]"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Values over time. One series draws as a soft area, two or more as side-by-side bars (an area
 * stack would hide one behind the other). Hover any day for its numbers.
 */
export function TrendChart({
  data,
  series,
  kind,
  format = (n) => n.toLocaleString(),
  emptyMessage,
  height = 220,
}: {
  data: ({ label: string } & Record<string, number | string>)[];
  series: TrendSeries[];
  kind?: "area" | "bar";
  format?: (value: number) => string;
  emptyMessage: string;
  height?: number;
}) {
  const t = useT();
  const hasData = data.some((row) => series.some((s) => Number(row[s.key]) > 0));
  if (!hasData) return <EmptyChart message={emptyMessage} />;

  const drawAs = kind ?? (series.length > 1 ? "bar" : "area");
  const dataMax = Math.max(0, ...data.flatMap((row) => series.map((s) => Number(row[s.key]))));
  const ticks = niceTicks(dataMax);
  const common = { data, margin: { top: 8, right: 8, left: 0, bottom: 0 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={28} />
      <YAxis
        tickLine={false}
        axisLine={false}
        tick={AXIS_TICK}
        width={48}
        domain={[0, ticks[ticks.length - 1] ?? 1]}
        ticks={ticks}
        allowDecimals={false}
        tickFormatter={(value) => format(Number(value))}
      />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        cursor={{ fill: "var(--muted)", opacity: 0.5 }}
        formatter={(value, name) => [format(Number(value)), name]}
      />
    </>
  );

  return (
    <figure className="space-y-3">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {drawAs === "area" ? (
            <AreaChart {...common}>
              {axes}
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.14}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart {...common} barGap={2}>
              {axes}
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {series.length > 1 ? (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <Swatch color={s.color} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <table className="sr-only">
        <caption>{t("Chart data")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Day")}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {series.map((s) => (
                <td key={s.key}>{format(Number(row[s.key]))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Parts of a whole as a ring with the total in the middle. The list beside it writes out every
 * number and share, so nothing depends on telling the colours apart.
 */
export function DonutBreakdown({
  data,
  centerLabel,
  format = (n) => n.toLocaleString(),
  emptyMessage,
}: {
  data: Slice[];
  centerLabel: string;
  format?: (value: number) => string;
  emptyMessage: string;
}) {
  const t = useT();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const isEmpty = total <= 0;
  // With nothing to plot, draw a plain grey ring and zeros so the card still reads as a chart.
  const shown = isEmpty
    ? [{ key: "none", label: "", value: 1, color: "var(--muted)" }]
    : data.filter((d) => d.value > 0);

  return (
    <figure className="@container space-y-3">
      <div className="flex flex-col items-center gap-4 @md:flex-row @md:items-center">
        <div className="relative size-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={shown}
                dataKey="value"
                nameKey="label"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={shown.length > 1 ? 2 : 0}
                stroke="var(--card)"
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
              >
                {shown.map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
              </Pie>
              {isEmpty ? null : (
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [format(Number(value)), name]}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl leading-none font-semibold">{format(total)}</span>
            <span className="text-muted-foreground mt-1 text-[11px]">{centerLabel}</span>
          </div>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
          {data.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2">
              <Swatch color={slice.color} />
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="font-medium tabular-nums">{format(slice.value)}</span>
              <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                {isEmpty ? "0%" : `${Math.round((slice.value / total) * 100)}%`}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {isEmpty ? <p className="text-muted-foreground text-xs">{emptyMessage}</p> : null}
      <table className="sr-only">
        <caption>{t("Chart data")}</caption>
        <tbody>
          {data.map((slice) => (
            <tr key={slice.key}>
              <th scope="row">{slice.label}</th>
              <td>{format(slice.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A ranked list as bars, the longest bar for the biggest number. Each row carries its own number. */
export function HorizontalBars({
  data,
  color = VIZ[0],
  format = (n) => n.toLocaleString(),
  emptyMessage,
}: {
  data: { label: string; value: number }[];
  color?: string;
  format?: (value: number) => string;
  emptyMessage: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (data.length === 0) return <EmptyChart message={emptyMessage} />;

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {data.map((row) => (
          <li key={row.label} title={`${row.label}: ${format(row.value)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="font-medium tabular-nums">{format(row.value)}</span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full")}
                style={{
                  width: max > 0 ? `${Math.max(3, (row.value / max) * 100)}%` : "0%",
                  backgroundColor: color,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {max <= 0 ? <p className="text-muted-foreground text-xs">{emptyMessage}</p> : null}
    </div>
  );
}
