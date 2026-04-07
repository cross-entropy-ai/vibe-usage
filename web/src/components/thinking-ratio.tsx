import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtNum, shortenModel } from "@/lib/formatters";
import type { ThinkingEntry } from "@/types";

const thinkConfig = {
  thinking_tokens: { label: "Thinking", color: "var(--chart-4)" },
  output_tokens: { label: "Output", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function ThinkingRatio({ data, limit = 8 }: { data: ThinkingEntry[]; limit?: number }) {
  const top = data.slice(0, limit).map((d) => ({
    ...d,
    model: shortenModel(d.model).slice(0, 22),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Thinking vs Output Tokens</CardTitle>
        <CardDescription>How much each model "thinks" before responding</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={thinkConfig} className="h-[250px] w-full">
          <BarChart data={top} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="model" type="category" width={140} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <XAxis type="number" tickFormatter={fmtNum} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="output_tokens" fill="var(--color-output_tokens)" stackId="t" radius={[0, 0, 0, 0]} />
            <Bar dataKey="thinking_tokens" fill="var(--color-thinking_tokens)" stackId="t" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
