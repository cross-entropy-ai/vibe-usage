import { useEffect, useState } from "react";
import { StatsCards } from "@/components/stats-cards";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { UsageCharts } from "@/components/usage-chart";
import { WeekdayHeatmap } from "@/components/weekday-heatmap";
import { DurationChart } from "@/components/duration-chart";
import { ModelsChart } from "@/components/models-chart";
import { ToolCallsChart } from "@/components/tool-calls-chart";
import { ProjectsTable } from "@/components/projects-table";
import { HostsTable } from "@/components/hosts-table";
import { CostOverview } from "@/components/cost-overview";
import { TokenTrendChart } from "@/components/token-trend-chart";
import { LatencyChart } from "@/components/latency-chart";
import { ToolStatusChart } from "@/components/tool-status-chart";
import { GitActivity } from "@/components/git-activity";
import { DirectoryChart } from "@/components/directory-chart";
import { EfficiencyCards } from "@/components/efficiency-cards";
import { TrendComparison } from "@/components/trend-comparison";
import { EfficiencyTrendChart } from "@/components/efficiency-trend-chart";
import { CumulativeChart } from "@/components/cumulative-chart";
import { TokenFlowChart } from "@/components/token-flow-chart";
import {
  ConversationDepth,
  CacheEfficiency,
  ThinkingRatio,
  Toolchains,
  ModelSwitches,
  Languages,
  SessionComplexity,
} from "@/components/insights";
import type {
  Summary,
  ModelTokens,
  ToolCallFreq,
  ProjectDetail,
  HostStat,
  DurationData,
  WeekdayHeatmapEntry,
  CostData,
  TokensDailyEntry,
  LatencyData,
  ToolStatusEntry,
  GitRepoStat,
  DirectoryStat,
  ConversationsInsight,
  CacheEfficiencyData,
  ThinkingEntry,
  ToolchainsData,
  ModelSwitchData,
  LanguagesData,
  SessionComplexityEntry,
} from "@/types";

