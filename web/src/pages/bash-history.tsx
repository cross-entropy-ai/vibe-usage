import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChartScaleToggle } from "@/components/chart-scale-toggle";
import { InfoDialog } from "@/components/info-dialog";
import { fmtNum } from "@/lib/formatters";
import { TOOL_NAMES, type Tool, toolBadgeClass, toolLabel } from "@/lib/tools";
import type { ScaleMode } from "@/lib/contexts";

interface BashEntry {
  timestamp: string;
  tool: string;
  session_id: string;
  project: string | null;
  cwd: string | null;
  command: string;
  description: string | null;
  status: string | null;
}

interface BashHistoryResponse {
  total: number;
  offset: number;
  count: number;
  entries: BashEntry[];
}

interface BashStatsResponse {
  total: number;
  features: Record<string, number>;
  top_programs: { name: string; count: number }[];
  complexity: number[];
  by_project: ProjectComplexity[];
  categories: Record<string, number>;
  timeseries: { date: string; count: number }[];
  hourly: number[];
  session_density: {
    histogram: number[];
    top_sessions: {
      session_id: string;
      tool: string;
      project: string | null;
      bash_count: number;
      start_time: string;
    }[];
  };
  dangerous: {
    timestamp: string;
    tool: string;
    project: string | null;
    session_id: string;
    command: string;
    patterns: string[];
  }[];
  dangerous_summary: { name: string; count: number }[];
  chains: { from: string; to: string; count: number; probability: number }[];
  chain_node_counts: { name: string; count: number }[];
}

const DENSITY_LABELS = ["1", "2–5", "6–20", "21–50", "51–100", "100+"];

const CATEGORY_META: { key: string; label: string; desc: string; color: string }[] = [
  { key: "read", label: "Read-only", desc: "ls, cat, grep, git log…", color: "#0ea5e9" },
  { key: "mutate", label: "Mutate", desc: "rm, mv, git commit, npm install…", color: "#ef4444" },
  { key: "exec", label: "Exec", desc: "python, node, bash, docker run…", color: "#a855f7" },
  { key: "network", label: "Network", desc: "curl, ssh, scp…", color: "#14b8a6" },
  { key: "other", label: "Other", desc: "unclassified", color: "#94a3b8" },
];

interface ProjectComplexity {
  name: string;
  commands: number;
  total_complexity: number;
  complexity: number[];
}

type ProjectSortKey = "commands" | "total_complexity";

const COMPLEXITY_META: { label: string; sub: string; tone: string; color: string }[] = [
  { label: "0", sub: "single command", tone: "bg-slate-400", color: "#94a3b8" },
  { label: "1", sub: "one operator", tone: "bg-sky-400", color: "#38bdf8" },
  { label: "2", sub: "two operators", tone: "bg-sky-500", color: "#0ea5e9" },
  { label: "3", sub: "three operators", tone: "bg-indigo-500", color: "#6366f1" },
  { label: "4", sub: "four operators", tone: "bg-violet-500", color: "#8b5cf6" },
  { label: "5+", sub: "heavy pipeline", tone: "bg-fuchsia-600", color: "#c026d3" },
];

const FEATURE_META: { key: string; label: string; desc: string }[] = [
  { key: "pipe", label: "|  Pipe", desc: "stdout → stdin" },
  { key: "and", label: "&&  AND", desc: "run if previous succeeds" },
  { key: "or", label: "||  OR", desc: "run if previous fails" },
  { key: "seq", label: ";  Seq", desc: "run regardless" },
  { key: "stderr_merge", label: "2>&1", desc: "merge stderr → stdout" },
  { key: "stderr_file", label: "2> file", desc: "stderr to file" },
  { key: "stdout_file", label: "> file", desc: "stdout to file" },
  { key: "append", label: ">> file", desc: "append to file" },
  { key: "cmd_subst", label: "$( ) / ` `", desc: "command substitution" },
  { key: "proc_subst", label: "<( ) / >( )", desc: "process substitution" },
  { key: "heredoc", label: "<< heredoc", desc: "inline document" },
  { key: "herestring", label: "<<< herestring", desc: "inline string" },
  { key: "subshell", label: "( ) subshell", desc: "group in subshell" },
  { key: "background", label: "& background", desc: "run in background" },
  { key: "control_flow", label: "for / while / if", desc: "control flow" },
  { key: "multiline", label: "Multi-line", desc: "contains newlines" },
];

const TREND_WINDOWS = ["7day", "30day", "90day", "half-year", "full-year", "all"] as const;
type TrendWindow = (typeof TREND_WINDOWS)[number];

const TOOL_LENS_VALUES = ["all", ...TOOL_NAMES] as const;
type ToolLens = (typeof TOOL_LENS_VALUES)[number];

const PAGE_SIZE = 100;

