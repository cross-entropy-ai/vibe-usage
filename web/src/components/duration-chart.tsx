import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DurationData } from "@/types";

const config = {
  duration_min: { label: "Minutes", color: "var(--chart-5)" },
} satisfies ChartConfig;

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const x = new Date(y, m - 1, day);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}

function fmtDuration(min: number) {
  if (min >= 60) return (min / 60).toFixed(1) + "h";
  return Math.round(min) + "m";
}

export function DurationChart({ data }: { data: DurationData }) {
  const totalMin = data.daily.reduce((s, d) => s + d.duration_min, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coding Duration</CardTitle>
        <CardDescription>
          Daily session time &middot; {fmtDuration(totalMin)} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <AreaChart data={data.daily} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickFormatter={(v) => fmtDuration(v)} tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => fmtDuration(value as number)}
                />
              }
            />
            <Area
              type="natural"
              dataKey="duration_min"
              stroke="var(--color-duration_min)"
              fill="var(--color-duration_min)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
