"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StatusCount {
  status: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  PLACED: "var(--muted-foreground)",
  PAID: "var(--color-primary)",
  PROCESSING: "oklch(0.7 0.15 230)",
  SHIPPED: "oklch(0.75 0.15 200)",
  DELIVERED: "oklch(0.7 0.15 160)",
  COMPLETED: "oklch(0.65 0.18 145)",
  CANCELLED: "oklch(0.55 0.02 0)",
  REFUNDED: "oklch(0.6 0.2 25)",
};

export function OrderStatusChart({ data }: { data: StatusCount[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orders by status</CardTitle>
        <CardDescription>{total} order{total === 1 ? "" : "s"} in this period.</CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="status" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "var(--muted-foreground)"} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            No orders in this period yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
