import { useMemo } from "react";
import { RadialBarChart, RadialBar } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
interface MessageCounts {
  total: number;
  user: number;
  assistant: number;
}

const radialConfig = {
  user: { label: "User", color: "var(--chart-1)" },
  assistant: { label: "Assistant", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function MessageRadialChart({ messages }: { messages: MessageCounts }) {
  const data = useMemo(() => {
    const total = messages.total || 1;
    return [
      { role: "assistant", count: messages.assistant, pct: Math.round((messages.assistant / total) * 100), fill: "var(--color-assistant)" },
      { role: "user", count: messages.user, pct: Math.round((messages.user / total) * 100), fill: "var(--color-user)" },
    ];
  }, [messages]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Message Distribution</CardTitle>
        <CardDescription>User vs assistant messages</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={radialConfig} className="h-[300px] w-full">
          <RadialBarChart data={data} innerRadius={50} outerRadius={130} accessibilityLayer>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="role"
                  formatter={(value) => `${value}%`}
                />
              }
            />
            <RadialBar dataKey="pct" cornerRadius={8} />
            <ChartLegend content={<ChartLegendContent nameKey="role" />} />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
