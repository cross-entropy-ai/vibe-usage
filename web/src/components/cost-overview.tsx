import { BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { toolColor } from "@/lib/utils";
import type { CostData } from "@/types";

function fmtUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const dailyConfig = {
  equivalent_api_cost_usd: { label: "API Cost", color: "var(--chart-1)" },
} satisfies ChartConfig;

const modelConfig = {
  equivalent_api_cost_usd: { label: "API Cost", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function CostOverview({ data }: { data: CostData }) {
  const toolEntries = Object.entries(data.by_tool).sort(
    (a, b) => b[1].equivalent_api_cost_usd - a[1].equivalent_api_cost_usd,
  );

  const topModels = data.by_model.slice(0, 10).map((m) => ({
    ...m,
    model: m.model.replace(/-\d{8}$/, "").slice(0, 24),
  }));

  const savingsPct =
    data.equivalent_api_cost_usd > 0
      ? ((data.saved_usd / data.equivalent_api_cost_usd) * 100).toFixed(0)
      : "0";

  return (
    <div className="space-y-4">
      {/* Cost summary — single card with 3 values inline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cost</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-8 gap-y-2 items-baseline">
            <div>
              <span className="text-xs text-muted-foreground mr-1">API Equivalent</span>
              <span className="text-xl font-bold">{fmtUsd(data.equivalent_api_cost_usd)}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground mr-1">Actual</span>
              <span className="text-xl font-bold">{fmtUsd(data.actual_cost_usd)}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground mr-1">Saved</span>
              <span className="text-xl font-bold text-green-600">{fmtUsd(data.saved_usd)}</span>
              <span className="text-xs text-green-600 ml-1">({savingsPct}%)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-tool breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost by Tool</CardTitle>
          <CardDescription>Equivalent API cost vs actual (with subscription)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {toolEntries.map(([tool, info]) => {
              const pct =
                data.equivalent_api_cost_usd > 0
                  ? (info.equivalent_api_cost_usd / data.equivalent_api_cost_usd) * 100
                  : 0;
              return (
                <div key={tool} className="flex items-center gap-3">
                  <Badge variant="secondary" className={`${toolColor(tool)} w-16 justify-center`}>
                    {tool}
                  </Badge>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{fmtUsd(info.equivalent_api_cost_usd)}</span>
                      {info.subscription && (
                        <span className="text-xs text-muted-foreground">
                          actual: {fmtUsd(info.actual_cost_usd)} ({info.subscription.plan})
                          {info.saved_usd > 0 && (
                            <span className="text-green-600 ml-1">
                              saved {fmtUsd(info.saved_usd)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily cost trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily API Cost</CardTitle>
            <CardDescription>Equivalent API cost per day</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={dailyConfig} className="h-[250px] w-full">
              <AreaChart data={data.daily} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis scale="log" domain={[0.01, "auto"]} tickLine={false} axisLine={false} tickFormatter={(v: number) => "$" + v} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="equivalent_api_cost_usd"
                  type="monotone"
                  fill="var(--color-equivalent_api_cost_usd)"
                  fillOpacity={0.3}
                  stroke="var(--color-equivalent_api_cost_usd)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Cost by model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by Model</CardTitle>
            <CardDescription>Top models by equivalent API cost</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={modelConfig} className="h-[250px] w-full">
              <BarChart data={topModels} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="model"
                  type="category"
                  width={130}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <XAxis
                  type="number"
                  scale="log"
                  domain={[1, "auto"]}
                  tickFormatter={(v: number) => fmtUsd(v)}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="equivalent_api_cost_usd"
                  fill="var(--color-equivalent_api_cost_usd)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