function trendWindowToDateRange(window: TrendWindow): { from?: string; to?: string } {
  if (window === "all") return {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = fmt(today);
  const cutoff = new Date(today);
  if (window === "half-year") cutoff.setMonth(cutoff.getMonth() - 6);
  else if (window === "full-year") cutoff.setFullYear(cutoff.getFullYear() - 1);
  else {
    const days = window === "7day" ? 7 : window === "30day" ? 30 : 90;
    cutoff.setDate(cutoff.getDate() - (days - 1));
  }
  return { from: fmt(cutoff), to };
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function Toolbar({
  trendWindow,
  onTrendWindowChange,
  toolLens,
  onToolLensChange,
  search,
  onSearchChange,
}: {
  trendWindow: TrendWindow;
  onTrendWindowChange: (w: TrendWindow) => void;
  toolLens: ToolLens;
  onToolLensChange: (t: ToolLens) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Trend Window
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TREND_WINDOWS.map((w) => (
              <Button
                key={w}
                type="button"
                size="xs"
                variant={trendWindow === w ? "default" : "outline"}
                className={trendWindow === w ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                onClick={() => onTrendWindowChange(w)}
              >
                {w === "7day" ? "7D" : w === "30day" ? "30D" : w === "90day" ? "90D" : w === "half-year" ? "Half-Year" : w === "full-year" ? "Full-Year" : "All"}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Tool
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TOOL_LENS_VALUES.map((t) => (
              <Button
                key={t}
                type="button"
                size="xs"
                variant={toolLens === t ? "default" : "outline"}
                className={toolLens === t ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                onClick={() => onToolLensChange(t)}
              >
                {t === "all" ? "All" : toolLabel(t as Tool)}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Search
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter by command or description..."
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>
    </div>
  );
}

function ProjectComplexityPanel({ stats }: { stats: BashStatsResponse }) {
  const [sortKey, setSortKey] = useState<ProjectSortKey>("commands");
  const [hideUnknown, setHideUnknown] = useState(true);
  const projects = stats.by_project ?? [];
  if (projects.length === 0) return null;

  const filtered = hideUnknown ? projects.filter((p) => p.name !== "(unknown)") : projects;
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "commands") return b.commands - a.commands;
    return b.total_complexity - a.total_complexity;
  });

  if (sorted.length === 0) return null;

  const maxCmd = Math.max(1, ...sorted.map((p) => p.commands));
  const maxTotal = Math.max(1, ...sorted.map((p) => p.total_complexity));
  // Log-scale the width since values span many orders of magnitude.
  const logTotalMax = Math.log10(maxTotal + 1);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Projects by Complexity</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 select-none">
              <input
                type="checkbox"
                checked={hideUnknown}
                onChange={(e) => setHideUnknown(e.target.checked)}
                className="size-3.5 rounded border-slate-300"
              />
              Hide unknown project
            </label>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="xs"
                variant={sortKey === "commands" ? "default" : "outline"}
                className={sortKey === "commands" ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                onClick={() => setSortKey("commands")}
              >
                By volume
              </Button>
              <Button
                type="button"
                size="xs"
                variant={sortKey === "total_complexity" ? "default" : "outline"}
                className={sortKey === "total_complexity" ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                onClick={() => setSortKey("total_complexity")}
              >
                By total complexity
              </Button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-1.5 pr-3 text-left font-medium align-bottom">Project</th>
                <th className="py-1.5 pr-3 text-right font-medium align-bottom">Commands</th>
                <th className="py-1.5 pr-3 text-right font-medium align-bottom">
                  <div className="flex flex-col items-end gap-0.5">
                    <span>Total complexity</span>
                    <span className="font-mono text-[9px] normal-case tracking-normal text-slate-400">
                      Σ count<sub>i</sub> × 10<sup>i</sup>
                    </span>
                  </div>
                </th>
                <th className="py-1.5 text-left font-medium align-bottom">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const cmdW = (p.commands / maxCmd) * 100;
                const totalW = (Math.log10(p.total_complexity + 1) / logTotalMax) * 100;
                const total = p.commands || 1;
                return (
                  <tr key={p.name} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 font-mono text-slate-800">{p.name}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
                      <div className="flex items-center justify-end gap-2">
                        <div className="relative h-2 w-20 overflow-hidden rounded bg-slate-100">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-emerald-500/60"
                            style={{ width: `${cmdW}%` }}
                          />
                        </div>
                        <span className="w-12 text-right">{fmtNum(p.commands)}</span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">
                      <div className="flex items-center justify-end gap-2">
                        <div className="relative h-2 w-20 overflow-hidden rounded bg-slate-100">
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-fuchsia-500/60"
                            style={{ width: `${totalW}%` }}
                          />
                        </div>
                        <span className="w-16 text-right">{fmtNum(p.total_complexity)}</span>
                      </div>
                    </td>
                    <td className="py-1.5">
                      <div className="flex h-2 w-full max-w-[260px] overflow-hidden rounded bg-slate-50">
                        {p.complexity.map((c, i) => {
                          const segW = (c / total) * 100;
                          if (segW <= 0) return null;
                          return (
                            <div
                              key={i}
                              className={COMPLEXITY_META[i].tone}
                              style={{ width: `${segW}%` }}
                              title={`${COMPLEXITY_META[i].label} feature(s): ${fmtNum(c)} (${((c / total) * 100).toFixed(1)}%)`}
                            />
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <span>Legend:</span>
          {COMPLEXITY_META.map((meta) => (
            <span key={meta.label} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded ${meta.tone}`} />
              <span>{meta.label}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoriesPanel({ stats }: { stats: BashStatsResponse }) {
  const total = stats.total;
  const cats = stats.categories ?? {};
  const data = CATEGORY_META.map((meta) => ({
    ...meta,
    count: cats[meta.key] ?? 0,
    pct: total > 0 ? ((cats[meta.key] ?? 0) / total) * 100 : 0,
  }));
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Behavior</h2>
          <span className="text-xs text-slate-500">dominant category per command</span>
        </div>
        {/* Stack bar showing all categories proportionally */}
        <div className="mb-4 flex h-3 w-full overflow-hidden rounded bg-slate-50">
          {data.map((d) => {
            const w = (d.count / Math.max(1, total)) * 100;
            if (w <= 0) return null;
            return (
              <div
                key={d.key}
                style={{ width: `${w}%`, background: d.color }}
                title={`${d.label}: ${fmtNum(d.count)} (${d.pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
        <div className="space-y-1.5">
          {data.map((d) => {
            const w = (d.count / maxCount) * 100;
            return (
              <div key={d.key} className="flex items-center gap-2 text-xs">
                <div className="flex w-32 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded" style={{ background: d.color }} />
                  <span className="font-medium text-slate-800">{d.label}</span>
                </div>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ width: `${w}%`, background: d.color, opacity: 0.6 }}
                  />
                </div>
                <span className="w-16 text-right tabular-nums text-slate-700">{fmtNum(d.count)}</span>
                <span className="w-12 text-right text-slate-500">{d.pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-4 text-slate-500">
          Compound commands use their highest-impact segment: mutate &gt; exec &gt; network &gt; read.
        </p>
      </CardContent>
    </Card>
  );
}

function ComplexityPanel({ stats }: { stats: BashStatsResponse }) {
  const [scaleMode, setScaleMode] = useState<ScaleMode>("log");
  const total = stats.total;
  const complexity = stats.complexity ?? [];
  const isLog = scaleMode === "log";

  const data = COMPLEXITY_META.map((meta, i) => {
    const count = complexity[i] ?? 0;
    return {
      bucket: meta.label,
      sub: meta.sub,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      color: meta.color,
    };
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Complexity</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">features per command</span>
            <ChartScaleToggle
              scale={scaleMode}
              onToggle={() => setScaleMode(scaleMode === "log" ? "linear" : "log")}
            />
          </div>
        </div>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#475569" }}
              />
              <YAxis
                scale={scaleMode}
                domain={isLog ? [1, "auto"] : [0, "auto"]}
                allowDataOverflow={isLog}
                tickFormatter={(v: number) => fmtNum(v)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#64748b" }}
                width={50}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                contentStyle={{
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                formatter={((value: unknown, _name: unknown, item: unknown) => {
                  const payload = (item as { payload?: { pct?: number; sub?: string } } | undefined)?.payload;
                  return [
                    `${fmtNum(Number(value))} (${(payload?.pct ?? 0).toFixed(1)}%)`,
                    payload?.sub ?? "",
                  ];
                }) as never}
                labelFormatter={((label: unknown) => `${String(label)} feature(s)`) as never}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.bucket} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          {data.map((d) => (
            <span key={d.bucket} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded" style={{ background: d.color }} />
              <span className="font-mono">{d.bucket}</span>
              <span>{d.sub}</span>
              <span className="tabular-nums text-slate-700">{fmtNum(d.count)}</span>
              <span>({d.pct.toFixed(1)}%)</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatsPanel({ stats }: { stats: BashStatsResponse | null }) {
  if (!stats || stats.total === 0) return null;
  const maxProg = stats.top_programs[0]?.count ?? 1;
  const topPrograms = stats.top_programs.slice(0, 20);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Command Structure</h2>
            <span className="text-xs text-slate-500">{fmtNum(stats.total)} commands analyzed</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {FEATURE_META.map((f) => {
              const count = stats.features[f.key] ?? 0;
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div
                  key={f.key}
                  className="rounded-md border border-slate-200 bg-white p-2.5"
                  title={f.desc}
                >
                  <div className="font-mono text-[11px] text-slate-700">{f.label}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-lg font-semibold text-slate-950 tabular-nums">{fmtNum(count)}</span>
                    <span className="text-[10px] text-slate-500">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Top Programs</h2>
            <span className="text-xs text-slate-500">by invocation count</span>
          </div>
          <div className="space-y-1.5">
            {topPrograms.map((p) => {
              const w = (p.count / maxProg) * 100;
              return (
                <div key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate font-mono text-slate-800">{p.name}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-emerald-500/70"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums text-slate-700">{fmtNum(p.count)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimeseriesPanel({ stats }: { stats: BashStatsResponse }) {
  const [scaleMode, setScaleMode] = useState<ScaleMode>("linear");
  const isLog = scaleMode === "log";
  const ts = stats.timeseries ?? [];
  const hourly = stats.hourly ?? [];
  if (ts.length === 0) return null;

  const hourData = hourly.map((count, hour) => ({ hour: `${hour}`, count }));
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const nightSum = [0, 1, 2, 3, 4, 5, 22, 23].reduce((s, h) => s + (hourly[h] ?? 0), 0);
  const nightPct = stats.total > 0 ? (nightSum / stats.total) * 100 : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Activity over time</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              peak hour {peakHour}:00 · night (22–05) {nightPct.toFixed(1)}%
            </span>
            <ChartScaleToggle
              scale={scaleMode}
              onToggle={() => setScaleMode(scaleMode === "log" ? "linear" : "log")}
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="flex h-[180px] flex-col">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">By day</p>
            <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ts} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  minTickGap={20}
                />
                <YAxis
                  scale={scaleMode}
                  domain={isLog ? [1, "auto"] : [0, "auto"]}
                  allowDataOverflow={isLog}
                  tickFormatter={(v: number) => fmtNum(v)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                  contentStyle={{ borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={((value: unknown) => fmtNum(Number(value))) as never}
                />
                <Bar dataKey="count" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
          <div className="flex h-[180px] flex-col">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">By hour of day</p>
            <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="hour"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={2}
                />
                <YAxis hide scale={scaleMode} domain={isLog ? [1, "auto"] : [0, "auto"]} allowDataOverflow={isLog} />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                  contentStyle={{ borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={((value: unknown) => fmtNum(Number(value))) as never}
                  labelFormatter={((label: unknown) => `${String(label)}:00`) as never}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionDensityHistogramPanel({ stats }: { stats: BashStatsResponse }) {
  const sd = stats.session_density;
  if (!sd || sd.histogram.length === 0) return null;
  const totalSessions = sd.histogram.reduce((s, n) => s + n, 0);
  if (totalSessions === 0) return null;

  const data = sd.histogram.map((count, i) => ({
    bucket: DENSITY_LABELS[i],
    count,
    pct: (count / totalSessions) * 100,
  }));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Session density</h2>
          <span className="text-xs text-slate-500">{fmtNum(totalSessions)} sessions · bash calls per session</span>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#475569" }}
              />
              <YAxis
                tickFormatter={(v: number) => fmtNum(v)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#64748b" }}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                contentStyle={{ borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={((value: unknown, _name: unknown, item: unknown) => {
                  const p = (item as { payload?: { pct?: number } } | undefined)?.payload;
                  return [`${fmtNum(Number(value))} (${(p?.pct ?? 0).toFixed(1)}%)`, "sessions"];
                }) as never}
                labelFormatter={((label: unknown) => `${String(label)} bash calls`) as never}
              />
              <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function TopSessionsPanel({ stats }: { stats: BashStatsResponse }) {
  const sd = stats.session_density;
  if (!sd || sd.top_sessions.length === 0) return null;
  const maxBash = Math.max(1, ...sd.top_sessions.map((s) => s.bash_count));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Top bash-heavy sessions</h2>
          <span className="text-xs text-slate-500">Top {sd.top_sessions.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-1.5 pr-3 text-left font-medium">Started</th>
                <th className="py-1.5 pr-3 text-left font-medium">Tool</th>
                <th className="py-1.5 pr-3 text-left font-medium">Project</th>
                <th className="py-1.5 text-right font-medium">Bash</th>
              </tr>
            </thead>
            <tbody>
              {sd.top_sessions.map((s) => (
                <tr key={s.session_id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-700">{fmtTimestamp(s.start_time)}</td>
                  <td className="py-1.5 pr-3">
                    <Badge variant="secondary" className={`${toolBadgeClass(s.tool as Tool)} text-[10px]`}>
                      {toolLabel(s.tool as Tool)}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-700">
                    {s.project ?? "(unknown)"}
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <div className="relative h-2 w-24 overflow-hidden rounded bg-slate-100">
                        <div
                          className="absolute inset-y-0 left-0 rounded bg-fuchsia-500/60"
                          style={{ width: `${(s.bash_count / maxBash) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right tabular-nums text-slate-700">{fmtNum(s.bash_count)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DangerousPanel({ stats }: { stats: BashStatsResponse }) {
  const [expanded, setExpanded] = useState(false);
  const list = stats.dangerous ?? [];
  const summary = stats.dangerous_summary ?? [];
  if (list.length === 0 && summary.length === 0) return null;
  const visible = expanded ? list : list.slice(0, 15);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Dangerous actions</h2>
          <span className="text-xs text-slate-500">
            {fmtNum(list.length)} flagged · most recent first
          </span>
        </div>
        {summary.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {summary.map((s) => (
              <span
                key={s.name}
                className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
              >
                <span className="font-mono">{s.name}</span>
                <span className="ml-1 tabular-nums text-red-500">×{fmtNum(s.count)}</span>
              </span>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {visible.map((d, i) => (
            <div key={`${d.session_id}-${d.timestamp}-${i}`} className="rounded border border-red-100 bg-red-50/40 p-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="font-mono">{fmtTimestamp(d.timestamp)}</span>
                <Badge variant="secondary" className={`${toolBadgeClass(d.tool as Tool)} text-[10px]`}>
                  {toolLabel(d.tool as Tool)}
                </Badge>
                {d.project && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                    {d.project}
                  </span>
                )}
                {d.patterns.map((p) => (
                  <span key={p} className="rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                    {p}
                  </span>
                ))}
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-slate-950 p-1.5 font-mono text-[11px] text-slate-100">
                {d.command}
              </pre>
            </div>
          ))}
        </div>
        {list.length > 15 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 text-xs font-medium text-sky-700 hover:text-sky-900"
          >
            {expanded ? `Show top 15` : `Show all ${fmtNum(list.length)}`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

interface SimNode {
  id: string;
  count: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pinned: boolean;
}

interface SimEdge {
  from: string;
  to: string;
  count: number;
  probability: number;
}

function clientToSvg(svg: SVGSVGElement | null, x: number, y: number): { x: number; y: number } {
  if (!svg) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  const m = svg.getScreenCTM();
  if (!m) return { x, y };
  const r = pt.matrixTransform(m.inverse());
  return { x: r.x, y: r.y };
}

interface ChainsGraphHandle {
  releaseAll: () => void;
}

function ChainsGraph({
  chains,
  nodeCounts,
  hideSelfLoops,
  nodeLimit,
  graphHandleRef,
}: {
  chains: BashStatsResponse["chains"];
  nodeCounts: BashStatsResponse["chain_node_counts"];
  hideSelfLoops: boolean;
  nodeLimit: number;
  graphHandleRef?: React.MutableRefObject<ChainsGraphHandle | null>;
}) {
  const width = 1000;
  const height = 620;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const nodeByIdRef = useRef<Map<string, SimNode>>(new Map());
  const alphaRef = useRef(1);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const [, forceRerender] = useReducer((x: number) => x + 1, 0);

  // Stable key so we only re-initialize when the input data actually changes.
  const dataKey = useMemo(
    () =>
      chains
        .filter((c) => !hideSelfLoops || c.from !== c.to)
        .map((c) => `${c.from}|${c.to}|${c.count}`)
        .join(","),
    [chains, hideSelfLoops],
  );

  useEffect(() => {
    const filtered = hideSelfLoops ? chains.filter((c) => c.from !== c.to) : chains;

    // Pick the top-N most-invoked verbs that also appear in chain data.
    const usedVerbs = new Set<string>();
    for (const c of filtered) {
      usedVerbs.add(c.from);
      usedVerbs.add(c.to);
    }
    const top = nodeCounts
      .filter((nc) => usedVerbs.has(nc.name))
      .slice(0, nodeLimit);
    const nodeSet = new Set(top.map((nc) => nc.name));
    const maxCount = top[0]?.count ?? 1;
    const minCount = top[top.length - 1]?.count ?? 1;
    const NODE_R_MIN = 10;
    const NODE_R_MAX = 32;
    const logMax = Math.log10(maxCount + 1);
    const logMin = Math.log10(minCount + 1);

    const nodes: SimNode[] = top.map(({ name, count }, i) => {
      const angle = (i / Math.max(1, top.length)) * Math.PI * 2;
      const ringR = Math.min(width, height) / 2.8;
      const t =
        logMax > logMin
          ? (Math.log10(count + 1) - logMin) / (logMax - logMin)
          : 1;
      return {
        id: name,
        count,
        x: width / 2 + Math.cos(angle) * ringR,
        y: height / 2 + Math.sin(angle) * ringR,
        vx: 0,
        vy: 0,
        r: NODE_R_MIN + (NODE_R_MAX - NODE_R_MIN) * t,
        pinned: false,
      };
    });
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const edges: SimEdge[] = filtered
      .filter((c) => nodeSet.has(c.from) && nodeSet.has(c.to))
      .map((c) => ({ from: c.from, to: c.to, count: c.count, probability: c.probability }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
    nodeByIdRef.current = nodeById;
    alphaRef.current = 1;
    ensureRunning();
    forceRerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, nodeLimit]);

  const ensureRunning = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const cx = width / 2;
    const cy = height / 2;
    const REPULSION = 9000;
    const IDEAL_LEN = 220;
    const SPRING_K = 0.0008;
    const CENTER_PULL = 0.0006;
    const DAMPING = 0.72;
    const STOP_ALPHA = 0.01;
    const COOL = 0.97;

    const step = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeById = nodeByIdRef.current;
      const alpha = alphaRef.current;

      if (nodes.length > 0) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist2 = dx * dx + dy * dy + 0.01;
            const dist = Math.sqrt(dist2);
            const minDist = a.r + b.r + 18;
            let force = REPULSION / dist2;
            if (dist < minDist) force += (minDist - dist) * 0.6;
            force *= alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
        for (const e of edges) {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b || a === b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const stretch = dist - IDEAL_LEN;
          const weight = Math.log(1 + e.count);
          const k = SPRING_K * weight * alpha;
          const fx = (dx / dist) * stretch * k;
          const fy = (dy / dist) * stretch * k;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
        for (const n of nodes) {
          n.vx += (cx - n.x) * CENTER_PULL * alpha;
          n.vy += (cy - n.y) * CENTER_PULL * alpha;
        }
        for (const n of nodes) {
          if (n.pinned) {
            n.vx = 0;
            n.vy = 0;
            continue;
          }
          n.vx *= DAMPING;
          n.vy *= DAMPING;
          n.x += n.vx;
          n.y += n.vy;
          const labelHalfW = (n.id.length * 6.5) / 2 + 6;
          const sidePad = Math.max(n.r + 8, labelHalfW);
          const topPad = n.r + 8;
          const bottomPad = n.r + 24;
          n.x = Math.max(sidePad, Math.min(width - sidePad, n.x));
          n.y = Math.max(topPad, Math.min(height - bottomPad, n.y));
        }
        alphaRef.current = alpha * COOL;
      }

      forceRerender();

      // Stop once cooled and no one is dragging. Released nodes stay where the
      // user dropped them (we keep them pinned), so the layout truly settles.
      if (alphaRef.current < STOP_ALPHA && dragRef.current === null) {
        runningRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const node = nodeByIdRef.current.get(id);
    if (!node) return;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    dragRef.current = { id, dx: node.x - pt.x, dy: node.y - pt.y };
    node.pinned = true;
    alphaRef.current = Math.max(alphaRef.current, 0.4);
    ensureRunning();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const node = nodeByIdRef.current.get(dragRef.current.id);
    if (!node) return;
    const pt = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const labelHalfW = (node.id.length * 6.5) / 2 + 6;
    const sidePad = Math.max(node.r + 8, labelHalfW);
    const topPad = node.r + 8;
    const bottomPad = node.r + 24;
    node.x = Math.max(sidePad, Math.min(width - sidePad, pt.x + dragRef.current.dx));
    node.y = Math.max(topPad, Math.min(height - bottomPad, pt.y + dragRef.current.dy));
    alphaRef.current = Math.max(alphaRef.current, 0.4);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // Keep the released node pinned where the user dropped it. Double-click
    // to release. This prevents the annoying "still drifting" feeling.
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    // Let the rest of the network adjust briefly, then settle.
    alphaRef.current = Math.max(alphaRef.current, 0.2);
    ensureRunning();
  };

  const onDoubleClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const node = nodeByIdRef.current.get(id);
    if (!node) return;
    node.pinned = false;
    alphaRef.current = Math.max(alphaRef.current, 0.4);
    ensureRunning();
  };

  const releaseAll = useCallback(() => {
    for (const n of nodesRef.current) n.pinned = false;
    alphaRef.current = 1;
    ensureRunning();
  }, [ensureRunning]);

  useEffect(() => {
    if (graphHandleRef) {
      graphHandleRef.current = { releaseAll };
    }
    return () => {
      if (graphHandleRef) graphHandleRef.current = null;
    };
  }, [graphHandleRef, releaseAll]);

  const nodes = nodesRef.current;
  const edges = edgesRef.current;
  if (nodes.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-slate-500">
        No chains to graph.
      </div>
    );
  }

  // Detect mutual pairs (A→B and B→A both exist) so we can curve them apart.
  const edgeKeys = new Set(edges.map((e) => `${e.from}|${e.to}`));
  const isMutual = (from: string, to: string) => edgeKeys.has(`${to}|${from}`);
  const maxProb = Math.max(0.0001, ...edges.map((e) => e.probability));

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full select-none touch-none"
      style={{ maxHeight: 640 }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        <marker
          id="chain-arrow"
          viewBox="0 -5 10 10"
          refX="9"
          refY="0"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0,-5L10,0L0,5" fill="#64748b" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = nodeByIdRef.current.get(e.from);
        const b = nodeByIdRef.current.get(e.to);
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const sx = a.x + ux * a.r;
        const sy = a.y + uy * a.r;
        const tx = b.x - ux * (b.r + 2);
        const ty = b.y - uy * (b.r + 2);
        // Thickness now driven by P(to|from). Use sqrt to keep small ones visible.
        const w = 0.6 + Math.sqrt(e.probability / maxProb) * 6;
        const opacity = 0.3 + (e.probability / maxProb) * 0.5;

        const mutual = isMutual(e.from, e.to);
        let pathD: string;
        if (mutual) {
          // Curve perpendicular to the line; sign depends on direction so the
          // two halves of the pair bow outward.
          const midX = (sx + tx) / 2;
          const midY = (sy + ty) / 2;
          const sign = e.from < e.to ? 1 : -1;
          const offset = Math.max(18, dist * 0.18) * sign;
          const cx = midX + -uy * offset;
          const cy = midY + ux * offset;
          pathD = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
        } else {
          pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
        }

        return (
          <path
            key={`${e.from}-${e.to}-${i}`}
            d={pathD}
            stroke="#64748b"
            strokeWidth={w}
            strokeOpacity={opacity}
            fill="none"
            markerEnd="url(#chain-arrow)"
          >
            <title>{`${e.from} → ${e.to}: P=${(e.probability * 100).toFixed(1)}% (${fmtNum(e.count)} of ${fmtNum(Math.round(e.count / Math.max(e.probability, 0.0001)))})`}</title>
          </path>
        );
      })}
      {nodes.map((n) => {
        const countLabel = fmtNum(n.count);
        // Roughly: each digit ~5.5px at the chosen size. Skip if it would overflow.
        const fontSize = Math.max(9, Math.min(14, Math.round(n.r * 0.62)));
        const fits = countLabel.length * fontSize * 0.58 <= n.r * 2 - 4;
        return (
          <g
            key={n.id}
            style={{ cursor: dragRef.current?.id === n.id ? "grabbing" : "grab" }}
            onPointerDown={(e) => onPointerDown(e, n.id)}
            onDoubleClick={(e) => onDoubleClick(e, n.id)}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.pinned ? "#0369a1" : "#0ea5e9"}
              fillOpacity={n.pinned ? 1 : 0.85}
              stroke="white"
              strokeWidth={2}
            >
              <title>{`${n.id}: ${fmtNum(n.count)} invocations — drag to move, double-click to release`}</title>
            </circle>
            {fits && (
              <text
                x={n.x}
                y={n.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fontSize}
                fontWeight={600}
                fill="white"
                pointerEvents="none"
              >
                {countLabel}
              </text>
            )}
            <text
              x={n.x}
              y={n.y + n.r + 11}
              textAnchor="middle"
              fontSize={11}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill="#1e293b"
              pointerEvents="none"
            >
              {n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const NODE_LIMIT_OPTIONS = [20, 40, 60, 100] as const;

function ChainsPanel({ stats }: { stats: BashStatsResponse }) {
  const [hideSelfLoops, setHideSelfLoops] = useState(true);
  const [view, setView] = useState<"graph" | "table">("graph");
  const [nodeLimit, setNodeLimit] = useState<number>(40);
  const graphHandleRef = useRef<ChainsGraphHandle | null>(null);
  const rawChains = stats.chains ?? [];
  if (rawChains.length === 0) return null;
  const chains = hideSelfLoops ? rawChains.filter((c) => c.from !== c.to) : rawChains;
  const maxProb = Math.max(0.01, ...chains.map((c) => c.probability));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Common command chains</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 select-none">
              <input
                type="checkbox"
                checked={hideSelfLoops}
                onChange={(e) => setHideSelfLoops(e.target.checked)}
                className="size-3.5 rounded border-slate-300"
              />
              Hide self-loops (A → A)
            </label>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="xs"
                variant={view === "graph" ? "default" : "outline"}
                className={view === "graph" ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                onClick={() => setView("graph")}
              >
                Graph
              </Button>
              <Button
                type="button"
                size="xs"
                variant={view === "table" ? "default" : "outline"}
                className={view === "table" ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                onClick={() => setView("table")}
              >
                Table
              </Button>
              {view === "graph" && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="bg-white"
                  onClick={() => graphHandleRef.current?.releaseAll()}
                >
                  Re-layout
                </Button>
              )}
            </div>
            {view === "graph" && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Nodes</span>
                {NODE_LIMIT_OPTIONS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="xs"
                    variant={nodeLimit === n ? "default" : "outline"}
                    className={nodeLimit === n ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                    onClick={() => setNodeLimit(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            )}
            <span className="text-xs text-slate-500">A → B within a session</span>
          </div>
        </div>
        {view === "graph" ? (
          <>
            <ChainsGraph
              chains={rawChains}
              nodeCounts={stats.chain_node_counts ?? []}
              hideSelfLoops={hideSelfLoops}
              nodeLimit={nodeLimit}
              graphHandleRef={graphHandleRef}
            />
            <p className="mt-2 text-[11px] text-slate-500">
              Node size ∝ command occurrence count. Edge thickness ∝ P(to | from). Mutual pairs curve apart.
              Drag to move, double-click a node to release it, or use Re-layout to relax all.
            </p>
          </>
        ) : null}
        {view === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="py-1 pr-3 text-left font-medium">From</th>
                  <th className="py-1 pr-3 text-left font-medium">To</th>
                  <th className="py-1 pr-3 text-right font-medium">Count</th>
                  <th className="py-1 text-left font-medium">P(to | from)</th>
                </tr>
              </thead>
              <tbody>
                {chains.map((c, i) => {
                  const w = (c.probability / maxProb) * 100;
                  return (
                    <tr key={`${c.from}-${c.to}-${i}`} className="border-b border-slate-50">
                      <td className="py-1 pr-3 font-mono text-slate-800">{c.from}</td>
                      <td className="py-1 pr-3 font-mono text-slate-800">→ {c.to}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{fmtNum(c.count)}</td>
                      <td className="py-1">
                        <div className="flex items-center gap-2">
                          <div className="relative h-2 w-28 overflow-hidden rounded bg-slate-100">
                            <div
                              className="absolute inset-y-0 left-0 rounded bg-emerald-500/60"
                              style={{ width: `${w}%` }}
                            />
                          </div>
                          <span className="w-12 text-right tabular-nums text-slate-700">
                            {(c.probability * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EntryRow({ entry }: { entry: BashEntry }) {
  const isBadStatus = entry.status === "error" || entry.status === "failed";
  return (
    <div className="border-b border-slate-100 px-4 py-3 hover:bg-slate-50/60">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-mono">{fmtTimestamp(entry.timestamp)}</span>
        <Badge variant="secondary" className={`${toolBadgeClass(entry.tool as Tool)} text-[10px]`}>
          {toolLabel(entry.tool as Tool)}
        </Badge>
        {entry.project && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            {entry.project}
          </span>
        )}
        {entry.status && (
          <span
            className={
              isBadStatus
                ? "rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                : "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
            }
          >
            {entry.status}
          </span>
        )}
      </div>
      <pre className="mt-1.5 whitespace-pre-wrap break-all rounded bg-slate-950 p-2 font-mono text-[12px] text-slate-100">
        {entry.command}
      </pre>
      {entry.description && (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{entry.description}</p>
      )}
    </div>
  );
}

export default function BashHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const trendWindow = ((TREND_WINDOWS as readonly string[]).includes(searchParams.get("window") ?? "")
    ? searchParams.get("window")
    : "30day") as TrendWindow;
  const toolLens = ((TOOL_LENS_VALUES as readonly string[]).includes(searchParams.get("tool") ?? "")
    ? searchParams.get("tool")
    : "all") as ToolLens;
  const search = searchParams.get("q") ?? "";

  const updateParam = useCallback(
    (key: string, value: string | null, defaultValue?: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === "" || value === defaultValue) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const dateRange = useMemo(() => trendWindowToDateRange(trendWindow), [trendWindow]);
  const debouncedSearch = useDebounced(search, 300);

  const [entries, setEntries] = useState<BashEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<BashStatsResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const statsAbortRef = useRef<AbortController | null>(null);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [trendWindow, toolLens, debouncedSearch]);

  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const params = new URLSearchParams();
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    if (toolLens !== "all") params.set("tool", toolLens);
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));

    setLoading(true);
    setError(null);
    fetch(`/api/bash-history?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BashHistoryResponse>;
      })
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [dateRange.from, dateRange.to, toolLens, debouncedSearch, offset]);

  // Fetch stats (paginate-independent)
  useEffect(() => {
    statsAbortRef.current?.abort();
    const ctrl = new AbortController();
    statsAbortRef.current = ctrl;

    const params = new URLSearchParams();
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    if (toolLens !== "all") params.set("tool", toolLens);
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());

    fetch(`/api/bash-history/stats?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BashStatsResponse>;
      })
      .then(setStats)
      .catch(() => {
        // Silent: stats are supplementary
      });

    return () => ctrl.abort();
  }, [dateRange.from, dateRange.to, toolLens, debouncedSearch]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + entries.length, total);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className="min-h-screen bg-background">
      <div className="relative mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Bash History
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              All shell commands run by coding agents across your sessions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InfoDialog />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        <Toolbar
          trendWindow={trendWindow}
          onTrendWindowChange={(w) => updateParam("window", w, "30day")}
          toolLens={toolLens}
          onToolLensChange={(t) => updateParam("tool", t, "all")}
          search={search}
          onSearchChange={(s) => updateParam("q", s)}
        />

        {stats && stats.total > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ComplexityPanel stats={stats} />
            <CategoriesPanel stats={stats} />
          </div>
        )}
        {stats && stats.total > 0 && <TimeseriesPanel stats={stats} />}
        <StatsPanel stats={stats} />
        {stats && stats.total > 0 && <SessionDensityHistogramPanel stats={stats} />}
        {stats && stats.total > 0 && <TopSessionsPanel stats={stats} />}
        {stats && stats.total > 0 && <ChainsPanel stats={stats} />}
        {stats && stats.total > 0 && <ProjectComplexityPanel stats={stats} />}
        {stats && stats.total > 0 && <DangerousPanel stats={stats} />}

        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            {loading
              ? "Loading…"
              : total === 0
                ? "No commands found"
                : `${fmtNum(pageStart)}–${fmtNum(pageEnd)} of ${fmtNum(total)}`}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!hasPrev || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              ← Prev
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!hasNext || loading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next →
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {entries.length === 0 && !loading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No commands match the current filters.</p>
            ) : (
              entries.map((e, i) => <EntryRow key={`${e.session_id}-${e.timestamp}-${i}`} entry={e} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
