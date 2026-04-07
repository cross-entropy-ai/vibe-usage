import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
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
        <CardDescription>Split scales keep input and output readable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Input
            </p>
            <p className="text-xs text-muted-foreground">Independent scale</p>
          </div>
          <ChartContainer config={barConfig} className="h-[140px] w-full">
            <BarChart data={daily} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis tickFormatter={fmtNum} tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="input_tokens" fill="var(--color-input_tokens)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Output
            </p>
            <p className="text-xs text-muted-foreground">Independent scale</p>
          </div>
          <ChartContainer config={barConfig} className="h-[140px] w-full">
            <BarChart data={daily} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickFormatter={fmtNum} tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="output_tokens" fill="var(--color-output_tokens)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
