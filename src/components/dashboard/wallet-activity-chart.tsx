"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPaise } from "@/lib/money";

interface WalletPoint {
  day: string;
  credits: string;
  debits: string;
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function WalletActivityChart({ data }: { data: WalletPoint[] }) {
  const chartData = data.map((d) => ({
    day: shortDay(d.day),
    creditsRupees: Number(d.credits) / 100,
    debitsRupees: Number(d.debits) / 100,
  }));
  const hasActivity = chartData.some((d) => d.creditsRupees > 0 || d.debitsRupees > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wallet activity</CardTitle>
        <CardDescription>Credits vs. debits across all member wallets.</CardDescription>
      </CardHeader>
      <CardContent className="h-40">
        {hasActivity ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={10} minTickGap={32} />
              <Tooltip
                formatter={(value) => formatPaise(String(Math.round(Number(value) * 100)))}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="creditsRupees"
                name="Credits"
                stroke="oklch(0.65 0.18 145)"
                fill="oklch(0.65 0.18 145)"
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="debitsRupees"
                name="Debits"
                stroke="oklch(0.6 0.2 25)"
                fill="oklch(0.6 0.2 25)"
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            No wallet activity in this period yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
