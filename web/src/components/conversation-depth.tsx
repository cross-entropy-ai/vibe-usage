import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtNum } from "@/lib/formatters";
import type { ConversationsInsight } from "@/types";

const depthConfig = { count: { label: "Sessions", color: "var(--chart-1)" } } satisfies ChartConfig;

export function ConversationDepth({ data }: { data: ConversationsInsight }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversation Depth</CardTitle>
          <CardDescription>
            avg {data.depth.avg.toFixed(1)} messages, median {data.depth.median} messages per session
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={depthConfig} className="h-[200px] w-full">
            <BarChart data={data.depth.histogram} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis scale="log" domain={[1, "auto"]} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message Lengths</CardTitle>
          <CardDescription>Average character count per message</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{fmtNum(data.prompt_length.avg_chars)}</div>
              <div className="text-xs text-muted-foreground">avg prompt (chars)</div>
              <div className="text-sm text-muted-foreground mt-1">median: {fmtNum(data.prompt_length.median_chars)}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{fmtNum(data.response_length.avg_chars)}</div>
              <div className="text-xs text-muted-foreground">avg response (chars)</div>
              <div className="text-sm text-muted-foreground mt-1">median: {fmtNum(data.response_length.median_chars)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
