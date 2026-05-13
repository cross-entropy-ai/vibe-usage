import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartScaleToggle } from "./chart-scale-toggle";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtNum } from "@/lib/formatters";
import { useChartScale } from "@/lib/contexts";
import type { DailyStat } from "@/types";

const barConfig = {
  input_tokens: { label: "Input", color: "var(--chart-3)" },
  output_tokens: { label: "Output", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function TokenBarChart({ daily }: { daily: DailyStat[] }) {
  const { scale, domain, isLog, toggle } = useChartScale();
  const inputDaily = isLog ? daily.filter((d) => d.input_tokens > 0) : daily;
  const outputDaily = isLog ? daily.filter((d) => d.output_tokens > 0) : daily;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Usage</CardTitle>
        <CardDescription>{isLog ? "Daily input and output tokens on a log scale" : "Daily input and output tokens"}</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
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
            <BarChart data={inputDaily} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis
                scale={scale}
                domain={domain}
                tickFormatter={fmtNum}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
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
            <BarChart data={outputDaily} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                scale={scale}
                domain={domain}
                tickFormatter={fmtNum}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="output_tokens" fill="var(--color-output_tokens)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
