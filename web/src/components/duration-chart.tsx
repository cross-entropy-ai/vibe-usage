import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtDuration } from "@/lib/formatters";
import type { DurationData } from "@/types";

const config = {
  duration_log: { label: "Minutes", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function DurationChart({ data }: { data: DurationData }) {
  const totalMin = data.daily.reduce((s, d) => s + d.duration_min, 0);
  const chartData = useMemo(
    () =>
      data.daily.map((entry) => ({
        ...entry,
        duration_log: Math.log10((entry.duration_min ?? 0) + 1),
      })),
    [data.daily],
  );
  const tickValues = useMemo(() => {
    const candidates = [1, 5, 15, 30, 60, 120, 240, 480, 960];
    const maxDuration = Math.max(1, ...data.daily.map((entry) => entry.duration_min ?? 0));
    return candidates
      .filter((value) => value <= maxDuration)
      .map((value) => Math.log10(value + 1));
  }, [data.daily]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coding Duration</CardTitle>
        <CardDescription>
          Daily session time on a log scale &middot; {fmtDuration(totalMin)} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <BarChart data={chartData} accessibilityLayer barGap={6}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              ticks={tickValues}
              tickFormatter={(v) => fmtDuration(Math.max(0, Math.round(10 ** (v as number) - 1)))}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_value, _name, item) => fmtDuration(item.payload.duration_min as number)}
                />
              }
            />
            <Bar
              dataKey="duration_log"
              fill="var(--color-duration_log)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
