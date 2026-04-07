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
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtMs, shortenModel } from "@/lib/formatters";
import type { LatencyData } from "@/types";

const config = {
  count: { label: "Messages", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function LatencyChart({ data, modelLimit = 8 }: { data: LatencyData; modelLimit?: number }) {
  const { overall, by_model, histogram } = data;
  const topModels = by_model.slice(0, modelLimit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Response Latency</CardTitle>
        <CardDescription>
          Assistant message response time distribution
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Percentile stat badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">p50: {fmtMs(overall.p50)}</Badge>
          <Badge variant="secondary">p95: {fmtMs(overall.p95)}</Badge>
          <Badge variant="secondary">p99: {fmtMs(overall.p99)}</Badge>
          <Badge variant="secondary">avg: {fmtMs(overall.avg)}</Badge>
        </div>

        {/* Histogram bar chart */}
        <ChartContainer config={config} className="h-[300px] w-full">
          <BarChart data={histogram} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="bucket"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>

        {/* Per-model latency table */}
        {topModels.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topModels.map((m) => (
                <TableRow key={m.model}>
                  <TableCell className="font-medium">
                    {shortenModel(m.model)}
                  </TableCell>
                  <TableCell className="text-right">{fmtMs(m.p50)}</TableCell>
                  <TableCell className="text-right">{fmtMs(m.p95)}</TableCell>
                  <TableCell className="text-right">{m.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
