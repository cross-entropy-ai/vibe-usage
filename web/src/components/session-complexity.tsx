import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useChartScale } from "@/lib/contexts";
import { ChartScaleToggle } from "./chart-scale-toggle";
import type { SessionComplexityEntry } from "@/types";

const complexityConfig = {
  avg_messages_per_session: { label: "Avg Messages", color: "var(--chart-1)" },
  sessions: { label: "Sessions", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function SessionComplexity({ data }: { data: SessionComplexityEntry[] }) {
  const { scale, isLog, domain, toggle } = useChartScale();
  const chartData = isLog ? data.filter((d) => d.avg_messages_per_session > 0) : data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Session Complexity by Hour</CardTitle>
        <CardDescription>Average messages per session at each hour of day</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={complexityConfig} className="h-[250px] w-full">
          <BarChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="hour" tickLine={false} axisLine={false} tickFormatter={(h: number) => `${h}:00`} tick={{ fontSize: 10 }} />
            <YAxis scale={scale} domain={domain} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="avg_messages_per_session" fill="var(--color-avg_messages_per_session)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
