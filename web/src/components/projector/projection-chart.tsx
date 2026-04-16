import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtUsd } from "@/lib/formatters";
import type { ProjectionResult } from "@/lib/projector-calc";
import type { CostMode } from "./projection-table";

const MODE_CONFIG: Record<CostMode, { key: string; label: string; color: string }> = {
  with_cache: { key: "cost_with_cache", label: "With Cache", color: "hsl(221 83% 53%)" },
  without_cache: { key: "cost_without_cache", label: "No Cache", color: "hsl(25 95% 53%)" },
};

interface Props {
  data: ProjectionResult[];
  mode: CostMode;
  limit?: number;
}

export function ProjectionChart({ data, mode, limit = 15 }: Props) {
  const modeInfo = MODE_CONFIG[mode];

  const config = {
    [modeInfo.key]: { label: modeInfo.label, color: modeInfo.color },
  } satisfies ChartConfig;

  const sorted = [...data].sort((a, b) => {
    const costA = mode === "with_cache" ? a.cost_with_cache : a.cost_without_cache;
    const costB = mode === "with_cache" ? b.cost_with_cache : b.cost_without_cache;
    return costA - costB;
  });

  const top = sorted.slice(0, limit).map((d) => ({
    ...d,
    model: d.model.replace(/-\d{8}$/, "").slice(0, 24),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{modeInfo.label}</CardTitle>
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
            <Bar
              dataKey={modeInfo.key}
              fill={`var(--color-${modeInfo.key})`}
              radius={[0, 4, 4, 0]}
              minPointSize={2}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
