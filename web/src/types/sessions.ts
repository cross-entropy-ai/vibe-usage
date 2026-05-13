export type ToolName = "claude" | "codex" | "gemini" | "kimi";
export type Role = "user" | "assistant" | "system";

export interface SessionListItem {
  id: string;
  tool: ToolName;
  project: string | null;
  model: string | null;
  start_time: string;
  message_count: number;
  token_total: number;
  title: string;
  match_preview?: string;
  match_count: number;
}

export interface SessionListResponse {
  total: number;
  offset: number;
  count: number;
  sessions: SessionListItem[];
}

export interface TokenUsage {
  input?: number | null;
  output?: number | null;
  thinking?: number | null;
  cache_read?: number | null;
  cache_write?: number | null;
}

export interface ToolCall {
  name: string;
  args?: unknown;
  status?: string | null;
}

export interface SessionMessage {
  role: Role;
  content: string;
  timestamp: string;
  model?: string | null;
  tokens?: TokenUsage | null;
  duration_ms?: number | null;
  tool_calls: ToolCall[];
}

export interface GitContext {
  branch?: string | null;
  commit?: string | null;
  repo_url?: string | null;
}

export interface SessionDetail {
  id: string;
  tool: ToolName;
  hostname?: string | null;
  project?: string | null;
  model?: string | null;
  start_time: string;
  end_time?: string | null;
  duration_ms?: number | null;
  cwd?: string | null;
  git?: GitContext | null;
  messages: SessionMessage[];
  estimated_cost_usd?: number;
}
