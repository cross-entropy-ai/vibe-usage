import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtUsdShort } from "@/lib/formatters";
import type { DailyStat, CostDailyEntry } from "@/types";

const config = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
  cost: { label: "API Cost ($)", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function CumulativeChart({
  daily,
  costDaily,
}: {
  daily: DailyStat[];
  costDaily: CostDailyEntry[];
}) {
  const data = useMemo(() => {
    const costMap = new Map(costDaily.map((c) => [c.date, c.equivalent_api_cost_usd]));

    // Collect all dates from both sources
    const dateSet = new Set<string>();
    for (const d of daily) dateSet.add(d.date);
    for (const c of costDaily) dateSet.add(c.date);
    const dates = Array.from(dateSet).sort();

    let cumSessions = 0;
    let cumCost = 0;

    return dates.map((date) => {
      const dayStat = daily.find((d) => d.date === date);
      cumSessions += dayStat?.sessions ?? 0;
      cumCost += costMap.get(date) ?? 0;
      return {
        date,
        sessions: cumSessions,
        cost: Math.round(cumCost * 100) / 100,
      };
    });
  }, [daily, costDaily]);

  if (data.length === 0) return null;

  const totalSessions = data[data.length - 1].sessions;
  const totalCost = data[data.length - 1].cost;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cumulative Growth</CardTitle>
        <CardDescription>
          {totalSessions.toLocaleString()} sessions &middot; {fmtUsdShort(totalCost)} equivalent API cost
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <AreaChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              yAxisId="sessions"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              tickFormatter={fmtUsdShort}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    if (name === "cost") return "$" + (value as number).toFixed(2);
                    return (value as number).toLocaleString();
                  }}
                />
              }
            />
            <Legend />
            <Area
              yAxisId="sessions"
              type="monotone"
              dataKey="sessions"
              stroke="var(--color-sessions)"
              fill="var(--color-sessions)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Area
              yAxisId="cost"
              type="monotone"
              dataKey="cost"
              stroke="var(--color-cost)"
              fill="var(--color-cost)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
