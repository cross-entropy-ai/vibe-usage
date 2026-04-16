export interface ProjectorModel {
  name: string;
  provider: string;
  input_cost_per_token: number;
  output_cost_per_token: number;
  cache_read_input_token_cost: number;
  cache_creation_input_token_cost: number;
}

export interface ProjectorModelsResponse {
  models: ProjectorModel[];
}

export interface ModelUsage {
  model: string;
  tool: string;
  sessions: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  actual_cost: number;
  equivalent_api_cost: number;
}

export interface TokenBreakdown {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface TokenBreakdownSimple {
  input_tokens: number;
  output_tokens: number;
}

export interface UsageSummary {
  period: { from: string | null; to: string | null };
  by_model: ModelUsage[];
  totals: {
    with_cache: TokenBreakdown;
    without_cache: TokenBreakdownSimple;
  };
}
