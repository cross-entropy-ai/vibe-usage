import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const metrics = [
    {
      title: "Tokens/Session",
      value: tokensPerSession !== null ? fmtNum(tokensPerSession) : "\u2013",
      description: "Avg tokens per session",
    },
    {
      title: "Tokens/Message",
      value: tokensPerMessage !== null ? fmtNum(tokensPerMessage) : "\u2013",
      description: "Avg tokens per message",
    },
    {
      title: "Messages/Session",
      value:
        messagesPerSession !== null ? messagesPerSession.toFixed(1) : "\u2013",
      description: "Avg messages per session",
    },
    {
      title: "Cache Hit Rate",
      value: cacheHitRate !== null ? `${cacheHitRate.toFixed(1)}%` : "\u2013",
      description: "Prompt cache utilization",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {metric.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metric.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
