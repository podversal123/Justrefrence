"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPaise } from "@/lib/money";

interface RevenuePoint {
  day: string;
  amount: string; // paise, stringified for the client boundary
}

function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const chartData = data.map((d) => ({ day: shortDay(d.day), amountRupees: Number(d.amount) / 100 }));
  const hasAnyRevenue = chartData.some((d) => d.amountRupees > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue</CardTitle>
        <CardDescription>Captured order value per day.</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        {hasAnyRevenue ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={48}
                tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip
                formatter={(value) => formatPaise(String(Math.round(Number(value) * 100)))}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="amountRupees"
                stroke="var(--color-primary)"
                fill="url(#revenueGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            No revenue in this period yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
