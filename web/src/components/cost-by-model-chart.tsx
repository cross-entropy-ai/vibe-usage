import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtUsd } from "@/lib/formatters";
import { useChartScale } from "@/lib/contexts";
import { ChartScaleToggle } from "./chart-scale-toggle";
import type { CostModelEntry } from "@/types";

const config = {
  equivalent_api_cost_usd: { label: "API Cost", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function CostByModelChart({ data, limit = 10 }: { data: CostModelEntry[]; limit?: number }) {
  const { scale, isLog, toggle } = useChartScale();

  const modelMap = new Map<string, number>();
  for (const entry of data) {
    const key = entry.model.replace(/-\d{8}$/, "").slice(0, 24);
    modelMap.set(key, (modelMap.get(key) ?? 0) + entry.equivalent_api_cost_usd);
  }
  const topModels = Array.from(modelMap, ([model, equivalent_api_cost_usd]) => ({
    model,
    equivalent_api_cost_usd,
  }))
    .sort((a, b) => b.equivalent_api_cost_usd - a.equivalent_api_cost_usd)
    .slice(0, limit)
    .filter((m) => !isLog || m.equivalent_api_cost_usd > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost by Model</CardTitle>
        <CardDescription>Top models by equivalent API cost</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[250px] w-full">
          <BarChart data={topModels} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="model"
              type="category"
              width={130}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <XAxis
              type="number"
              scale={scale}
              domain={isLog ? [0.01, "auto"] : [0, "auto"]}
              allowDataOverflow={isLog}
              tickFormatter={(v: number) => fmtUsd(v)}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="equivalent_api_cost_usd"
              fill="var(--color-equivalent_api_cost_usd)"
              radius={[0, 4, 4, 0]}
              minPointSize={2}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
