import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CostDailyEntry } from "@/types";

const config = {
  equivalent_api_cost_usd: { label: "API Cost", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function DailyCostChart({ data }: { data: CostDailyEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily API Cost</CardTitle>
        <CardDescription>Equivalent API cost per day</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[250px] w-full">
          <AreaChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => v.slice(5)}
              tick={{ fontSize: 11 }}
            />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => "$" + v} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="equivalent_api_cost_usd"
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
