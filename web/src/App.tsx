import { useMemo, useState } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  SummaryProvider,
  CostProvider,
  ActivityProvider,
  TokenProvider,
  ModelsToolsProvider,
  TablesProvider,
  composeProviders,
} from "@/lib/contexts";
import { OverviewSection } from "@/sections/overview-section";
import { CostSection } from "@/sections/cost-section";
import { ActivitySection } from "@/sections/activity-section";
import { TokenInsightsSection } from "@/sections/token-insights-section";
import { ModelsToolsSection } from "@/sections/models-tools-section";
import { TablesSection } from "@/sections/tables-section";
import {
  DashboardHeader,
  DashboardSection,
  type ToolLens,
  type TrendWindow,
} from "@/components/dashboard-shell";
import { fmtNum, fmtUsd } from "@/lib/formatters";
import { TOOL_NAMES, type Tool } from "@/lib/tools";

function DashboardFallback({ loading, errors }: { loading: boolean; errors: string[] }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-2">
        <p className="text-destructive">Failed to load dashboard data</p>
        {errors.map((e, i) => (
          <p key={i} className="text-destructive text-sm">{e}</p>
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      Some data failed to load:{" "}
      {errors.map((e, i) => (
        <span key={i}>{i > 0 ? "; " : ""}{e}</span>
      ))}
    </div>
  );
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function filterByTrendWindow<T>(
  items: T[],
  getDate: (item: T) => string,
  window: TrendWindow,
) {
  if (window === "all" || items.length === 0) return items;

  const timestamps = items
    .map((item) => parseDate(getDate(item)).getTime())
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) return items;

  const latest = new Date(Math.max(...timestamps));
  const cutoff = new Date(latest);

  if (window === "half-year") {
    cutoff.setMonth(cutoff.getMonth() - 6);
  } else if (window === "full-year") {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
  } else {
    const days =
      window === "24h"
        ? 1
        : window === "7day"
          ? 7
          : window === "14day"
            ? 14
            : window === "30day"
              ? 30
              : 90;
    cutoff.setDate(cutoff.getDate() - (days - 1));
  }

  return items.filter((item) => {
    const value = parseDate(getDate(item)).getTime();
    return !Number.isNaN(value) && value >= cutoff.getTime() && value <= latest.getTime();
  });
}

function filterToolCounts(counts: Record<Tool, number>, toolLens: ToolLens): Record<Tool, number> {
  return TOOL_NAMES.reduce((acc, tool) => {
    acc[tool] = toolLens === "all" || tool === toolLens ? counts[tool] ?? 0 : 0;
    return acc;
  }, {} as Record<Tool, number>);
}

function Dashboard() {
  const { data, errors, loading } = useDashboardData();
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("full-year");
  const [toolLens, setToolLens] = useState<ToolLens>("all");
  const sectionMeta = [
    {
      id: "cost",
      label: "Cost",
      blurb: "Equivalent API cost, savings, and pricing pressure.",
    },
    {
      id: "overview",
      label: "Overview",
      blurb: "Daily volume, throughput, and quick operational context.",
    },
    {
      id: "activity",
      label: "Activity",
      blurb: "Languages, heatmaps, and session complexity patterns.",
    },
    {
      id: "tokens",
      label: "Tokens",
      blurb: "Token flow, cache leverage, and thinking utilization.",
    },
    {
      id: "models-tools",
      label: "Models & Tools",
      blurb: "Routing, tool execution, and model switching behavior.",
    },
    {
      id: "workspace",
      label: "Workspace",
      blurb: "Projects, hosts, git repos, and directory concentration.",
    },
  ] as const;

  const filteredSummary = useMemo(() => {
    if (!data?.summary) return null;
    const daily = filterByTrendWindow(data.summary.daily, (entry) => entry.date, trendWindow);
    return {
      ...data.summary,
      daily,
      by_tool: filterToolCounts(data.summary.by_tool, toolLens),
      period: {
        start: daily[0]?.date ?? data.summary.period.start,
        end: daily[daily.length - 1]?.date ?? data.summary.period.end,
      },
    };
  }, [data, toolLens, trendWindow]);

  const filteredCost = useMemo(() => {
    if (!data?.cost) return null;
    return {
      ...data.cost,
      daily: filterByTrendWindow(data.cost.daily, (entry) => entry.date, trendWindow),
      by_tool:
        toolLens === "all"
          ? data.cost.by_tool
          : Object.fromEntries(
              Object.entries(data.cost.by_tool).filter(([tool]) => tool === toolLens),
            ),
      by_model:
        toolLens === "all"
          ? data.cost.by_model
          : data.cost.by_model.filter((entry) => entry.tool === toolLens),
    };
  }, [data, toolLens, trendWindow]);

  const filteredTokensDaily = useMemo(() => {
    if (!data?.tokensDaily) return null;
    return filterByTrendWindow(data.tokensDaily, (entry) => entry.date, trendWindow).map((entry) => ({
      ...entry,
      by_tool:
        toolLens === "all"
          ? entry.by_tool
          : entry.by_tool[toolLens]
            ? { [toolLens]: entry.by_tool[toolLens] }
            : {},
    }));
  }, [data, toolLens, trendWindow]);

  const filteredDuration = useMemo(() => {
    if (!data?.duration) return null;
    return {
      ...data.duration,
      daily: filterByTrendWindow(data.duration.daily, (entry) => entry.date, trendWindow),
    };
  }, [data, trendWindow]);

  if (loading || !data || Object.values(data).every((v) => v === null)) {
    return <DashboardFallback loading={loading} errors={errors} />;
  }

  return (
    <div className="dashboard-shell min-h-screen bg-background">
      <div
        aria-hidden
        className="dashboard-grid pointer-events-none fixed inset-0"
      />
      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <DashboardHeader
            summary={filteredSummary}
            cost={filteredCost}
            modelSwitches={data.modelSwitches}
            projects={data.projects}
            toolCounts={data.summary?.by_tool ?? null}
            trendWindow={trendWindow}
            onTrendWindowChange={setTrendWindow}
            toolLens={toolLens}
            onToolLensChange={setToolLens}
          />

          <ErrorBanner errors={errors} />

        {composeProviders(
          [
            [SummaryProvider, filteredSummary],
            [CostProvider, filteredCost],
            [ActivityProvider, {
              languages: data.languages,
              weekday: data.weekday,
              sessionComplexity: data.sessionComplexity,
              conversations: data.conversations,
            }],
            [TokenProvider, {
              tokensDaily: filteredTokensDaily,
              cacheEfficiency: data.cacheEfficiency,
              thinking: data.thinking,
            }],
            [ModelsToolsProvider, {
              duration: filteredDuration,
              models: data.models,
              toolCalls: data.toolCalls,
              toolStatus: data.toolStatus,
              toolchains: data.toolchains,
              modelSwitches: data.modelSwitches,
            }],
            [TablesProvider, {
              projects: data.projects,
              hosts: data.hosts,
              gitActivity: data.gitActivity,
              directories: data.directories,
            }],
          ],
          <>
            <DashboardSection
              id="cost"
              eyebrow="Economics"
              title="Cost Pressure and Savings"
              description="Compare equivalent API cost and actual spend."
            >
              <CostSection />
            </DashboardSection>

            <DashboardSection
              id="overview"
              eyebrow="Command Center"
              title="Usage Snapshot"
              description="Start with a high-signal view of volume, utilization, and trend direction before drilling into the lower-level breakdowns."
              highlights={[
                ...(data.summary
                  ? [
                      {
                        label: "Sessions",
                        value: fmtNum(data.summary.total_sessions),
                      },
                      {
                        label: "Messages",
                        value: fmtNum(data.summary.messages.total),
                      },
                    ]
                  : []),
                ...(data.summary
                  ? [
                      {
                        label: "Active days",
                        value: fmtNum(data.summary.daily.length),
                      },
                    ]
                  : []),
              ]}
            >
              <OverviewSection />
            </DashboardSection>

            <DashboardSection
              id="activity"
              eyebrow="Work Patterns"
              title="Agent Activity Profile"
              description="Understand when coding agents are busiest, which language/task categories dominate, and how session complexity shifts over time."
              highlights={
                data.summary?.period.start && data.summary?.period.end
                  ? [
                      {
                        label: "Period",
                        value: `${data.summary.period.start} to ${data.summary.period.end}`,
                      },
                    ]
                  : undefined
              }
            >
              <ActivitySection />
            </DashboardSection>

            <DashboardSection
              id="tokens"
              eyebrow="Throughput"
              title="Token Flow and Cache Efficiency"
              description="Inspect token load, caching leverage, and reasoning-heavy usage to identify which agents or workflows are driving compute intensity."
              highlights={
                data.summary
                  ? [
                      {
                        label: "Input",
                        value: fmtNum(data.summary.tokens.input),
                      },
                      {
                        label: "Output",
                        value: fmtNum(data.summary.tokens.output),
                      },
                      {
                        label: "Thinking",
                        value: fmtNum(data.summary.tokens.thinking),
                      },
                    ]
                  : undefined
              }
            >
              <TokenInsightsSection />
            </DashboardSection>

            <DashboardSection
              id="models-tools"
              eyebrow="Routing"
              title="Models, Tools, and Workflow Shape"
              description="Review runtime, model distribution, tool-call health, and chain composition to see how the agents actually solve work."
              highlights={
                data.modelSwitches
                  ? [
                      {
                        label: "Switch rate",
                        value: `${data.modelSwitches.switch_rate_pct}%`,
                      },
                    ]
                  : undefined
              }
            >
              <ModelsToolsSection />
            </DashboardSection>

            <DashboardSection
              id="workspace"
              eyebrow="Footprint"
              title="Projects, Repos, and Host Coverage"
              description="Use the tables and distribution views to find where agent time is concentrated across repositories, machines, and working directories."
              highlights={
                data.projects
                  ? [
                      {
                        label: "Projects",
                        value: fmtNum(data.projects.length),
                      },
                    ]
                  : undefined
              }
            >
              <TablesSection />
            </DashboardSection>
          </>,
        )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return <Dashboard />;
}
