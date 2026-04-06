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
import type { TokensDailyEntry } from "@/types";

const TOOLS = ["claude", "gemini", "codex", "kimi"] as const;

const TOOL_COLORS: Record<string, string> = {
  claude: "var(--chart-1)",
  gemini: "var(--chart-2)",
  codex: "var(--chart-3)",
  kimi: "var(--chart-4)",
};

const chartConfig = Object.fromEntries(
  TOOLS.map((tool) => [
    `${tool}_total`,
    { label: tool.charAt(0).toUpperCase() + tool.slice(1), color: TOOL_COLORS[tool] },
  ]),
) satisfies ChartConfig;

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

function transformData(data: TokensDailyEntry[]) {
  return data.map((entry) => {
    const row: Record<string, string | number> = { date: entry.date };
    for (const tool of TOOLS) {
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
              tickFormatter={(v: number) => fmtTokens(v)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => fmtTokens(value as number)}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {TOOLS.map((tool) => (
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
