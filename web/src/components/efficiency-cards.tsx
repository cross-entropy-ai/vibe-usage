import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrainCircuit, Gauge, Layers3, Zap } from "lucide-react";
import { fmtNum } from "@/lib/formatters";
import type { Summary } from "@/types";

function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function EfficiencyCards({ summary }: { summary: Summary }) {
  const totalSessions = summary.daily.reduce((sum, entry) => sum + entry.sessions, 0);
  const totalMessages = summary.daily.reduce((sum, entry) => sum + entry.messages, 0);
  const inputTokens = summary.daily.reduce((sum, entry) => sum + entry.input_tokens, 0);
  const outputTokens = summary.daily.reduce((sum, entry) => sum + entry.output_tokens, 0);
  const totalTokens = inputTokens + outputTokens;

  const tokensPerSession = safeDivide(totalTokens, totalSessions);
  const tokensPerMessage = safeDivide(totalTokens, totalMessages);
  const messagesPerSession = safeDivide(
    totalMessages,
    totalSessions,
  );
  const outputShare = safeDivide(outputTokens * 100, totalTokens);

  const metrics = [
    {
      title: "Session Depth",
      value:
        messagesPerSession !== null ? messagesPerSession.toFixed(1) : "\u2013",
      description: "Average messages per coding session",
      icon: Layers3,
    },
    {
      title: "Token Intensity",
      value: tokensPerSession !== null ? fmtNum(tokensPerSession) : "\u2013",
      description: "Average tokens consumed per session",
      icon: Zap,
    },
    {
      title: "Prompt Density",
      value: tokensPerMessage !== null ? fmtNum(tokensPerMessage) : "\u2013",
      description: "Average tokens exchanged per message",
      icon: Gauge,
    },
    {
      title: "Output Share",
      value: outputShare !== null ? `${outputShare.toFixed(1)}%` : "\u2013",
      description: "Share of output tokens in total visible load",
      icon: BrainCircuit,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;

        return (
          <Card
            key={metric.title}
            className="border border-slate-200/80 bg-slate-50/90 shadow-sm backdrop-blur-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-700">
                {metric.title}
              </CardTitle>
              <Icon className="size-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight text-slate-950">
                {metric.value}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {metric.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
