import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate } from "@/lib/formatters";
import type { DailyStat } from "@/types";

const areaConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
  messages: { label: "Messages", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function SessionsAreaChart({ daily }: { daily: DailyStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions & Messages</CardTitle>
        <CardDescription>Daily activity trend</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={areaConfig} className="h-[300px] w-full">
          <AreaChart data={daily} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis scale="log" domain={[1, "auto"]} tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area type="natural" dataKey="sessions" stroke="var(--color-sessions)" fill="var(--color-sessions)" fillOpacity={0.2} strokeWidth={2} />
            <Area type="natural" dataKey="messages" stroke="var(--color-messages)" fill="var(--color-messages)" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
