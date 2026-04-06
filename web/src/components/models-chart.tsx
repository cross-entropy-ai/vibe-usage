import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ModelTokens } from "@/types";

const config = {
  input_tokens: { label: "Input", color: "var(--chart-1)" },
  output_tokens: { label: "Output", color: "var(--chart-3)" },
  thinking_tokens: { label: "Thinking", color: "var(--chart-4)" },
} satisfies ChartConfig;

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

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

export function ModelsChart({ data }: { data: ModelTokens[] }) {
  const slice = data.slice(0, 12);
  const labels = shortenModels(slice.map((d) => d.model));
  const top = slice.map((d, i) => ({ ...d, model: labels[i] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tokens by Model</CardTitle>
        <CardDescription>Top models by token consumption</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[350px] w-full">
          <BarChart data={top} layout="vertical" accessibilityLayer margin={{ left: 20 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="model" type="category" width={140} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <XAxis type="number" tickFormatter={fmtNum} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="input_tokens" fill="var(--color-input_tokens)" radius={[0, 4, 4, 0]} stackId="t" />
            <Bar dataKey="output_tokens" fill="var(--color-output_tokens)" radius={[0, 4, 4, 0]} stackId="t" />
            <Bar dataKey="thinking_tokens" fill="var(--color-thinking_tokens)" radius={[0, 4, 4, 0]} stackId="t" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
