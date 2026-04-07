import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
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
const lengthConfig = {
  prompt: { label: "Prompt", color: "var(--chart-1)" },
  response: { label: "Response", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function ConversationDepth({ data }: { data: ConversationsInsight }) {
  const lengthHistogram = useMemo(() => {
    const responseByBucket = new Map(
      data.response_length.histogram.map((entry) => [entry.bucket, entry.count]),
    );

    return data.prompt_length.histogram.map((entry) => ({
      bucket: entry.bucket,
      prompt: entry.count,
      response: responseByBucket.get(entry.bucket) ?? 0,
    }));
  }, [data.prompt_length.histogram, data.response_length.histogram]);

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
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message Length Distribution</CardTitle>
          <CardDescription>
            Prompt avg {fmtNum(data.prompt_length.avg_chars)} / median {fmtNum(data.prompt_length.median_chars)}
            {" · "}
            Response avg {fmtNum(data.response_length.avg_chars)} / median {fmtNum(data.response_length.median_chars)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={lengthConfig} className="h-[200px] w-full">
            <BarChart data={lengthHistogram} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="prompt" fill="var(--color-prompt)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="response" fill="var(--color-response)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
