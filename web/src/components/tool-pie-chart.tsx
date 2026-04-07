import { useMemo } from "react";
import { PieChart, Pie, Label } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TOOL_NAMES, toolChartColor, toolLabel } from "@/lib/tools";

interface ToolPieChartProps {
  byTool: Record<string, number>;
  totalSessions: number;
}

const pieConfig = Object.fromEntries(
  TOOL_NAMES.map((t) => [t, { label: toolLabel(t), color: toolChartColor(t) }]),
) satisfies ChartConfig;

export function ToolPieChart({ byTool, totalSessions }: ToolPieChartProps) {
  const data = useMemo(
    () =>
      Object.entries(byTool)
        .filter(([, v]) => v > 0)
        .map(([tool, sessions]) => ({ tool, sessions, fill: `var(--color-${tool})` })),
    [byTool],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions by Tool</CardTitle>
        <CardDescription>Distribution across AI tools</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={pieConfig} className="h-[300px] w-full">
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent nameKey="tool" hideLabel />} />
            <Pie data={data} dataKey="sessions" nameKey="tool" innerRadius={60} strokeWidth={4}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                          {totalSessions}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="fill-muted-foreground text-sm">
                          sessions
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="tool" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
