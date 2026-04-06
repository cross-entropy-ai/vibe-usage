import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toolColor, sortedToolEntries } from "@/lib/utils";
import type { Summary } from "@/types";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export function StatsCards({ summary }: { summary: Summary }) {
  const totalTokens = summary.tokens.input + summary.tokens.output + summary.tokens.thinking;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.total_sessions}</div>
          <div className="flex gap-1 mt-2 flex-wrap">
            {sortedToolEntries(summary.by_tool).map(([tool, count]) =>
              count > 0 ? (
                <Badge key={tool} variant="secondary" className={toolColor(tool)}>
                  {tool} {count}
                </Badge>
              ) : null,
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(summary.messages.total)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatNumber(summary.messages.user)} user / {formatNumber(summary.messages.assistant)} assistant
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(totalTokens)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatNumber(summary.tokens.input)} in / {formatNumber(summary.tokens.output)} out
            {summary.tokens.thinking > 0 && ` / ${formatNumber(summary.tokens.thinking)} think`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Period</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.daily.length > 0 ? (
            <>
              <div className="text-lg font-bold">
                {summary.daily.length} <span className="text-sm font-normal text-muted-foreground">active days</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.period.start} — {summary.period.end}
              </p>
            </>
          ) : (
            <div className="text-lg font-bold text-muted-foreground">No data</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
