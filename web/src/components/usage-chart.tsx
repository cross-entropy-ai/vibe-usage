import { useMemo } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Label,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Summary } from "@/types";

// ── Shared helpers ──────────────────────────────────────────────

function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const x = new Date(y, m - 1, day);
  return `${x.getMonth() + 1}/${x.getDate()}`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

// ── 1. Area Chart: Sessions & Messages ──────────────────────────

const areaConfig = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
  messages: { label: "Messages", color: "var(--chart-2)" },
} satisfies ChartConfig;

function SessionsAreaChart({ summary }: { summary: Summary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions & Messages</CardTitle>
        <CardDescription>Daily activity trend</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={areaConfig} className="h-[300px] w-full">
          <AreaChart data={summary.daily} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis scale="log" domain={[1, "auto"]} tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area type="natural" dataKey="sessions" stroke="var(--color-sessions)" fill="var(--color-sessions)" fillOpacity={0.2} strokeWidth={2} />
            <Area type="natural" dataKey="messages" stroke="var(--color-messages)" fill="var(--color-messages)" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── 2. Bar Chart: Daily Token Usage ─────────────────────────────

const barConfig = {
  input_tokens: { label: "Input", color: "var(--chart-3)" },
  output_tokens: { label: "Output", color: "var(--chart-4)" },
} satisfies ChartConfig;

function TokenBarChart({ summary }: { summary: Summary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Usage</CardTitle>
        <CardDescription>Daily input / output tokens</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={barConfig} className="h-[300px] w-full">
          <BarChart data={summary.daily} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis scale="log" domain={[1, "auto"]} tickFormatter={fmtNum} tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="input_tokens" fill="var(--color-input_tokens)" radius={[4, 4, 0, 0]} stackId="tokens" />
            <Bar dataKey="output_tokens" fill="var(--color-output_tokens)" radius={[4, 4, 0, 0]} stackId="tokens" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── 3. Line Chart: Cumulative Sessions ──────────────────────────

const lineConfig = {
  cumulative: { label: "Cumulative Sessions", color: "var(--chart-1)" },
} satisfies ChartConfig;

function CumulativeLineChart({ summary }: { summary: Summary }) {
  const data = useMemo(() => {
    let total = 0;
    return summary.daily.map((d) => {
      total += d.sessions;
      return { date: d.date, cumulative: total };
    });
  }, [summary.daily]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cumulative Sessions</CardTitle>
        <CardDescription>Running total over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={lineConfig} className="h-[300px] w-full">
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="natural" dataKey="cumulative" stroke="var(--color-cumulative)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── 4. Pie Chart: Sessions by Tool ──────────────────────────────

const TOOL_COLORS = ["var(--chart-3)", "var(--chart-1)", "var(--chart-2)", "var(--chart-4)"] as const;

const pieConfig = {
  gemini: { label: "Gemini", color: TOOL_COLORS[0] },
  claude: { label: "Claude", color: TOOL_COLORS[1] },
  codex: { label: "Codex", color: TOOL_COLORS[2] },
  kimi: { label: "Kimi", color: TOOL_COLORS[3] },
} satisfies ChartConfig;

function ToolPieChart({ summary }: { summary: Summary }) {
  const data = useMemo(
    () =>
      Object.entries(summary.by_tool)
        .filter(([, v]) => v > 0)
        .map(([tool, sessions]) => ({ tool, sessions, fill: `var(--color-${tool})` })),
    [summary.by_tool],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions by Tool</CardTitle>
        <CardDescription>Distribution across AI tools</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={pieConfig} className="h-[300px] w-full">
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent nameKey="tool" hideLabel />} />
            <Pie data={data} dataKey="sessions" nameKey="tool" innerRadius={60} strokeWidth={4}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                          {summary.total_sessions}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="fill-muted-foreground text-sm">
                          sessions
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="tool" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── 5. Radar Chart: Token Breakdown ─────────────────────────────

const radarConfig = {
  value: { label: "Tokens", color: "var(--chart-1)" },
} satisfies ChartConfig;

function TokenRadarChart({ summary }: { summary: Summary }) {
  const data = useMemo(() => {
    const { input, output, thinking, cache_read, cache_write } = summary.tokens;
    const max = Math.max(input, output, thinking, cache_read, cache_write, 1);
    return [
      { category: "Input", value: input, pct: Math.round((input / max) * 100) },
      { category: "Output", value: output, pct: Math.round((output / max) * 100) },
      { category: "Thinking", value: thinking, pct: Math.round((thinking / max) * 100) },
      { category: "Cache Read", value: cache_read, pct: Math.round((cache_read / max) * 100) },
      { category: "Cache Write", value: cache_write, pct: Math.round((cache_write / max) * 100) },
    ];
  }, [summary.tokens]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Breakdown</CardTitle>
        <CardDescription>Shape of token usage across categories</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={radarConfig} className="h-[300px] w-full">
          <RadarChart data={data} accessibilityLayer>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_value, _name, item) => (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{item.payload.category}</span>
                      <span className="font-mono font-medium tabular-nums">{fmtNum(item.payload.value)}</span>
                    </div>
                  )}
                />
              }
            />
            <PolarGrid />
            <PolarAngleAxis dataKey="category" tick={{ fontSize: 12 }} />
            <Radar dataKey="pct" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.25} strokeWidth={2} />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── 6. Radial Bar Chart: Message Distribution ───────────────────

const radialConfig = {
  user: { label: "User", color: "var(--chart-1)" },
  assistant: { label: "Assistant", color: "var(--chart-2)" },
} satisfies ChartConfig;

function MessageRadialChart({ summary }: { summary: Summary }) {
  const data = useMemo(() => {
    const total = summary.messages.total || 1;
    return [
      { role: "assistant", count: summary.messages.assistant, pct: Math.round((summary.messages.assistant / total) * 100), fill: "var(--color-assistant)" },
      { role: "user", count: summary.messages.user, pct: Math.round((summary.messages.user / total) * 100), fill: "var(--color-user)" },
    ];
  }, [summary.messages]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Message Distribution</CardTitle>
        <CardDescription>User vs assistant messages</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={radialConfig} className="h-[300px] w-full">
          <RadialBarChart data={data} innerRadius={50} outerRadius={130} accessibilityLayer>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="role"
                  formatter={(value) => `${value}%`}
                />
              }
            />
            <RadialBar dataKey="pct" cornerRadius={8} />
            <ChartLegend content={<ChartLegendContent nameKey="role" />} />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── Export ───────────────────────────────────────────────────────

export function UsageCharts({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <SessionsAreaChart summary={summary} />
      <TokenBarChart summary={summary} />
      <CumulativeLineChart summary={summary} />
      <ToolPieChart summary={summary} />
      <TokenRadarChart summary={summary} />
      <MessageRadialChart summary={summary} />
    </div>
  );
}
