import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtNum } from "@/lib/formatters";
import type { DailyStat } from "@/types";

const config = {
  tokens_per_session: { label: "Tokens/Session", color: "var(--chart-1)" },
  tokens_per_message: { label: "Tokens/Message", color: "var(--chart-2)" },
  messages_per_session: { label: "Messages/Session", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function EfficiencyTrendChart({ daily }: { daily: DailyStat[] }) {
  const data = useMemo(() => {
    return daily
      .filter((d) => d.sessions > 0)
      .map((d) => {
        const totalTokens = d.input_tokens + d.output_tokens;
        return {
          date: d.date,
          tokens_per_session: Math.round(totalTokens / d.sessions),
          tokens_per_message: d.messages > 0 ? Math.round(totalTokens / d.messages) : 0,
          messages_per_session: parseFloat((d.messages / d.sessions).toFixed(1)),
        };
      });
  }, [daily]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Efficiency Trends</CardTitle>
        <CardDescription>
          Tokens/Session, Tokens/Message, and Messages/Session over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              yAxisId="tokens"
              tickFormatter={fmtNum}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              yAxisId="messages"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    if (name === "messages_per_session") return (value as number).toFixed(1);
                    return fmtNum(value as number);
                  }}
                />
              }
            />
            <Legend />
            <Line
              yAxisId="tokens"
              type="monotone"
              dataKey="tokens_per_session"
              stroke="var(--color-tokens_per_session)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="tokens"
              type="monotone"
              dataKey="tokens_per_message"
              stroke="var(--color-tokens_per_message)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="messages"
              type="monotone"
              dataKey="messages_per_session"
              stroke="var(--color-messages_per_session)"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
