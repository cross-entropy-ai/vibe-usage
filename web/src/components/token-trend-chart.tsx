import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TOOL_NAMES, toolChartColor, toolLabel } from "@/lib/tools";
import { fmtNum } from "@/lib/formatters";
import { useChartScale } from "@/lib/contexts";
import { ChartScaleToggle } from "./chart-scale-toggle";
import type { TokensDailyEntry } from "@/types";

const chartConfig = Object.fromEntries(
  TOOL_NAMES.map((tool) => [
    `${tool}_total`,
    { label: toolLabel(tool), color: toolChartColor(tool) },
  ]),
) satisfies ChartConfig;

function transformData(data: TokensDailyEntry[], isLog: boolean) {
  return data.map((entry) => {
    const row: Record<string, string | number | null> = { date: entry.date };
    for (const tool of TOOL_NAMES) {
      const t = entry.by_tool[tool];
      const total = t ? t.input + t.output + t.thinking : 0;
      row[`${tool}_total`] = isLog ? (total > 0 ? total : null) : total;
    }
    return row;
  });
}

export function TokenTrendChart({ data }: { data: TokensDailyEntry[] }) {
  const { scale, isLog, toggle } = useChartScale();
  const chartData = transformData(data, isLog);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Trend</CardTitle>
        <CardDescription>Daily token usage by tool</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
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
              scale={scale}
              domain={isLog ? [1, "auto"] : [0, "auto"]}
              allowDataOverflow={isLog}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmtNum(v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => fmtNum(value as number)}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {TOOL_NAMES.map((tool) => (
              <Area
                key={tool}
                dataKey={`${tool}_total`}
                type="monotone"
                stackId={isLog ? undefined : "tokens"}
                fill={`var(--color-${tool}_total)`}
                fillOpacity={isLog ? 0.15 : 0.4}
                stroke={`var(--color-${tool}_total)`}
                strokeWidth={2}
                connectNulls={false}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
