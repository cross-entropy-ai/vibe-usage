export type Tool = "gemini" | "claude" | "codex" | "kimi";
export type Role = "user" | "assistant" | "system";

export interface TokenUsage {
  input?: number;
  output?: number;
  thinking?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface ToolCall {
  name: string;
  args?: unknown;
  status?: string;
}

export interface Message {
  role: Role;
  content: string;
  timestamp: string;
  model?: string;
  tokens?: TokenUsage;
  duration_ms?: number;
  tool_calls: ToolCall[];
}

export interface GitContext {
  branch?: string;
  commit?: string;
  repo_url?: string;
}

export interface Session {
  id: string;
  tool: Tool;
  project?: string;
  model?: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  cwd?: string;
  git?: GitContext;
  messages: Message[];
}

export interface DailyStat {
  date: string;
  sessions: number;
  messages: number;
  input_tokens: number;
  output_tokens: number;
}

export interface Summary {
  total_sessions: number;
  by_tool: Record<Tool, number>;
  messages: {
    total: number;
    user: number;
    assistant: number;
  };
  tokens: {
    input: number;
    output: number;
    thinking: number;
    cache_read: number;
    cache_write: number;
  };
  daily: DailyStat[];
  top_projects: { name: string; sessions: number }[];
  period: {
    start: string | null;
    end: string | null;
  };
}

// ── New API types ───────────────────────────────────────────────

export interface TokensDailyEntry {
  date: string;
  by_tool: Record<string, { input: number; output: number; thinking: number }>;
}

export interface ModelTokens {
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  messages: number;
}

export interface ToolCallFreq {
  name: string;
  count: number;
}

export interface ProjectDetail {
  name: string;
  sessions: number;
  messages: number;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  tools: Record<string, number>;
  first_seen: string;
  last_seen: string;
}

export interface HostStat {
  hostname: string;
  sessions: number;
  messages: number;
  input_tokens: number;
  output_tokens: number;
  tools: Record<string, number>;
}

export interface DurationData {
  daily: { date: string; duration_ms: number; duration_min: number }[];
  by_project: { project: string; duration_ms: number; duration_min: number }[];
}

export interface WeekdayHeatmapEntry {
  day: string;
  day_index: number;
  hour: number;
  count: number;
}

// ── Latency API types ─────────────────────────────────────────

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  count: number;
}

export interface LatencyData {
  overall: LatencyPercentiles;
  by_model: (LatencyPercentiles & { model: string })[];
  histogram: { bucket: string; count: number }[];
}

// ── Tool status API types ─────────────────────────────────────

export interface ToolStatusEntry {
  name: string;
  total: number;
  success: number;
  error: number;
}

// ── Git activity API types ────────────────────────────────────

export interface GitRepoStat {
  repo: string;
  branches: string[];
  sessions: number;
  messages: number;
  input_tokens: number;
  output_tokens: number;
  last_seen: string;
}

// ── Directory API types ───────────────────────────────────────

export interface DirectoryStat {
  directory: string;
  sessions: number;
  messages: number;
  input_tokens: number;
  output_tokens: number;
  tools: Record<string, number>;
}

// ── Cost API types ─────────────────────────────────────────────

export interface CostModelEntry {
  model: string;
  tool: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  equivalent_api_cost_usd: number;
  is_subscription: boolean;
}

export interface CostToolEntry {
  equivalent_api_cost_usd: number;
  actual_cost_usd: number;
  saved_usd: number;
  subscription?: {
    plan: string;
    monthly_usd: number;
    months: number;
  } | null;
}

export interface CostDailyEntry {
  date: string;
  equivalent_api_cost_usd: number;
}

export interface CostData {
  equivalent_api_cost_usd: number;
  actual_cost_usd: number;
  saved_usd: number;
  by_model: CostModelEntry[];
  by_tool: Record<string, CostToolEntry>;
  daily: CostDailyEntry[];
}

// ── Insights API types ────────────────────────────────────────

export interface ConversationsInsight {
  depth: { histogram: { bucket: string; count: number }[]; avg: number; median: number; total_sessions: number };
  prompt_length: { avg_chars: number; median_chars: number; total: number };
  response_length: { avg_chars: number; median_chars: number; total: number };
}

export interface CacheEntry {
  name: string; input_tokens: number; cache_read_tokens: number; cache_write_tokens: number; hit_rate_pct: number;
}
export interface CacheEfficiencyData { by_tool: CacheEntry[]; by_model: CacheEntry[] }

export interface ThinkingEntry {
  model: string; output_tokens: number; thinking_tokens: number; thinking_pct: number;
}

export interface ToolchainsData {
  top_chains: { chain: string; count: number }[];
  file_types: { extension: string; count: number }[];
}

export interface ProjectLifecycleEntry {
  project: string; total_sessions: number; timeline: { week: string; sessions: number }[];
}

export interface ModelSwitchData {
  total_sessions: number; sessions_with_switch: number; switch_rate_pct: number;
  top_switches: { switch: string; count: number }[];
}

export interface LanguagesData {
  languages: { language: string; sessions: number }[];
  task_types: { task: string; sessions: number }[];
}

export interface SessionComplexityEntry {
  hour: number; sessions: number; total_messages: number;
  avg_messages_per_session: number; avg_tokens_per_session: number;
}
