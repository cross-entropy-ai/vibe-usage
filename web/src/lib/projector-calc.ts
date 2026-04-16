import type { ProjectorModel, TokenBreakdown, TokenBreakdownSimple } from "@/types/projector";

export interface ProjectionResult {
  model: string;
  provider: string;
  cost_with_cache: number;
  cost_without_cache: number;
}

function costWithCache(model: ProjectorModel, tokens: TokenBreakdown): number {
  return (
    tokens.input_tokens * model.input_cost_per_token +
    (tokens.output_tokens + tokens.thinking_tokens) * model.output_cost_per_token +
    tokens.cache_read_tokens * model.cache_read_input_token_cost +
    tokens.cache_write_tokens * model.cache_creation_input_token_cost
  );
}

function costWithoutCache(model: ProjectorModel, tokens: TokenBreakdownSimple): number {
  return (
    tokens.input_tokens * model.input_cost_per_token +
    tokens.output_tokens * model.output_cost_per_token
  );
}

export function projectUsage(
  models: ProjectorModel[],
  withCache: TokenBreakdown,
  withoutCache: TokenBreakdownSimple,
): ProjectionResult[] {
  return models
    .map((m) => ({
      model: m.name,
      provider: m.provider,
      cost_with_cache: costWithCache(m, withCache),
      cost_without_cache: costWithoutCache(m, withoutCache),
    }))
    .sort((a, b) => a.cost_without_cache - b.cost_without_cache);
}

export function manualTokens(
  input: number,
  output: number,
  thinking?: number,
  cacheRead?: number,
  cacheWrite?: number,
): { withCache: TokenBreakdown; withoutCache: TokenBreakdownSimple } {
  const withCache: TokenBreakdown = {
    input_tokens: input,
    output_tokens: output,
    thinking_tokens: thinking ?? 0,
    cache_read_tokens: cacheRead ?? 0,
    cache_write_tokens: cacheWrite ?? 0,
  };
  const withoutCache: TokenBreakdownSimple = {
    input_tokens: input + (cacheRead ?? 0) + (cacheWrite ?? 0),
    output_tokens: output + (thinking ?? 0),
  };
  return { withCache, withoutCache };
}
