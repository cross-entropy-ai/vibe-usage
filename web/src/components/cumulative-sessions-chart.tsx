import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtNum } from "@/lib/formatters";
import { useChartScale } from "@/lib/contexts";
import { ChartScaleToggle } from "./chart-scale-toggle";
import type { DailyStat } from "@/types";

const lineConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
  userMessages: { label: "User Messages", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function CumulativeSessionsChart({ daily }: { daily: DailyStat[] }) {
  const { scale, isLog, toggle } = useChartScale();
  const data = useMemo(() => {
    let totalSessions = 0;
    let totalUserMessages = 0;
    return daily.map((d) => {
      totalSessions += d.sessions;
      totalUserMessages += d.user_messages;
      return { date: d.date, sessions: totalSessions, userMessages: totalUserMessages };
    });
  }, [daily]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cumulative Growth</CardTitle>
        <CardDescription>Sessions and user messages over time</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={lineConfig} className="h-[300px] w-full">
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis yAxisId="left" scale={scale} domain={isLog ? [1, "auto"] : [0, "auto"]} allowDataOverflow={isLog} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={fmtNum} />
            <YAxis yAxisId="right" orientation="right" scale={scale} domain={isLog ? [1, "auto"] : [0, "auto"]} allowDataOverflow={isLog} tickLine={false} axisLine={false} tickMargin={8} tickFormatter={fmtNum} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line yAxisId="left" type="natural" dataKey="sessions" stroke="var(--color-sessions)" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="natural" dataKey="userMessages" stroke="var(--color-userMessages)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