interface DashboardData {
  summary: Summary | null;
  models: ModelTokens[] | null;
  toolCalls: ToolCallFreq[] | null;
  projects: ProjectDetail[] | null;
  hosts: HostStat[] | null;
  duration: DurationData | null;
  weekday: WeekdayHeatmapEntry[] | null;
  cost: CostData | null;
  tokensDaily: TokensDailyEntry[] | null;
  latency: LatencyData | null;
  toolStatus: ToolStatusEntry[] | null;
  gitActivity: GitRepoStat[] | null;
  directories: DirectoryStat[] | null;
  // Insights
  conversations: ConversationsInsight | null;
  cacheEfficiency: CacheEfficiencyData | null;
  thinking: ThinkingEntry[] | null;
  toolchains: ToolchainsData | null;
  modelSwitches: ModelSwitchData | null;
  languages: LanguagesData | null;
  sessionComplexity: SessionComplexityEntry[] | null;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** Extract the value from a settled promise, returning null on rejection. */
function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    Promise.allSettled([
      fetchJson<Summary>("/api/summary", signal),                              // 0
      fetchJson<ModelTokens[]>("/api/tokens/by-model", signal),                // 1
      fetchJson<ToolCallFreq[]>("/api/tools/usage", signal),                   // 2
      fetchJson<ProjectDetail[]>("/api/projects", signal),                     // 3
      fetchJson<HostStat[]>("/api/hosts", signal),                             // 4
      fetchJson<DurationData>("/api/duration", signal),                        // 5
      fetchJson<WeekdayHeatmapEntry[]>("/api/activity/heatmap", signal),        // 6
      fetchJson<CostData>("/api/cost", signal),                                // 7
      fetchJson<TokensDailyEntry[]>("/api/tokens/daily", signal),              // 8
      fetchJson<LatencyData>("/api/messages/latency", signal),                 // 9
      fetchJson<ToolStatusEntry[]>("/api/tools/status", signal),               // 10
      fetchJson<GitRepoStat[]>("/api/git/activity", signal),                   // 11
      fetchJson<DirectoryStat[]>("/api/directories", signal),                  // 12
      // Insights
      fetchJson<ConversationsInsight>("/api/insights/conversations", signal),   // 13
      fetchJson<CacheEfficiencyData>("/api/insights/cache-efficiency", signal), // 14
      fetchJson<ThinkingEntry[]>("/api/insights/thinking", signal),             // 15
      fetchJson<ToolchainsData>("/api/insights/toolchains", signal),            // 16
      fetchJson<ModelSwitchData>("/api/insights/model-switches", signal),       // 17
      fetchJson<LanguagesData>("/api/insights/languages", signal),              // 18
      fetchJson<SessionComplexityEntry[]>("/api/insights/session-complexity", signal), // 19
    ]).then((results) => {
      if (signal.aborted) return;

      const failed = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => String(r.reason));

      setData({
        summary: settled(results[0]),
        models: settled(results[1]),
        toolCalls: settled(results[2]),
        projects: settled(results[3]),
        hosts: settled(results[4]),
        duration: settled(results[5]),
        weekday: settled(results[6]),
        cost: settled(results[7]),
        tokensDaily: settled(results[8]),
        latency: settled(results[9]),
        toolStatus: settled(results[10]),
        gitActivity: settled(results[11]),
        directories: settled(results[12]),
        conversations: settled(results[13]),
        cacheEfficiency: settled(results[14]),
        thinking: settled(results[15]),
        toolchains: settled(results[16]),
        modelSwitches: settled(results[17]),
        languages: settled(results[18]),
        sessionComplexity: settled(results[19]),
      });
      setErrors(failed);
      setLoading(false);
    });

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!data || Object.values(data).every((v) => v === null)) {
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage Stats</h1>
          <p className="text-muted-foreground text-sm">
            AI coding tool usage across Gemini, Claude, Codex, and Kimi
          </p>
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            Some data failed to load:{" "}
            {errors.map((e, i) => (
              <span key={i}>{i > 0 ? "; " : ""}{e}</span>
            ))}
          </div>
        )}

        {/* Overview cards */}
        {data.summary && <StatsCards summary={data.summary} />}

        {/* Efficiency metrics + Trends */}
        {data.summary && <EfficiencyCards summary={data.summary} />}
        {data.summary && <TrendComparison daily={data.summary.daily} />}
        {data.summary && <EfficiencyTrendChart daily={data.summary.daily} />}

        {/* Cumulative sessions + cost */}
        {data.summary && data.cost && (
          <CumulativeChart daily={data.summary.daily} costDaily={data.cost.daily} />
        )}

        {/* Cost overview */}
        {data.cost && <CostOverview data={data.cost} />}

        {/* Language + Task classification */}
        {data.languages && <Languages data={data.languages} />}

        {/* Activity heatmaps */}
        {data.summary && <ActivityHeatmap daily={data.summary.daily} />}
        {data.weekday && <WeekdayHeatmap data={data.weekday} />}

        {/* Session complexity by hour */}
        {data.sessionComplexity && <SessionComplexity data={data.sessionComplexity} />}

        {/* Conversation depth + message lengths */}
        {data.conversations && <ConversationDepth data={data.conversations} />}

        {/* Token trend */}
        {data.tokensDaily && <TokenTrendChart data={data.tokensDaily} />}

        {/* Cache efficiency */}
        {data.cacheEfficiency && <CacheEfficiency data={data.cacheEfficiency} />}

        {/* Thinking ratio */}
        {data.thinking && data.thinking.length > 0 && <ThinkingRatio data={data.thinking} />}

        {/* 6 chart types */}
        {data.summary && <UsageCharts summary={data.summary} />}

        {/* Duration + Models */}
        {(data.duration || data.models) && (
          <div className="grid gap-4 md:grid-cols-2">
            {data.duration && <DurationChart data={data.duration} />}
            {data.models && <ModelsChart data={data.models} />}
          </div>
        )}

        {/* Token flow: Tool → Model (Sankey) */}
        {data.cost && <TokenFlowChart data={data.cost.by_model} />}

        {/* Tool calls + status */}
        {(data.toolCalls || data.toolStatus) && (
          <div className="grid gap-4 md:grid-cols-2">
            {data.toolCalls && <ToolCallsChart data={data.toolCalls} />}
            {data.toolStatus && <ToolStatusChart data={data.toolStatus} />}
          </div>
        )}

        {/* Tool chains + File types */}
        {data.toolchains && <Toolchains data={data.toolchains} />}

        {/* Model switches */}
        {data.modelSwitches && <ModelSwitches data={data.modelSwitches} />}

        {/* Latency */}
        {data.latency && <LatencyChart data={data.latency} />}

        {/* Tables */}
        {data.projects && <ProjectsTable data={data.projects} />}
        {data.hosts && <HostsTable data={data.hosts} />}

        {/* Git + Directory */}
        {data.gitActivity && data.gitActivity.length > 0 && <GitActivity data={data.gitActivity} />}
        {data.directories && data.directories.length > 0 && <DirectoryChart data={data.directories} />}
      </div>
    </div>
  );
}
