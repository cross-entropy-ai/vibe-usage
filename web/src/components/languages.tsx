import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartScaleToggle } from "./chart-scale-toggle";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CHART_PALETTE } from "@/lib/tools";
import { useChartScale } from "@/lib/contexts";
import type { LanguagesData } from "@/types";

const TASK_COLORS: Record<string, string> = {
  "Bug Fix": "#ef4444",
  "New Feature": "#10b981",
  "Refactor": "#8b5cf6",
  "Explanation": "#3b82f6",
  "Exploration": "#06b6d4",
  "Modification": "#f59e0b",
  "Testing": "#14b8a6",
  "Code Review": "#6366f1",
  "Configuration": "#a855f7",
  "Deployment": "#f97316",
  "Git Operations": "#64748b",
  "Other": "#94a3b8",
};

const taskConfig = { sessions: { label: "Sessions", color: "#888" } } satisfies ChartConfig;

export function Languages({ data, taskLimit = 10 }: { data: LanguagesData; taskLimit?: number }) {
  const tasks = data.task_types.slice(0, taskLimit);
  const { scale, domain, toggle } = useChartScale();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Language</CardTitle>
          <CardDescription>Detected language of first user message</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            {data.languages.map((l, i) => (
              <div key={l.language} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: CHART_PALETTE[i] }} />
                <span className="text-sm font-medium">{l.language}</span>
                <span className="text-sm text-muted-foreground">{l.sessions}</span>
              </div>
            ))}
          </div>
          {data.languages.length >= 2 && (
            <div className="h-3 bg-muted rounded-full mt-3 overflow-hidden flex">
              {data.languages.map((l, i) => {
                const total = data.languages.reduce((a, b) => a + b.sessions, 0);
                return <div key={l.language} className="h-full" style={{ width: `${(l.sessions / total) * 100}%`, background: CHART_PALETTE[i] }} />;
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task Types</CardTitle>
          <CardDescription>Classified from first user message</CardDescription>
          <CardAction>
            <ChartScaleToggle scale={scale} onToggle={toggle} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ChartContainer config={taskConfig} className="h-[250px] w-full">
            <BarChart data={tasks} layout="vertical" accessibilityLayer margin={{ left: 0 }}>
              <CartesianGrid horizontal={false} />
              <YAxis type="category" dataKey="task" hide />
              <XAxis type="number" scale={scale} domain={domain} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="sessions" radius={[0, 4, 4, 0]} barSize={22}>
                <LabelList
                  dataKey="task"
                  fontSize={11}
                  fontWeight={500}
                  content={({ x, y, width, height, value }: any) => {
                    const textWidth = String(value).length * 6.5;
                    const inside = width > textWidth + 16;
                    return (
                      <text
                        x={inside ? x + 8 : x + width + 6}
                        y={y + height / 2}
                        dominantBaseline="central"
                        fill={inside ? "#fff" : "currentColor"}
                        fontSize={11}
                        fontWeight={500}
                      >
                        {value}
                      </text>
                    );
                  }}
                />
                {tasks.map((t, i) => (
                  <Cell key={t.task} fill={TASK_COLORS[t.task] || CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
