import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrainCircuit, Gauge, Layers3, Zap } from "lucide-react";
import { fmtNum } from "@/lib/formatters";
import type { Summary } from "@/types";

function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function EfficiencyCards({ summary }: { summary: Summary }) {
  const totalTokens =
    summary.tokens.input + summary.tokens.output + summary.tokens.thinking;

  const tokensPerSession = safeDivide(totalTokens, summary.total_sessions);
  const tokensPerMessage = safeDivide(totalTokens, summary.messages.total);
  const messagesPerSession = safeDivide(
    summary.messages.total,
    summary.total_sessions,
  );
  const cacheHitRate = safeDivide(
    summary.tokens.cache_read * 100,
    summary.tokens.input + summary.tokens.cache_read,
  );
  const thinkingShare = safeDivide(summary.tokens.thinking * 100, totalTokens);

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
      title: "Reasoning Share",
      value: thinkingShare !== null ? `${thinkingShare.toFixed(1)}%` : "\u2013",
      description:
        cacheHitRate !== null
          ? `Thinking tokens in total load. Cache hit rate ${cacheHitRate.toFixed(1)}%`
          : "Thinking tokens in total load",
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
