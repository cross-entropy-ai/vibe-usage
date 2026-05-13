import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartScaleToggle } from "./chart-scale-toggle";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtDate, fmtNum } from "@/lib/formatters";
import { useChartScale } from "@/lib/contexts";
import type { DailyStat } from "@/types";

const barConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
  messages: { label: "Messages", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function SessionsAreaChart({ daily }: { daily: DailyStat[] }) {
  const { scale, domain, isLog, toggle } = useChartScale();
  const messagesData = isLog ? daily.filter((d) => d.messages > 0) : daily;
  const sessionsData = isLog ? daily.filter((d) => d.sessions > 0) : daily;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions & Messages</CardTitle>
        <CardDescription>{isLog ? "Split scales keep both daily counts readable" : "Daily session and message counts"}</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
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
            <BarChart data={messagesData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis
                scale={scale}
                domain={domain}
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
            <BarChart data={sessionsData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                scale={scale}
                domain={domain}
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
