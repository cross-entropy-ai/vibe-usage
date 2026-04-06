import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DailyStat } from "@/types";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (previous === 0) {
    return <span className="text-xs text-green-600">new</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  if (pct === 0) {
    return <span className="text-xs text-muted-foreground">0%</span>;
  }
  if (pct > 0) {
    return <span className="text-xs text-green-600">↑{pct.toFixed(0)}%</span>;
  }
  return <span className="text-xs text-red-600">↓{Math.abs(pct).toFixed(0)}%</span>;
}

interface PeriodAgg {
  sessions: number;
  messages: number;
  tokens: number;
}

function aggregate(stats: DailyStat[]): PeriodAgg {
  let sessions = 0;
  let messages = 0;
  let tokens = 0;
  for (const s of stats) {
    sessions += s.sessions;
    messages += s.messages;
    tokens += s.input_tokens + s.output_tokens;
  }
  return { sessions, messages, tokens };
}

export function TrendComparison({ daily }: { daily: DailyStat[] }) {
  const { thisWeek, lastWeek, thisMonth, lastMonth } = useMemo(() => {
    const lookup = new Map<string, DailyStat>();
    for (const d of daily) {
      lookup.set(d.date, d);
    }

    const today = new Date();
    // Zero out time so date arithmetic is clean
    today.setHours(0, 0, 0, 0);

    function daysAgo(n: number): Date {
      const d = new Date(today);
      d.setDate(d.getDate() - n);
      return d;
    }

    function toDateStr(d: Date): string {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    function collectRange(startDaysAgo: number, endDaysAgo: number): DailyStat[] {
      const result: DailyStat[] = [];
      // endDaysAgo is exclusive (more recent), startDaysAgo is inclusive (further back)
      for (let i = startDaysAgo; i > endDaysAgo; i--) {
        const key = toDateStr(daysAgo(i));
        const entry = lookup.get(key);
        if (entry) result.push(entry);
      }
      return result;
    }

    // "This week" = last 7 days (days 0..6 ago). "Last week" = days 7..13 ago.
    const thisWeekStats = collectRange(6, -1); // days 6,5,4,3,2,1,0
    const lastWeekStats = collectRange(13, 6); // days 13,12,11,10,9,8,7

    // "This month" = last 30 days (days 0..29). "Last month" = days 30..59.
    const thisMonthStats = collectRange(29, -1);
    const lastMonthStats = collectRange(59, 29);

    return {
      thisWeek: aggregate(thisWeekStats),
      lastWeek: aggregate(lastWeekStats),
      thisMonth: aggregate(thisMonthStats),
      lastMonth: aggregate(lastMonthStats),
    };
  }, [daily]);

  const cards = [
    { label: "Sessions (Week)", current: thisWeek.sessions, previous: lastWeek.sessions, format: false },
    { label: "Messages (Week)", current: thisWeek.messages, previous: lastWeek.messages, format: false },
    { label: "Tokens (Week)", current: thisWeek.tokens, previous: lastWeek.tokens, format: true },
    { label: "Sessions (Month)", current: thisMonth.sessions, previous: lastMonth.sessions, format: false },
    { label: "Messages (Month)", current: thisMonth.messages, previous: lastMonth.messages, format: false },
    { label: "Tokens (Month)", current: thisMonth.tokens, previous: lastMonth.tokens, format: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trends</CardTitle>
        <CardDescription>Week-over-week and month-over-month</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="space-y-1">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {c.format ? formatNumber(c.current) : c.current}
                </span>
                <ChangeBadge current={c.current} previous={c.previous} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
