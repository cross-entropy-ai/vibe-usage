import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtDuration } from "@/lib/formatters";
import { useChartScale } from "@/lib/contexts";
import { ChartScaleToggle } from "./chart-scale-toggle";
import type { DurationData } from "@/types";

const config = {
  duration_value: { label: "Minutes", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function DurationChart({ data }: { data: DurationData }) {
  const { scale, isLog, toggle } = useChartScale();
  const totalMin = data.daily.reduce((s, d) => s + d.duration_min, 0);
  const chartData = useMemo(
    () =>
      data.daily.map((entry) => ({
        ...entry,
        duration_value: isLog
          ? Math.log10((entry.duration_min ?? 0) + 1)
          : (entry.duration_min ?? 0),
      })),
    [data.daily, isLog],
  );
  const tickValues = useMemo(() => {
    if (!isLog) return undefined;
    const candidates = [1, 5, 15, 30, 60, 120, 240, 480, 960];
    const maxDuration = Math.max(1, ...data.daily.map((entry) => entry.duration_min ?? 0));
    return candidates
      .filter((value) => value <= maxDuration)
      .map((value) => Math.log10(value + 1));
  }, [data.daily, isLog]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coding Duration</CardTitle>
        <CardDescription>
          Daily session time {isLog ? "on a log scale" : ""} &middot; {fmtDuration(totalMin)} total
        </CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <BarChart data={chartData} accessibilityLayer barGap={6}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              ticks={tickValues}
              tickFormatter={(v) =>
                isLog
                  ? fmtDuration(Math.max(0, Math.round(10 ** (v as number) - 1)))
                  : fmtDuration(v as number)
              }
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
              dataKey="duration_value"
              fill="var(--color-duration_value)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
