import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtUsd } from "@/lib/formatters";
import type { ProjectionResult } from "@/lib/projector-calc";

const config = {
  cost_with_cache: { label: "With Cache", color: "hsl(221 83% 53%)" },
  cost_without_cache: { label: "No Cache", color: "hsl(25 95% 53%)" },
} satisfies ChartConfig;

interface Props {
  data: ProjectionResult[];
  currentModels: string[];
  limit?: number;
}

export function ProjectionChart({ data, currentModels, limit = 15 }: Props) {
  const top = data.slice(0, limit).map((d) => ({
    ...d,
    model: d.model.replace(/-\d{8}$/, "").slice(0, 24),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost Projection</CardTitle>
        <CardDescription>Top {limit} models by cost (lower is cheaper)</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[400px] w-full">
          <BarChart data={top} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="model"
              type="category"
              width={160}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <XAxis
              type="number"
              tickFormatter={(v: number) => fmtUsd(v)}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend />
            <Bar
              dataKey="cost_with_cache"
              fill="var(--color-cost_with_cache)"
              radius={[0, 4, 4, 0]}
              minPointSize={2}
            />
            <Bar
              dataKey="cost_without_cache"
              fill="var(--color-cost_without_cache)"
              radius={[0, 4, 4, 0]}
              minPointSize={2}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
