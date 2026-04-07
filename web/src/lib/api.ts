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

// ── Data source abstraction ───────────────────────────────────────
// Swap implementations for testing or alternative transports (WS, SSE, etc.)

export interface DataSource {
  fetch<T>(path: string, signal: AbortSignal): Promise<T>;
}

export const httpSource: DataSource = {
  async fetch<T>(path: string, signal: AbortSignal): Promise<T> {
    const r = await globalThis.fetch(path, { signal });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  },
};

// ── Endpoint registry ─────────────────────────────────────────────
// Adding a new data source: add a row here + the type in DashboardData.

const ENDPOINTS = {
  summary:           "/api/summary",
  models:            "/api/tokens/by-model",
  toolCalls:         "/api/tools/usage",
  projects:          "/api/projects",
  hosts:             "/api/hosts",
  duration:          "/api/duration",
  weekday:           "/api/activity/heatmap",
  cost:              "/api/cost",
  tokensDaily:       "/api/tokens/daily",
  latency:           "/api/messages/latency",
  toolStatus:        "/api/tools/status",
  gitActivity:       "/api/git/activity",
  directories:       "/api/directories",
  conversations:     "/api/insights/conversations",
  cacheEfficiency:   "/api/insights/cache-efficiency",
  thinking:          "/api/insights/thinking",
  toolchains:        "/api/insights/toolchains",
  modelSwitches:     "/api/insights/model-switches",
  languages:         "/api/insights/languages",
  sessionComplexity: "/api/insights/session-complexity",
} as const;

export interface DashboardData {
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
  conversations: ConversationsInsight | null;
  cacheEfficiency: CacheEfficiencyData | null;
  thinking: ThinkingEntry[] | null;
  toolchains: ToolchainsData | null;
  modelSwitches: ModelSwitchData | null;
  languages: LanguagesData | null;
  sessionComplexity: SessionComplexityEntry[] | null;
}

export async function fetchDashboardData(
  signal: AbortSignal,
  source: DataSource = httpSource,
): Promise<{
  data: DashboardData;
  errors: string[];
}> {
  const keys = Object.keys(ENDPOINTS) as (keyof DashboardData)[];
  const results = await Promise.allSettled(
    keys.map((k) => source.fetch(ENDPOINTS[k], signal)),
  );

  const errors: string[] = [];
  const data = {} as DashboardData;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      (data[key] as DashboardData[typeof key]) = result.value as NonNullable<DashboardData[typeof key]>;
    } else {
      data[key] = null;
      errors.push(String(result.reason));
    }
  }

  return { data, errors };
}
