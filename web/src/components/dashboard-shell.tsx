import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  Gauge,
  LayoutPanelTop,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fmtNum,
  fmtUsd,
} from "@/lib/formatters";
import { TOOL_NAMES, type Tool, toolLabel } from "@/lib/tools";
import type {
  CostData,
  Summary,
} from "@/types";

export type TrendWindow =
  | "24h"
  | "7day"
  | "14day"
  | "30day"
  | "90day"
  | "half-year"
  | "full-year"
  | "all";
export type ToolLens = "all" | Tool;

interface DashboardHeaderProps {
  summary: Summary | null;
  cost: CostData | null;
  toolCounts: Record<Tool, number> | null;
  trendWindow: TrendWindow;
  onTrendWindowChange: (value: TrendWindow) => void;
  toolLens: ToolLens;
  onToolLensChange: (value: ToolLens) => void;
}

interface DashboardSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  highlights?: { label: string; value: string }[];
  children: ReactNode;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function fmtMillions(n: number): string {
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function ToolbarGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={value === option.value ? "default" : "outline"}
            className={value === option.value ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function DashboardHeader({
  summary,
  cost,
  toolCounts,
  trendWindow,
  onTrendWindowChange,
  toolLens,
  onToolLensChange,
}: DashboardHeaderProps) {
  const windowInputTokens = summary
    ? summary.daily.reduce((sum, entry) => sum + entry.input_tokens, 0)
    : 0;
  const windowOutputTokens = summary
    ? summary.daily.reduce((sum, entry) => sum + entry.output_tokens, 0)
    : 0;
  const totalTokens = windowInputTokens + windowOutputTokens;
  const activeDays = summary?.daily.length ?? 0;
  const windowSessions = summary
    ? summary.daily.reduce((sum, entry) => sum + entry.sessions, 0)
    : 0;
  const windowMessages = summary
    ? summary.daily.reduce((sum, entry) => sum + entry.messages, 0)
    : 0;
  const avgSessionsPerDay = safeDivide(windowSessions, activeDays);
  const windowCost = cost
    ? cost.daily.reduce((sum, entry) => sum + entry.equivalent_api_cost_usd, 0)
    : 0;
  const avgCostPerActiveDay = safeDivide(windowCost, activeDays);

  const pulse = [
    {
      label: "Equivalent Cost",
      value: cost ? fmtUsd(windowCost) : "N/A",
      detail:
        avgCostPerActiveDay !== null
          ? `${fmtUsd(avgCostPerActiveDay)} avg per active day`
          : "No active-day coverage",
      icon: Sparkles,
    },
    {
      label: "Sessions",
      value: summary ? fmtNum(windowSessions) : "N/A",
      detail:
        avgSessionsPerDay !== null
          ? `${avgSessionsPerDay.toFixed(1)} sessions per active day`
          : "Waiting for session coverage",
      icon: Activity,
    },
    {
      label: "Messages",
      value: summary ? fmtNum(windowMessages) : "N/A",
      detail: summary
        ? `${activeDays} active days in the selected window`
        : "Message totals unavailable",
      icon: Bot,
    },
    {
      label: "Total Tokens",
      value: summary ? fmtMillions(totalTokens) : "N/A",
      detail: summary
        ? `${fmtMillions(windowInputTokens)} input / ${fmtMillions(windowOutputTokens)} output`
        : "Token totals unavailable",
      icon: Gauge,
    },
  ];

  return (
    <Card className="border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm">
      <CardHeader className="gap-5">
        <div className="flex flex-col gap-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <CardTitle className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950">
                Agent Usage Dashboard
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
                Cost, throughput, runtime behavior, and workspace concentration
                for coding agents across Claude, Gemini, Codex, and Kimi.
              </CardDescription>
            </div>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {pulse.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.label}
                      </span>
                      <Icon className="size-4 text-sky-700" />
                    </div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                      {item.value}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <LayoutPanelTop className="size-4" />
            Dashboard Filters
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <ToolbarGroup
              label="Trend Window"
              value={trendWindow}
              onChange={onTrendWindowChange}
              options={[
                { value: "24h", label: "24H" },
                { value: "7day", label: "7D" },
                { value: "14day", label: "14D" },
                { value: "30day", label: "30D" },
                { value: "90day", label: "90D" },
                { value: "half-year", label: "Half-Year" },
                { value: "full-year", label: "Full-Year" },
                { value: "all", label: "All" },
              ]}
            />
            <ToolbarGroup
              label="Tool Lens"
              value={toolLens}
              onChange={onToolLensChange}
              options={[
                { value: "all", label: "All" },
                ...TOOL_NAMES.map((tool) => ({
                  value: tool,
                  label:
                    trendWindow === "all"
                      ? `${toolLabel(tool)} (${fmtNum(toolCounts?.[tool] ?? 0)})`
                      : toolLabel(tool),
                })),
              ]}
            />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            Trend window updates time-based charts and summaries. Tool lens only
            narrows tool-comparison views where the dataset supports per-tool
            splits. Tool session counts are shown only in the all-time view.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardSection({
  id,
  eyebrow,
  title,
  description,
  highlights,
  children,
}: DashboardSectionProps) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
            {eyebrow}
          </p>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="max-w-2xl text-[13px] leading-5 text-slate-600">
              {description}
            </p>
          </div>
        </div>

        {highlights && highlights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {highlights.map((highlight) => (
              <Badge
                key={highlight.label}
                variant="outline"
                className="rounded-full border-slate-300 bg-white/80 px-3 py-1 text-xs text-slate-700"
              >
                <span className="mr-1 text-slate-500">{highlight.label}</span>
                <span className="font-semibold text-slate-900">
                  {highlight.value}
                </span>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}
