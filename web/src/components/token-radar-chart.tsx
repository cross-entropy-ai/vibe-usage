import { useMemo } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtNum } from "@/lib/formatters";
import type { TokenUsage } from "@/types";

const radarConfig = {
  value: { label: "Tokens", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function TokenRadarChart({ tokens }: { tokens: TokenUsage }) {
  const data = useMemo(() => {
    const input = tokens.input ?? 0;
    const output = tokens.output ?? 0;
    const thinking = tokens.thinking ?? 0;
    const cache_read = tokens.cache_read ?? 0;
    const cache_write = tokens.cache_write ?? 0;
    const max = Math.max(input, output, thinking, cache_read, cache_write, 1);
    return [
      { category: "Input", value: input, pct: Math.round((input / max) * 100) },
      { category: "Output", value: output, pct: Math.round((output / max) * 100) },
      { category: "Thinking", value: thinking, pct: Math.round((thinking / max) * 100) },
      { category: "Cache Read", value: cache_read, pct: Math.round((cache_read / max) * 100) },
      { category: "Cache Write", value: cache_write, pct: Math.round((cache_write / max) * 100) },
    ];
  }, [tokens]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Breakdown</CardTitle>
        <CardDescription>Shape of token usage across categories</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={radarConfig} className="h-[300px] w-full">
          <RadarChart data={data} accessibilityLayer>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_value, _name, item) => (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{item.payload.category}</span>
                      <span className="font-mono font-medium tabular-nums">{fmtNum(item.payload.value)}</span>
                    </div>
                  )}
                />
              }
            />
            <PolarGrid />
            <PolarAngleAxis dataKey="category" tick={{ fontSize: 12 }} />
            <Radar dataKey="pct" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.25} strokeWidth={2} />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
