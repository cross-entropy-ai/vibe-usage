import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { TokensDailyEntry } from "@/types";

const chartConfig = Object.fromEntries(
  TOOL_NAMES.map((tool) => [
    `${tool}_total`,
    { label: toolLabel(tool), color: toolChartColor(tool) },
  ]),
) satisfies ChartConfig;

function transformData(data: TokensDailyEntry[]) {
  return data.map((entry) => {
    const row: Record<string, string | number> = { date: entry.date };
    for (const tool of TOOL_NAMES) {
      const t = entry.by_tool[tool];
      row[`${tool}_total`] = t ? t.input + t.output + t.thinking : 0;
    }
    return row;
  });
}

export function TokenTrendChart({ data }: { data: TokensDailyEntry[] }) {
  const chartData = transformData(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Trend</CardTitle>
        <CardDescription>Daily token usage by tool</CardDescription>
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
                stackId="tokens"
                fill={`var(--color-${tool}_total)`}
                fillOpacity={0.4}
                stroke={`var(--color-${tool}_total)`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
