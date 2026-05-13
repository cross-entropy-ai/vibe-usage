import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartScaleToggle } from "./chart-scale-toggle";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useChartScale } from "@/lib/contexts";
import type { ToolCallFreq } from "@/types";

const config = {
  count: { label: "Calls", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function ToolCallsChart({ data, limit = 15 }: { data: ToolCallFreq[]; limit?: number }) {
  const top = data.slice(0, limit);
  const { scale, domain, toggle } = useChartScale();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tool Calls</CardTitle>
        <CardDescription>Most invoked tools across all sessions</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[350px] w-full">
          <BarChart data={top} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <XAxis type="number" scale={scale} domain={domain} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
