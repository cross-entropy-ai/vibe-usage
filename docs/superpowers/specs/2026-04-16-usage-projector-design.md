# Usage Projector — Design Spec

## Overview

A standalone page (`/projector`) that lets users project their historical token usage onto other models' pricing, and manually calculate costs for hypothetical usage. Uses LiteLLM's model pricing database as the data source, embedded at compile time.

## Data Source: LiteLLM Model Prices

### Compile-Time Embedding

The pricing database comes from [BerriAI/litellm](https://github.com/BerriAI/litellm)'s `model_prices_and_context_window.json`. It is fetched and embedded into the binary at compile time.

**`build.rs` behavior:**
1. Check if `model_prices.json` exists in project root
2. If missing, or if `FETCH_PRICES=1` env var is set, download from GitHub raw URL
3. Write the file path to `OUT_DIR` for `include_str!()` embedding

**CI integration:** Add a `curl` step before `cargo build` in the release workflow to always fetch the latest file. Local dev uses the cached copy — no network required.

### Data Filtering & Deduplication

LiteLLM has 500+ entries including provider-specific variants (`azure/gpt-4o`, `bedrock/claude-opus`, etc.). At parse time:

- Keep only entries with `mode: "chat"` and `input_cost_per_token` present
- Strip provider routing prefixes (`azure/`, `bedrock/`, `openai/`, etc.)
- Deduplicate by base model name, preferring direct provider entries (`openai/`, `anthropic/`, `google/` prefixes)
- Expose all four pricing fields using LiteLLM's naming

### Field Naming (LiteLLM-aligned)

All pricing fields match LiteLLM's schema exactly:

| Field | Description |
|---|---|
| `input_cost_per_token` | Input token cost |
| `output_cost_per_token` | Output token cost |
| `cache_read_input_token_cost` | Prompt cache read cost |
| `cache_creation_input_token_cost` | Prompt cache write cost |
| `provider` | Provider name (renamed from `litellm_provider`) |

**Unit: per token (not per million).** This is a breaking change to the existing `ModelPrice` struct, which currently uses per-million pricing. The `pricing.rs` module, `calculate_cost()`, and all consumers need to be updated.

### Config Override

Users can still define `[[models]]` in `config.toml` to override or add custom model pricing. Config prices take precedence over LiteLLM data.

## Backend API

### `GET /api/projector/models`

Returns all available models with pricing. Source: LiteLLM embedded data + config.toml overrides.

```json
{
  "models": [
    {
      "name": "claude-opus-4-20250514",
      "provider": "anthropic",
      "input_cost_per_token": 0.000015,
      "output_cost_per_token": 0.000075,
      "cache_read_input_token_cost": 0.0000015,
      "cache_creation_input_token_cost": 0.00001875
    }
  ]
}
```

### `GET /api/projector/usage-summary?from=&to=`

Aggregates historical token usage and provides two cost calculation bases.

```json
{
  "period": { "from": "2025-03-01", "to": "2025-03-31" },
  "by_model": [
    {
      "model": "claude-opus-4-20250514",
      "tool": "claude",
      "sessions": 142,
      "input_tokens": 5200000,
      "output_tokens": 1800000,
      "thinking_tokens": 900000,
      "cache_read_tokens": 3100000,
      "cache_write_tokens": 800000,
      "actual_cost": 30.00,
      "equivalent_api_cost": 187.50
    }
  ],
  "totals": {
    "with_cache": {
      "input_tokens": 5200000,
      "output_tokens": 1800000,
      "thinking_tokens": 900000,
      "cache_read_tokens": 3100000,
      "cache_write_tokens": 800000
    },
    "without_cache": {
      "input_tokens": 9100000,
      "output_tokens": 2700000
    }
  }
}
```

**`without_cache` logic:** `cache_read + cache_write` folds into `input_tokens`; `thinking` folds into `output_tokens`. This provides a uniform basis for projecting onto models that don't support caching or extended thinking.

## Frontend

### Routing

The app currently has no client-side router. This feature adds one:

- `/` — existing dashboard (no changes)
- `/projector` — new Usage Projector page

A navigation link is added to the dashboard header to access `/projector`.

### Page Layout: `/projector`

Three vertically stacked sections:

#### 1. Historical Projection

- **Date range selector** at top (reuse existing period selector component)
- **Left: Comparison table**
  - Columns: Model | Provider | Cost (with cache) | Cost (no cache) | Difference %
  - Current actually-used models highlighted
  - Filterable by provider
  - Sortable columns
- **Right: Bar chart**
  - X-axis: model names, Y-axis: cost (USD)
  - Two bar groups: with cache / without cache
  - Current model highlighted in distinct color

#### 2. Manual Calculator

- **Simple mode** (default): two inputs — Input Tokens, Output Tokens
- **Advanced mode** (expandable): adds Thinking Tokens, Cache Read Tokens, Cache Write Tokens
- Results displayed immediately below (no submit button — real-time calculation)
- Same visualization as historical projection: table + bar chart

#### 3. Model Price Reference

- Collapsible section (collapsed by default)
- Full model pricing table: Model | Provider | Input | Output | Cache Read | Cache Write
- Searchable, sortable

### Frontend Calculation

All projection math happens in the browser. The backend provides raw data (token counts + price table), the frontend multiplies. This keeps the manual calculator instant and avoids round-trips.

## Impact on Existing Code

### `pricing.rs` — Field Rename + Unit Change

```
ModelPrice.input           → ModelPrice.input_cost_per_token
ModelPrice.output          → ModelPrice.output_cost_per_token
ModelPrice.cached_input    → ModelPrice.cache_read_input_token_cost
ModelPrice.cache_write     → ModelPrice.cache_creation_input_token_cost
```

Unit changes from per-million to per-token. `calculate_cost()` removes the `/ 1_000_000.0` divisor.

The existing `default_models()` hardcoded prices are replaced by the embedded LiteLLM data. Config `[[models]]` override still works.

### `PricingProvider` trait — New method

Add `fn all_models(&self) -> Vec<ProjectorModel>` to support the `/api/projector/models` endpoint.

### `server.rs` — New routes

Add two routes under the existing router:
```
.route("/api/projector/models", get(api_projector_models))
.route("/api/projector/usage-summary", get(api_projector_usage_summary))
```

### `analytics/` — New module

Add `analytics/projector.rs` for the usage-summary aggregation logic (with_cache / without_cache totals).

### Frontend — Add router

Install `react-router-dom`. Wrap `App` in `BrowserRouter`. The existing dashboard stays at `/`, new projector page at `/projector`.

### `static_handler` — SPA fallback

The existing fallback already serves `index.html` for unknown paths, so `/projector` will work with client-side routing out of the box.

## Out of Scope

- Real-time price fetching from external APIs
- Subscription cost projection (only API token pricing is projected)
- Multi-currency support
- Historical price tracking (prices are point-in-time from last build)
