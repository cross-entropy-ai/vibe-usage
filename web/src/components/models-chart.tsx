import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtNum } from "@/lib/formatters";
import type { ModelTokens } from "@/types";

const config = {
  output_tokens: { label: "Output", color: "var(--chart-3)" },
  thinking_tokens: { label: "Thinking", color: "var(--chart-4)" },
} satisfies ChartConfig;

function shortenModels(names: string[]): string[] {
  const stripped = names.map((n) => n.replace(/^models\//, ""));
  const withoutDate = stripped.map((n) => n.replace(/-\d{8}$/, ""));

  // Only strip the date suffix when it wouldn't create a duplicate label
  const chosen = stripped.map((orig, i) => {
    const short = withoutDate[i];
    const wouldDuplicate = withoutDate.some((s, j) => j !== i && s === short);
    return wouldDuplicate ? orig : short;
  });

  return chosen.map((n) => n.slice(0, 28));
}

export function ModelsChart({ data, limit = 12 }: { data: ModelTokens[]; limit?: number }) {
  // Filter out models with no output or thinking tokens, then nullify zeros for log scale
  const slice = data
    .filter((d) => d.output_tokens > 0 || d.thinking_tokens > 0)
    .slice(0, limit);
  const labels = shortenModels(slice.map((d) => d.model));
  const top = slice.map((d, i) => ({
    ...d,
    model: labels[i],
    output_tokens: d.output_tokens || null,
    thinking_tokens: d.thinking_tokens || null,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tokens by Model</CardTitle>
        <CardDescription>Top models by output and thinking tokens on a log scale</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[350px] w-full">
          <LineChart data={top} layout="vertical" accessibilityLayer margin={{ left: 20, right: 12 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="model" type="category" width={140} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <XAxis type="number" scale="log" domain={[1, "auto"]} tickFormatter={fmtNum} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="output_tokens"
              stroke="var(--color-output_tokens)"
              strokeOpacity={0}
              dot={{ r: 4, fill: "var(--color-output_tokens)", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "var(--color-output_tokens)", strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="thinking_tokens"
              stroke="var(--color-thinking_tokens)"
              strokeOpacity={0}
              dot={{ r: 4, fill: "var(--color-thinking_tokens)", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "var(--color-thinking_tokens)", strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
