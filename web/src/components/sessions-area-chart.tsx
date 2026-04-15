import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtNum } from "@/lib/formatters";
import type { DailyStat } from "@/types";

const barConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
  messages: { label: "Messages", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function SessionsAreaChart({ daily }: { daily: DailyStat[] }) {
  const safeDaily = daily.filter((d) => d.sessions > 0 && d.messages > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions & Messages</CardTitle>
        <CardDescription>Split scales keep both daily counts readable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Messages
            </p>
            <p className="text-xs text-muted-foreground">Independent scale</p>
          </div>
          <ChartContainer config={barConfig} className="h-[140px] w-full">
            <BarChart data={safeDaily} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis
                scale="log"
                domain={[1, "auto"]}
                tickFormatter={fmtNum}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="messages" fill="var(--color-messages)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Sessions
            </p>
            <p className="text-xs text-muted-foreground">Independent scale</p>
          </div>
          <ChartContainer config={barConfig} className="h-[140px] w-full">
            <BarChart data={safeDaily} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                scale="log"
                domain={[1, "auto"]}
                tickFormatter={fmtNum}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
