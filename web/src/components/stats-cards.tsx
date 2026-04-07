import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Bot, FolderKanban, MessageSquareText } from "lucide-react";
import { toolColor, sortedToolEntries } from "@/lib/utils";
import { fmtNum } from "@/lib/formatters";
import { toolLabel } from "@/lib/tools";
import type { Summary } from "@/types";

export function StatsCards({ summary }: { summary: Summary }) {
  const totalTokens = summary.tokens.input + summary.tokens.output + summary.tokens.thinking;
  const activeDays = summary.daily.length;
  const topProject = summary.top_projects[0];
  const cards = [
    {
      title: "Sessions Processed",
      value: fmtNum(summary.total_sessions),
      description:
        activeDays > 0
          ? `${activeDays} active days with ${(
              summary.total_sessions / activeDays
            ).toFixed(1)} sessions per day`
          : "No active-day coverage yet",
      icon: Activity,
      footer: (
        <div className="flex gap-1 flex-wrap">
          {sortedToolEntries(summary.by_tool).map(([tool, count]) =>
            count > 0 ? (
              <Badge key={tool} variant="secondary" className={toolColor(tool)}>
                {toolLabel(tool)} {count}
              </Badge>
            ) : null,
          )}
        </div>
      ),
    },
    {
      title: "Message Exchange",
      value: fmtNum(summary.messages.total),
      description: `${fmtNum(summary.messages.user)} user / ${fmtNum(summary.messages.assistant)} assistant`,
      icon: MessageSquareText,
      footer: (
        <p className="text-xs text-muted-foreground">
          {summary.messages.user > 0
            ? `${(summary.messages.assistant / summary.messages.user).toFixed(1)} assistant replies per user message`
            : "No user-message baseline"}
        </p>
      ),
    },
    {
      title: "Token Volume",
      value: fmtNum(totalTokens),
      description: `${fmtNum(summary.tokens.input)} input / ${fmtNum(summary.tokens.output)} output`,
      icon: Bot,
      footer: (
        <p className="text-xs text-muted-foreground">
          {summary.tokens.thinking > 0
            ? `${fmtNum(summary.tokens.thinking)} thinking tokens captured`
            : "No thinking-token telemetry"}
        </p>
      ),
    },
    {
      title: "Primary Workspace",
      value: topProject?.name ?? "No project data",
      description: topProject
        ? `${fmtNum(topProject.sessions)} sessions routed through the busiest project`
        : "Project breakdown unavailable",
      icon: FolderKanban,
      footer: (
        <p className="text-xs text-muted-foreground">
          {summary.period.start && summary.period.end
            ? `${summary.period.start} to ${summary.period.end}`
            : "No reporting period"}
        </p>
      ),
    },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card
            key={card.title}
            className="border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-sm"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-700">
                {card.title}
              </CardTitle>
              <Icon className="size-4 text-sky-700" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-2xl font-bold tracking-tight text-slate-950">
                  {card.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.description}
                </p>
              </div>
              {card.footer}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
