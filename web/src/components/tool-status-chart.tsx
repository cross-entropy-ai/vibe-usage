import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ToolStatusEntry } from "@/types";

const config = {
  success: { label: "Success", color: "hsl(142 76% 36%)" },
  error: { label: "Error", color: "hsl(0 84% 60%)" },
} satisfies ChartConfig;

export function ToolStatusChart({ data, limit = 20 }: { data: ToolStatusEntry[]; limit?: number }) {
  const top = data
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((d) => ({
      ...d,
      name: d.name.length > 20 ? d.name.slice(0, 20) + "\u2026" : d.name,
      error_rate:
        d.total > 0 ? parseFloat(((d.error / d.total) * 100).toFixed(1)) : 0,
    }));

  const totalCalls = data.reduce((sum, d) => sum + d.total, 0);
  const totalSuccess = data.reduce((sum, d) => sum + d.success, 0);
  const overallSuccessRate =
    totalCalls > 0 ? ((totalSuccess / totalCalls) * 100).toFixed(1) : "0.0";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tool Call Status</CardTitle>
        <CardDescription>Success vs error rate by tool</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2 items-baseline">
          <div>
            <span className="text-xs text-muted-foreground mr-1">
              Total Calls
            </span>
            <span className="text-xl font-bold">
              {totalCalls.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-1">
              Success Rate
            </span>
            <span className="text-xl font-bold text-green-600">
              {overallSuccessRate}%
            </span>
          </div>
        </div>
        <ChartContainer config={config} className="h-[450px] w-full">
          <BarChart
            data={top}
            layout="vertical"
            accessibilityLayer
            margin={{ left: 10 }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={150}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <XAxis type="number" scale="log" domain={[1, "auto"]} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="success"
              stackId="status"
              fill="var(--color-success)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="error"
              stackId="status"
              fill="var(--color-error)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
