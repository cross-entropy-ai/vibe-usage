import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Bot, CalendarRange, MessageSquareText } from "lucide-react";
import { fmtNum } from "@/lib/formatters";
import type { Summary } from "@/types";

export function StatsCards({ summary }: { summary: Summary }) {
  const totalSessions = summary.daily.reduce((sum, entry) => sum + entry.sessions, 0);
  const totalMessages = summary.daily.reduce((sum, entry) => sum + entry.messages, 0);
  const inputTokens = summary.daily.reduce((sum, entry) => sum + entry.input_tokens, 0);
  const outputTokens = summary.daily.reduce((sum, entry) => sum + entry.output_tokens, 0);
  const totalTokens = inputTokens + outputTokens;
  const activeDays = summary.daily.length;
  const messagesPerSession = totalSessions > 0 ? totalMessages / totalSessions : null;
  const tokenOutputShare = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : null;
  const periodLabel =
    summary.period.start && summary.period.end
      ? `${summary.period.start} to ${summary.period.end}`
      : "No reporting period";
  const cards = [
    {
      title: "Sessions Processed",
      value: fmtNum(totalSessions),
      description:
        activeDays > 0
          ? `${activeDays} active days with ${(
              totalSessions / activeDays
            ).toFixed(1)} sessions per day`
          : "No active-day coverage yet",
      icon: Activity,
      footer: <p className="text-xs text-muted-foreground">{periodLabel}</p>,
    },
    {
      title: "Message Exchange",
      value: fmtNum(totalMessages),
      description:
        messagesPerSession !== null
          ? `${messagesPerSession.toFixed(1)} messages per session`
          : "No session baseline",
      icon: MessageSquareText,
      footer: (
        <p className="text-xs text-muted-foreground">
          {activeDays > 0
            ? `${activeDays} active days in the selected window`
            : "No activity in this window"}
        </p>
      ),
    },
    {
      title: "Token Volume",
      value: fmtNum(totalTokens),
      description: `${fmtNum(inputTokens)} input / ${fmtNum(outputTokens)} output`,
      icon: Bot,
      footer: (
        <p className="text-xs text-muted-foreground">
          {totalSessions > 0
            ? `${fmtNum(totalTokens / totalSessions)} tokens per session`
            : "No session baseline"}
        </p>
      ),
    },
    {
      title: "Window Coverage",
      value: fmtNum(activeDays),
      description: periodLabel,
      icon: CalendarRange,
      footer: (
        <p className="text-xs text-muted-foreground">
          {tokenOutputShare !== null
            ? `${tokenOutputShare.toFixed(1)}% output share`
            : "No token coverage yet"}
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
