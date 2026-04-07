import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate } from "@/lib/formatters";
import type { DailyStat } from "@/types";

const lineConfig = {
  cumulative: { label: "Cumulative Sessions", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function CumulativeSessionsChart({ daily }: { daily: DailyStat[] }) {
  const data = useMemo(() => {
    let total = 0;
    return daily.map((d) => {
      total += d.sessions;
      return { date: d.date, cumulative: total };
    });
  }, [daily]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cumulative Sessions</CardTitle>
        <CardDescription>Running total over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={lineConfig} className="h-[300px] w-full">
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="natural" dataKey="cumulative" stroke="var(--color-cumulative)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
