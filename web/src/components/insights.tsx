import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, LabelList, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Legend } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type {
  ConversationsInsight,
  CacheEfficiencyData,
  ThinkingEntry,
  ToolchainsData,
  ModelSwitchData,
  LanguagesData,
  SessionComplexityEntry,
} from "@/types";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

const COLORS = ["#2563eb", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#d946ef", "#f59e0b"];

// ── Conversation Depth ──────────────────────────────────────────

const depthConfig = { count: { label: "Sessions", color: "var(--chart-1)" } } satisfies ChartConfig;

export function ConversationDepth({ data }: { data: ConversationsInsight }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversation Depth</CardTitle>
          <CardDescription>
            avg {data.depth.avg.toFixed(1)} messages, median {data.depth.median} messages per session
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={depthConfig} className="h-[200px] w-full">
            <BarChart data={data.depth.histogram} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis scale="log" domain={[1, "auto"]} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message Lengths</CardTitle>
          <CardDescription>Average character count per message</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{fmtNum(data.prompt_length.avg_chars)}</div>
              <div className="text-xs text-muted-foreground">avg prompt (chars)</div>
              <div className="text-sm text-muted-foreground mt-1">median: {fmtNum(data.prompt_length.median_chars)}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{fmtNum(data.response_length.avg_chars)}</div>
              <div className="text-xs text-muted-foreground">avg response (chars)</div>
              <div className="text-sm text-muted-foreground mt-1">median: {fmtNum(data.response_length.median_chars)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Cache Efficiency ────────────────────────────────────────────

export function CacheEfficiency({ data }: { data: CacheEfficiencyData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cache Efficiency</CardTitle>
        <CardDescription>Prompt cache hit rate by tool and model</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2">By Tool</h4>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tool</TableHead><TableHead className="text-right">Hit Rate</TableHead>
                <TableHead className="text-right">Cache Read</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.by_tool.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right">{t.hit_rate_pct}%</TableCell>
                    <TableCell className="text-right">{fmtNum(t.cache_read_tokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">By Model</h4>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Model</TableHead><TableHead className="text-right">Hit Rate</TableHead>
                <TableHead className="text-right">Cache Read</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.by_model.slice(0, 8).map((m) => (
                  <TableRow key={m.name}>
                    <TableCell className="font-medium text-xs">{m.name.replace(/-\d{8}$/, "").slice(0, 22)}</TableCell>
                    <TableCell className="text-right">{m.hit_rate_pct}%</TableCell>
                    <TableCell className="text-right">{fmtNum(m.cache_read_tokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Thinking Ratio ──────────────────────────────────────────────

const thinkConfig = {
  thinking_tokens: { label: "Thinking", color: "var(--chart-4)" },
  output_tokens: { label: "Output", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function ThinkingRatio({ data }: { data: ThinkingEntry[] }) {
  const top = data.slice(0, 8).map((d) => ({
    ...d,
    model: d.model.replace(/-\d{8}$/, "").slice(0, 22),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Thinking vs Output Tokens</CardTitle>
        <CardDescription>How much each model "thinks" before responding</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={thinkConfig} className="h-[250px] w-full">
          <BarChart data={top} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
            <CartesianGrid horizontal={false} />
            <YAxis dataKey="model" type="category" width={140} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <XAxis type="number" tickFormatter={fmtNum} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="output_tokens" fill="var(--color-output_tokens)" stackId="t" radius={[0, 0, 0, 0]} />
            <Bar dataKey="thinking_tokens" fill="var(--color-thinking_tokens)" stackId="t" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ── Tool Chains + File Types ────────────────────────────────────

export function Toolchains({ data }: { data: ToolchainsData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tool Call Chains</CardTitle>
          <CardDescription>Most common consecutive tool call pairs</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Chain</TableHead><TableHead className="text-right">Count</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.top_chains.slice(0, 12).map((c) => (
                <TableRow key={c.chain}>
                  <TableCell className="font-mono text-xs">{c.chain}</TableCell>
                  <TableCell className="text-right">{c.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">File Types</CardTitle>
          <CardDescription>Most frequently touched file extensions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div className="w-[200px] h-[240px]">
              <PieChart width={200} height={240}>
                <Pie data={data.file_types.slice(0, 8)} dataKey="count" nameKey="extension" cx="50%" cy="40%" outerRadius={65}>
                  {data.file_types.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend
                  formatter={(value: string) => `.${value}`}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ext</TableHead><TableHead className="text-right">Count</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.file_types.slice(0, 10).map((f) => (
                  <TableRow key={f.extension}>
                    <TableCell className="font-mono">.{f.extension}</TableCell>
                    <TableCell className="text-right">{f.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Model Switches ──────────────────────────────────────────────

export function ModelSwitches({ data }: { data: ModelSwitchData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Model Switches</CardTitle>
        <CardDescription>
          {data.sessions_with_switch} of {data.total_sessions} sessions ({data.switch_rate_pct}%) switched models mid-conversation
        </CardDescription>
      </CardHeader>
      {data.top_switches.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Switch</TableHead><TableHead className="text-right">Count</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.top_switches.slice(0, 8).map((s) => (
                <TableRow key={s.switch}>
                  <TableCell className="font-mono text-xs">{s.switch}</TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

// ── Languages + Task Types ──────────────────────────────────────

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

export function Languages({ data }: { data: LanguagesData }) {
  const tasks = data.task_types.slice(0, 10);

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
                <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i] }} />
                <span className="text-sm font-medium">{l.language}</span>
                <span className="text-sm text-muted-foreground">{l.sessions}</span>
              </div>
            ))}
          </div>
          {data.languages.length >= 2 && (
            <div className="h-3 bg-muted rounded-full mt-3 overflow-hidden flex">
              {data.languages.map((l, i) => {
                const total = data.languages.reduce((a, b) => a + b.sessions, 0);
                return <div key={l.language} className="h-full" style={{ width: `${(l.sessions / total) * 100}%`, background: COLORS[i] }} />;
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task Types</CardTitle>
          <CardDescription>Classified from first user message</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={taskConfig} className="h-[250px] w-full">
            <BarChart data={tasks} layout="vertical" accessibilityLayer margin={{ left: 0 }}>
              <CartesianGrid horizontal={false} />
              <YAxis type="category" dataKey="task" hide />
              <XAxis type="number" scale="log" domain={[1, "auto"]} tickLine={false} axisLine={false} />
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
                  <Cell key={t.task} fill={TASK_COLORS[t.task] || COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Session Complexity by Hour ──────────────────────────────────

const complexityConfig = {
  avg_messages_per_session: { label: "Avg Messages", color: "var(--chart-1)" },
  sessions: { label: "Sessions", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function SessionComplexity({ data }: { data: SessionComplexityEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Session Complexity by Hour</CardTitle>
        <CardDescription>Average messages per session at each hour of day</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={complexityConfig} className="h-[250px] w-full">
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="hour" tickLine={false} axisLine={false} tickFormatter={(h: number) => `${h}:00`} tick={{ fontSize: 10 }} />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="avg_messages_per_session" fill="var(--color-avg_messages_per_session)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
