import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtUsd } from "@/lib/formatters";
import type { CostDailyEntry } from "@/types";

const config = {
  equivalent_api_cost_usd: { label: "API Cost", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function DailyCostChart({ data }: { data: CostDailyEntry[] }) {
  const chartData = useMemo(() => {
    const positiveValues = data
      .map((entry) => entry.equivalent_api_cost_usd)
      .filter((value) => value > 0);
    const minPositive = positiveValues.length > 0 ? Math.min(...positiveValues) : 0.01;
    const floor = Math.min(Math.max(minPositive / 10, 0.01), 1);

    return data.map((entry) => ({
      ...entry,
      chart_cost: entry.equivalent_api_cost_usd > 0 ? entry.equivalent_api_cost_usd : floor,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily API Cost</CardTitle>
        <CardDescription>Equivalent API cost per day</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[250px] w-full">
          <AreaChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => v.slice(5)}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              scale="log"
              domain={["dataMin", "auto"]}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmtUsd(v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_, __, item) => (
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="text-muted-foreground">API Cost</span>
                      <span className="font-mono font-medium text-foreground">
                        {fmtUsd(item.payload.equivalent_api_cost_usd)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="chart_cost"
              name="equivalent_api_cost_usd"
              type="monotone"
              fill="var(--color-equivalent_api_cost_usd)"
              fillOpacity={0.3}
              stroke="var(--color-equivalent_api_cost_usd)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
