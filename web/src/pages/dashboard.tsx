import { useMemo } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import type { DateRange } from "@/lib/api";
import { ConnectionErrorDialog } from "@/components/connection-error-dialog";
import {
  SummaryProvider,
  CostProvider,
  ActivityProvider,
  TokenProvider,
  ModelsToolsProvider,
  TablesProvider,
  ScaleModeProvider,
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
  TREND_WINDOWS,
  TOOL_LENS_VALUES,
  type ToolLens,
  type TrendWindow,
} from "@/components/dashboard-shell";
import { SectionNav } from "@/components/section-nav";
import { fmtNum } from "@/lib/formatters";
import { TOOL_NAMES, type Tool } from "@/lib/tools";
import type { Summary } from "@/types";

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function trendWindowToDateRange(window: TrendWindow): DateRange | undefined {
  if (window === "all") return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = fmt(today);

  const cutoff = new Date(today);
  if (window === "half-year") {
    cutoff.setMonth(cutoff.getMonth() - 6);
  } else if (window === "full-year") {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
  } else {
    const days =
      window === "24h" ? 1
        : window === "7day" ? 7
        : window === "14day" ? 14
        : window === "30day" ? 30
        : 90;
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

function filterToolCounts(counts: Record<Tool, number>, toolLens: ToolLens): Record<Tool, number> {
  return TOOL_NAMES.reduce((acc, tool) => {
    acc[tool] = toolLens === "all" || tool === toolLens ? counts[tool] ?? 0 : 0;
    return acc;
  }, {} as Record<Tool, number>);
}

function getDailySummaryMetrics(summary: Summary | null) {
  if (!summary) return null;

  return summary.daily.reduce(
    (acc, entry) => {
      acc.sessions += entry.sessions;
      acc.messages += entry.messages;
      acc.inputTokens += entry.input_tokens;
      acc.outputTokens += entry.output_tokens;
      return acc;
    },
    {
      sessions: 0,
      messages: 0,
      inputTokens: 0,
      outputTokens: 0,
      activeDays: summary.daily.length,
    },
  );
}

function Dashboard() {
  const [trendWindow, setTrendWindow] = useSearchParamState<TrendWindow>("window", "full-year", TREND_WINDOWS);
  const [toolLens, setToolLens] = useSearchParamState<ToolLens>("tool", "all", TOOL_LENS_VALUES);

  const dateRange = useMemo(() => trendWindowToDateRange(trendWindow), [trendWindow]);
  const { data, errors, loading, initialLoad, refetch } = useDashboardData(dateRange);

  const filteredSummary = useMemo(() => {
    if (!data?.summary) return null;
    return {
      ...data.summary,
      by_tool: filterToolCounts(data.summary.by_tool, toolLens),
    };
  }, [data, toolLens]);

  const filteredCost = useMemo(() => {
    if (!data?.cost) return null;
    return {
      ...data.cost,
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
  }, [data, toolLens]);

  const filteredTokensDaily = useMemo(() => {
    if (!data?.tokensDaily) return null;
    return data.tokensDaily.map((entry) => ({
      ...entry,
      by_tool:
        toolLens === "all"
          ? entry.by_tool
          : entry.by_tool[toolLens]
            ? { [toolLens]: entry.by_tool[toolLens] }
            : {},
    }));
  }, [data, toolLens]);

  const summaryMetrics = useMemo(
    () => getDailySummaryMetrics(filteredSummary),
    [filteredSummary],
  );

  if (initialLoad) {
    return <LoadingScreen message="Loading…" />;
  }

  if (!data || Object.values(data).every((v) => v === null)) {
    return (
      <>
        <LoadingScreen message="No data available." />
        <ConnectionErrorDialog errors={errors} onRetry={refetch} retrying={loading} />
      </>
    );
  }

  return (
    <div className="dashboard-shell min-h-screen bg-background">
      {loading && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-slate-200/60">
          <div className="h-full w-1/3 animate-pulse bg-sky-600 [animation-duration:800ms]"
            style={{ animation: "slide 1s ease-in-out infinite" }} />
        </div>
      )}
      <div
        aria-hidden
        className="dashboard-grid pointer-events-none fixed inset-0"
      />
      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <DashboardHeader
            summary={filteredSummary}
            cost={filteredCost}
            toolCounts={data.summary?.by_tool ?? null}
            trendWindow={trendWindow}
            onTrendWindowChange={setTrendWindow}
            toolLens={toolLens}
            onToolLensChange={setToolLens}
          />

          <SectionNav />

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
              duration: data.duration,
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
                ...(summaryMetrics
                  ? [
                      {
                        label: "Sessions",
                        value: fmtNum(summaryMetrics.sessions),
                      },
                      {
                        label: "Messages",
                        value: fmtNum(summaryMetrics.messages),
                      },
                    ]
                  : []),
                ...(summaryMetrics
                  ? [
                      {
                        label: "Active days",
                        value: fmtNum(summaryMetrics.activeDays),
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
                filteredSummary?.period.start && filteredSummary.period.end
                  ? [
                      {
                        label: "Period",
                        value: `${filteredSummary.period.start} to ${filteredSummary.period.end}`,
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
                summaryMetrics
                  ? [
                      {
                        label: "Input",
                        value: fmtNum(summaryMetrics.inputTokens),
                      },
                      {
                        label: "Output",
                        value: fmtNum(summaryMetrics.outputTokens),
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
      <ConnectionErrorDialog errors={errors} onRetry={refetch} retrying={loading} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ScaleModeProvider>
      <Dashboard />
    </ScaleModeProvider>
  );
}
