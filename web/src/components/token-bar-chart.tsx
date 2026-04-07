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
import { fmtDate, fmtNum } from "@/lib/formatters";
import type { DailyStat } from "@/types";

const barConfig = {
  input_tokens: { label: "Input", color: "var(--chart-3)" },
  output_tokens: { label: "Output", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function TokenBarChart({ daily }: { daily: DailyStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Usage</CardTitle>
        <CardDescription>Daily input / output tokens</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={barConfig} className="h-[300px] w-full">
          <BarChart data={daily} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis scale="log" domain={[1, "auto"]} tickFormatter={fmtNum} tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="input_tokens" fill="var(--color-input_tokens)" radius={[4, 4, 0, 0]} stackId="tokens" />
            <Bar dataKey="output_tokens" fill="var(--color-output_tokens)" radius={[4, 4, 0, 0]} stackId="tokens" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
