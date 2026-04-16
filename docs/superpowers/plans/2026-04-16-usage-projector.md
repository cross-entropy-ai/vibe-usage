# Usage Projector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/projector` page that projects historical token usage onto other models' pricing and provides a manual cost calculator, using LiteLLM's model pricing database embedded at compile time.

**Architecture:** Backend embeds LiteLLM's JSON pricing file via `build.rs`, exposes two new API endpoints (`/api/projector/models` and `/api/projector/usage-summary`). Frontend adds `react-router-dom` for client-side routing, and a new page with historical projection, manual calculator, and price reference table — all calculation done client-side.

**Tech Stack:** Rust (build.rs, serde_json), React 19, react-router-dom, Recharts, Tailwind CSS, shadcn/ui

---

### Task 1: Fetch and embed LiteLLM pricing data at compile time

**Files:**
- Create: `build.rs`
- Create: `src/litellm.rs`
- Modify: `src/main.rs` (add `mod litellm;`)
- Modify: `.gitignore` (add `model_prices.json`)

- [ ] **Step 1: Create `build.rs`**

This script checks for `model_prices.json` and optionally downloads it. During CI, the file is pre-fetched by `curl`.

```rust
// build.rs
use std::env;
use std::path::Path;

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let cached = Path::new(&manifest_dir).join("model_prices.json");

    // Re-run build script if the file changes
    println!("cargo::rerun-if-changed=model_prices.json");
    println!("cargo::rerun-if-env-changed=FETCH_PRICES");

    let should_fetch = env::var("FETCH_PRICES").map(|v| v == "1").unwrap_or(false);

    if !cached.exists() || should_fetch {
        // In CI the file is pre-fetched. For local dev, download if missing.
        let url = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
        let status = std::process::Command::new("curl")
            .args(["-sSfL", "-o", cached.to_str().unwrap(), url])
            .status();
        match status {
            Ok(s) if s.success() => {}
            _ => {
                if !cached.exists() {
                    // Write an empty JSON object as fallback so compilation doesn't fail
                    std::fs::write(&cached, "{}").unwrap();
                    println!("cargo::warning=Failed to fetch model_prices.json, using empty fallback");
                }
            }
        }
    }
}
```

- [ ] **Step 2: Create `src/litellm.rs`**

Parses the embedded JSON, filters to chat models, deduplicates, and returns a clean model list.

```rust
// src/litellm.rs
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

static RAW_JSON: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/model_prices.json"));

#[derive(Debug, Deserialize)]
struct RawEntry {
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    litellm_provider: Option<String>,
    #[serde(default)]
    input_cost_per_token: Option<f64>,
    #[serde(default)]
    output_cost_per_token: Option<f64>,
    #[serde(default)]
    cache_read_input_token_cost: Option<f64>,
    #[serde(default)]
    cache_creation_input_token_cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LitellmModel {
    pub name: String,
    pub provider: String,
    pub input_cost_per_token: f64,
    pub output_cost_per_token: f64,
    pub cache_read_input_token_cost: f64,
    pub cache_creation_input_token_cost: f64,
}

/// Known direct-provider prefixes in priority order.
/// Models from these providers are preferred during deduplication.
const DIRECT_PROVIDERS: &[&str] = &[
    "openai",
    "anthropic",
    "gemini",
    "deepseek",
    "mistral",
    "cohere",
    "fireworks_ai",
    "together_ai",
];

/// Provider routing prefixes to strip from model names.
const ROUTING_PREFIXES: &[&str] = &[
    "azure/",
    "azure_ai/",
    "bedrock/",
    "bedrock_converse/",
    "vertex_ai/",
    "vertex_ai_beta/",
    "sagemaker/",
    "openrouter/",
];

fn strip_routing_prefix(name: &str) -> &str {
    for prefix in ROUTING_PREFIXES {
        if let Some(rest) = name.strip_prefix(prefix) {
            return rest;
        }
    }
    name
}

fn is_direct_provider(provider: &str) -> bool {
    DIRECT_PROVIDERS.iter().any(|p| *p == provider)
}

/// Parse and deduplicate the embedded LiteLLM pricing data.
pub fn load_litellm_models() -> Vec<LitellmModel> {
    let raw: HashMap<String, RawEntry> = match serde_json::from_str(RAW_JSON) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    // Collect chat models with token pricing
    let mut by_base_name: HashMap<String, LitellmModel> = HashMap::new();
    let mut is_direct: HashMap<String, bool> = HashMap::new();

    for (key, entry) in &raw {
        // Only keep chat models with input pricing
        let mode = entry.mode.as_deref().unwrap_or("");
        if mode != "chat" {
            continue;
        }
        let input_cost = match entry.input_cost_per_token {
            Some(c) if c > 0.0 => c,
            _ => continue,
        };
        let output_cost = entry.output_cost_per_token.unwrap_or(0.0);
        let provider = entry.litellm_provider.as_deref().unwrap_or("unknown");
        let base_name = strip_routing_prefix(key).to_string();

        let model = LitellmModel {
            name: base_name.clone(),
            provider: provider.to_string(),
            input_cost_per_token: input_cost,
            output_cost_per_token: output_cost,
            cache_read_input_token_cost: entry.cache_read_input_token_cost.unwrap_or(0.0),
            cache_creation_input_token_cost: entry.cache_creation_input_token_cost.unwrap_or(0.0),
        };

        let direct = is_direct_provider(provider);

        // Keep the entry if: no existing entry, or this one is from a direct provider and the existing one isn't
        match by_base_name.get(&base_name) {
            None => {
                by_base_name.insert(base_name.clone(), model);
                is_direct.insert(base_name, direct);
            }
            Some(_) => {
                let existing_direct = *is_direct.get(&base_name).unwrap_or(&false);
                if direct && !existing_direct {
                    by_base_name.insert(base_name.clone(), model);
                    is_direct.insert(base_name, true);
                }
            }
        }
    }

    let mut models: Vec<LitellmModel> = by_base_name.into_values().collect();
    models.sort_by(|a, b| a.name.cmp(&b.name));
    models
}
```

- [ ] **Step 3: Add `mod litellm;` to `main.rs`**

In `src/main.rs`, add the module declaration alongside the existing ones:

```rust
mod litellm;
```

- [ ] **Step 4: Add `model_prices.json` to `.gitignore`**

Append to `.gitignore`:

```
model_prices.json
```

- [ ] **Step 5: Fetch the file locally and verify compilation**

```bash
curl -sSfL -o model_prices.json "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
cargo check
```

Expected: compiles successfully, no errors.

- [ ] **Step 6: Commit**

```bash
git add build.rs src/litellm.rs src/main.rs .gitignore
git commit -m "feat: embed LiteLLM model pricing at compile time"
```

---

### Task 2: Refactor `pricing.rs` to use LiteLLM-aligned field names

**Files:**
- Modify: `src/pricing.rs`
- Modify: `src/analytics/cost.rs` (update `ModelPrice` field references)
- Modify: `config.example.toml` (update field names)

- [ ] **Step 1: Rename `ModelPrice` fields in `src/pricing.rs`**

Replace the `ModelPrice` struct and update all references within the file:

Old:
```rust
pub struct ModelPrice {
    pub input: f64,
    pub output: f64,
    pub cached_input: f64,
    pub cache_write: f64,
}
```

New:
```rust
pub struct ModelPrice {
    pub input_cost_per_token: f64,
    pub output_cost_per_token: f64,
    pub cache_read_input_token_cost: f64,
    pub cache_creation_input_token_cost: f64,
}
```

- [ ] **Step 2: Update `calculate_cost` in `src/pricing.rs`**

The prices are now per-token, so remove the `/ 1_000_000.0` divisor:

Old:
```rust
pub fn calculate_cost(
    price: &ModelPrice,
    input: u64,
    output: u64,
    thinking: u64,
    cache_read: u64,
    cache_write: u64,
) -> f64 {
    let m = 1_000_000.0;
    (input as f64 / m) * price.input
        + ((output + thinking) as f64 / m) * price.output
        + (cache_read as f64 / m) * price.cached_input
        + (cache_write as f64 / m) * price.cache_write
}
```

New:
```rust
pub fn calculate_cost(
    price: &ModelPrice,
    input: u64,
    output: u64,
    thinking: u64,
    cache_read: u64,
    cache_write: u64,
) -> f64 {
    input as f64 * price.input_cost_per_token
        + (output + thinking) as f64 * price.output_cost_per_token
        + cache_read as f64 * price.cache_read_input_token_cost
        + cache_write as f64 * price.cache_creation_input_token_cost
}
```

- [ ] **Step 3: Update `default_models()` to use per-token prices**

Convert all existing hardcoded prices from per-million to per-token. For every entry in `default_models()`, divide values by 1,000,000. For example:

```rust
ConfigModelPrice {
    match_pattern: "gpt-5.4".to_string(),
    price: ModelPrice {
        input_cost_per_token: 2.50e-6,
        output_cost_per_token: 15.00e-6,
        cache_read_input_token_cost: 0.25e-6,
        cache_creation_input_token_cost: 2.50e-6,
    },
},
```

Apply the same conversion to all 13 entries.

- [ ] **Step 4: Update `ConfigModelPrice` deserialization**

The `ConfigModelPrice` struct references `ModelPrice`, so config.toml `[[models]]` now expects per-token pricing. Update `config.example.toml` to match:

Old:
```toml
[models.price]
input = 0.55
output = 2.19
cached_input = 0.14
cache_write = 0.55
```

New:
```toml
[models.price]
input_cost_per_token = 0.00000055
output_cost_per_token = 0.00000219
cache_read_input_token_cost = 0.00000014
cache_creation_input_token_cost = 0.00000055
```

- [ ] **Step 5: Update test in `src/analytics/cost.rs`**

The `MockPricing` in the test uses old field names. Update:

Old:
```rust
Some(crate::pricing::ModelPrice {
    input: 1.0,
    output: 2.0,
    cached_input: 0.5,
    cache_write: 3.0,
})
```

New (per-token, so use small values that produce testable results):
```rust
Some(crate::pricing::ModelPrice {
    input_cost_per_token: 1e-6,
    output_cost_per_token: 2e-6,
    cache_read_input_token_cost: 0.5e-6,
    cache_creation_input_token_cost: 3e-6,
})
```

Update the test assertions to match the new expected values (10 input tokens × 1e-6 = 0.00001, etc.). The `round2` function will round these to 0.0, so you may need to increase token counts in the test fixture or adjust assertions for the new scale.

- [ ] **Step 6: Run tests**

```bash
cargo test
```

Expected: all tests pass with the new per-token pricing.

- [ ] **Step 7: Commit**

```bash
git add src/pricing.rs src/analytics/cost.rs config.example.toml
git commit -m "refactor: align ModelPrice fields with LiteLLM naming, use per-token pricing"
```

---

### Task 3: Integrate LiteLLM data into `PricingProvider`

**Files:**
- Modify: `src/pricing.rs` (add `all_models()`, load LiteLLM data into fallback chain)

- [ ] **Step 1: Add `all_models()` to `PricingProvider` trait**

```rust
pub trait PricingProvider: Send + Sync {
    fn price_for(&self, model: &str) -> Option<ModelPrice>;
    fn all_models(&self) -> Vec<ProjectorModel>;
    fn is_subscription(&self, tool: &str) -> bool;
    fn subscription_for(&self, tool: &str) -> Option<&Subscription>;
    fn subscription_months(&self, tool: &str, first_date: &str, last_date: &str) -> f64;
}
```

Add the `ProjectorModel` struct:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct ProjectorModel {
    pub name: String,
    pub provider: String,
    pub input_cost_per_token: f64,
    pub output_cost_per_token: f64,
    pub cache_read_input_token_cost: f64,
    pub cache_creation_input_token_cost: f64,
}
```

- [ ] **Step 2: Store LiteLLM models in `PricingConfig`**

Add a `litellm_models` field to `PricingConfig` and populate it in `load()`:

```rust
use crate::litellm;

#[derive(Clone)]
pub struct PricingConfig {
    pub subscriptions: HashMap<String, Subscription>,
    pub models: Vec<ConfigModelPrice>,
    pub litellm_models: Vec<litellm::LitellmModel>,
}
```

In `PricingConfig::load()`:

```rust
let litellm_models = litellm::load_litellm_models();
PricingConfig {
    subscriptions: subs,
    models,
    litellm_models,
}
```

- [ ] **Step 3: Update `price_for()` to fall back to LiteLLM data**

After checking user-configured models, try LiteLLM:

```rust
fn price_for(&self, model: &str) -> Option<ModelPrice> {
    let m = model.to_lowercase();
    // 1. Check user config + built-in patterns
    for config_model in &self.models {
        if m.contains(&config_model.match_pattern) || m.starts_with(&config_model.match_pattern) {
            return Some(config_model.price.clone());
        }
    }
    // 2. Fall back to LiteLLM data
    for lm in &self.litellm_models {
        if m.contains(&lm.name) || lm.name.contains(&m) {
            return Some(ModelPrice {
                input_cost_per_token: lm.input_cost_per_token,
                output_cost_per_token: lm.output_cost_per_token,
                cache_read_input_token_cost: lm.cache_read_input_token_cost,
                cache_creation_input_token_cost: lm.cache_creation_input_token_cost,
            });
        }
    }
    None
}
```

- [ ] **Step 4: Implement `all_models()`**

Returns all LiteLLM models with config overrides applied:

```rust
fn all_models(&self) -> Vec<ProjectorModel> {
    let mut result: Vec<ProjectorModel> = self
        .litellm_models
        .iter()
        .map(|lm| ProjectorModel {
            name: lm.name.clone(),
            provider: lm.provider.clone(),
            input_cost_per_token: lm.input_cost_per_token,
            output_cost_per_token: lm.output_cost_per_token,
            cache_read_input_token_cost: lm.cache_read_input_token_cost,
            cache_creation_input_token_cost: lm.cache_creation_input_token_cost,
        })
        .collect();

    // Apply config overrides
    for cm in &self.models {
        if let Some(existing) = result.iter_mut().find(|m| m.name.contains(&cm.match_pattern)) {
            existing.input_cost_per_token = cm.price.input_cost_per_token;
            existing.output_cost_per_token = cm.price.output_cost_per_token;
            existing.cache_read_input_token_cost = cm.price.cache_read_input_token_cost;
            existing.cache_creation_input_token_cost = cm.price.cache_creation_input_token_cost;
        }
    }

    result
}
```

- [ ] **Step 5: Update `MockPricing` in `cost.rs` tests**

Add the new `all_models()` method to the mock:

```rust
fn all_models(&self) -> Vec<crate::pricing::ProjectorModel> {
    vec![]
}
```

- [ ] **Step 6: Run tests**

```bash
cargo test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/pricing.rs src/litellm.rs src/analytics/cost.rs
git commit -m "feat: integrate LiteLLM pricing into PricingProvider with all_models()"
```

---

### Task 4: Add backend projector API endpoints

**Files:**
- Create: `src/analytics/projector.rs`
- Modify: `src/analytics/mod.rs` (add `mod projector;` and `pub use projector::*;`)
- Modify: `src/server.rs` (add two routes)

- [ ] **Step 1: Create `src/analytics/projector.rs`**

```rust
use std::collections::HashMap;

use serde::Serialize;

use crate::pricing::{self, PricingProvider};
use crate::schema::Session;

use super::{local_date, round2};

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    pub period: PeriodRange,
    pub by_model: Vec<ModelUsage>,
    pub totals: UsageTotals,
}

#[derive(Debug, Serialize)]
pub struct PeriodRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModelUsage {
    pub model: String,
    pub tool: String,
    pub sessions: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub actual_cost: f64,
    pub equivalent_api_cost: f64,
}

#[derive(Debug, Serialize)]
pub struct UsageTotals {
    pub with_cache: TokenBreakdown,
    pub without_cache: TokenBreakdownSimple,
}

#[derive(Debug, Serialize)]
pub struct TokenBreakdown {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
}

#[derive(Debug, Serialize)]
pub struct TokenBreakdownSimple {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

pub fn usage_summary(sessions: &[Session], pricing: &dyn PricingProvider) -> UsageSummary {
    // Track per-model token totals and session sets
    struct Accum {
        sessions: std::collections::HashSet<String>,
        input: u64,
        output: u64,
        thinking: u64,
        cache_read: u64,
        cache_write: u64,
    }

    let mut by_model: HashMap<(String, String), Accum> = HashMap::new();

    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m
                .model
                .as_deref()
                .or(s.model.as_deref())
                .unwrap_or("unknown")
                .to_string();
            let acc = by_model
                .entry((model, tool.clone()))
                .or_insert_with(|| Accum {
                    sessions: std::collections::HashSet::new(),
                    input: 0,
                    output: 0,
                    thinking: 0,
                    cache_read: 0,
                    cache_write: 0,
                });
            acc.sessions.insert(s.id.clone());
            if let Some(t) = &m.tokens {
                acc.input += t.input.unwrap_or(0);
                acc.output += t.output.unwrap_or(0);
                acc.thinking += t.thinking.unwrap_or(0);
                acc.cache_read += t.cache_read.unwrap_or(0);
                acc.cache_write += t.cache_write.unwrap_or(0);
            }
        }
    }

    let mut models: Vec<ModelUsage> = Vec::new();
    let mut total_input = 0u64;
    let mut total_output = 0u64;
    let mut total_thinking = 0u64;
    let mut total_cache_read = 0u64;
    let mut total_cache_write = 0u64;

    for ((model, tool), acc) in by_model {
        let equiv = pricing
            .price_for(&model)
            .map(|p| pricing::calculate_cost(&p, acc.input, acc.output, acc.thinking, acc.cache_read, acc.cache_write))
            .unwrap_or(0.0);

        let actual = if let Some(sub) = pricing.subscription_for(&tool) {
            // For subscription tools, use a proportional share based on tokens
            // This is a rough approximation — the actual subscription cost is flat
            sub.monthly_usd
        } else {
            equiv
        };

        total_input += acc.input;
        total_output += acc.output;
        total_thinking += acc.thinking;
        total_cache_read += acc.cache_read;
        total_cache_write += acc.cache_write;

        models.push(ModelUsage {
            model,
            tool,
            sessions: acc.sessions.len(),
            input_tokens: acc.input,
            output_tokens: acc.output,
            thinking_tokens: acc.thinking,
            cache_read_tokens: acc.cache_read,
            cache_write_tokens: acc.cache_write,
            actual_cost: round2(actual),
            equivalent_api_cost: round2(equiv),
        });
    }

    models.sort_by(|a, b| {
        b.equivalent_api_cost
            .partial_cmp(&a.equivalent_api_cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Determine period
    let dates: Vec<String> = sessions.iter().map(|s| local_date(&s.start_time)).collect();
    let from = dates.iter().min().cloned();
    let to = dates.iter().max().cloned();

    UsageSummary {
        period: PeriodRange { from, to },
        by_model: models,
        totals: UsageTotals {
            with_cache: TokenBreakdown {
                input_tokens: total_input,
                output_tokens: total_output,
                thinking_tokens: total_thinking,
                cache_read_tokens: total_cache_read,
                cache_write_tokens: total_cache_write,
            },
            without_cache: TokenBreakdownSimple {
                input_tokens: total_input + total_cache_read + total_cache_write,
                output_tokens: total_output + total_thinking,
            },
        },
    }
}
```

- [ ] **Step 2: Register the module in `src/analytics/mod.rs`**

Add at the top with other module declarations:

```rust
mod projector;
```

And in the pub use section:

```rust
pub use projector::*;
```

- [ ] **Step 3: Add API handlers in `src/server.rs`**

Add two handler functions:

```rust
async fn api_projector_models(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let models = state.pricing.all_models();
    Json(serde_json::json!({ "models": models }))
}

async fn api_projector_usage_summary(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::usage_summary(&sessions, state.pricing.as_ref())).unwrap())
}
```

Register the routes in the `serve()` function's router, alongside existing routes:

```rust
.route("/api/projector/models", get(api_projector_models))
.route("/api/projector/usage-summary", get(api_projector_usage_summary))
```

- [ ] **Step 4: Run tests and verify compilation**

```bash
cargo test
cargo check
```

Expected: all tests pass, no compilation errors.

- [ ] **Step 5: Commit**

```bash
git add src/analytics/projector.rs src/analytics/mod.rs src/server.rs
git commit -m "feat: add projector API endpoints for models and usage summary"
```

---

### Task 5: Update CI workflow to fetch LiteLLM pricing

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add curl step before cargo build**

In `.github/workflows/release.yml`, add this step after "Build frontend" and before "Build binary":

```yaml
      - name: Fetch model pricing data
        run: |
          curl -sSfL -o model_prices.json \
            "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: fetch LiteLLM pricing data before build"
```

---

### Task 6: Add `react-router-dom` and set up client-side routing

**Files:**
- Modify: `web/package.json` (add react-router-dom)
- Modify: `web/src/App.tsx` (wrap in BrowserRouter, add routes)
- Create: `web/src/pages/dashboard.tsx` (extract existing dashboard)
- Create: `web/src/pages/projector.tsx` (placeholder)

- [ ] **Step 1: Install react-router-dom**

```bash
cd web && npm install react-router-dom && cd ..
```

- [ ] **Step 2: Create `web/src/pages/dashboard.tsx`**

Extract the `Dashboard` component and its helpers from `App.tsx` into this new file. Move everything except the `App` export:

```tsx
// web/src/pages/dashboard.tsx
import { useMemo } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import type { DateRange } from "@/lib/api";
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
  TREND_WINDOWS,
  TOOL_LENS_VALUES,
  type ToolLens,
  type TrendWindow,
} from "@/components/dashboard-shell";
import { SectionNav } from "@/components/section-nav";
import { fmtNum } from "@/lib/formatters";
import { TOOL_NAMES, type Tool } from "@/lib/tools";
import type { Summary } from "@/types";

// Copy DashboardFallback, ErrorBanner, trendWindowToDateRange, fmt,
// filterToolCounts, getDailySummaryMetrics, and Dashboard functions
// exactly as they are in the current App.tsx.

// ... (all the functions from current App.tsx)

export default function DashboardPage() {
  return <Dashboard />;
}
```

This is a direct extraction — no logic changes.

- [ ] **Step 3: Create `web/src/pages/projector.tsx` (placeholder)**

```tsx
// web/src/pages/projector.tsx
export default function ProjectorPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Usage Projector
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Project your usage onto other models' pricing.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `web/src/App.tsx` with router**

```tsx
// web/src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "@/pages/dashboard";
import ProjectorPage from "@/pages/projector";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projector" element={<ProjectorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Add navigation link to `DashboardHeader`**

In `web/src/components/dashboard-shell.tsx`, add a link to the projector page in the header. Import `Link` from `react-router-dom` and add next to the title:

```tsx
import { Link } from "react-router-dom";
```

Inside `DashboardHeader`, after the `<CardDescription>` closing tag, add:

```tsx
<div className="mt-3">
  <Link
    to="/projector"
    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
  >
    Usage Projector →
  </Link>
</div>
```

- [ ] **Step 6: Build frontend and verify**

```bash
cd web && npm run build && cd ..
```

Expected: builds successfully.

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/package-lock.json web/src/App.tsx web/src/pages/ web/src/components/dashboard-shell.tsx
git commit -m "feat: add react-router and projector page shell"
```

---

### Task 7: Build the projector data hooks and types

**Files:**
- Create: `web/src/types/projector.ts`
- Create: `web/src/hooks/use-projector-data.ts`
- Modify: `web/src/types.ts` (re-export projector types)

- [ ] **Step 1: Create `web/src/types/projector.ts`**

```tsx
// web/src/types/projector.ts
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
```

- [ ] **Step 2: Create `web/src/hooks/use-projector-data.ts`**

```tsx
// web/src/hooks/use-projector-data.ts
import { useState, useEffect, useRef } from "react";
import type { ProjectorModelsResponse, UsageSummary } from "@/types/projector";
import type { DateRange } from "@/lib/api";

export function useProjectorData(dateRange?: DateRange) {
  const [models, setModels] = useState<ProjectorModelsResponse | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const hasData = useRef(false);

  const rangeKey = `${dateRange?.from ?? ""}_${dateRange?.to ?? ""}`;

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const signal = controller.signal;

    const qs = dateRange
      ? Object.entries(dateRange)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
          .join("&")
      : "";
    const suffix = qs ? `?${qs}` : "";

    Promise.allSettled([
      fetch("/api/projector/models", { signal }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ProjectorModelsResponse>;
      }),
      fetch(`/api/projector/usage-summary${suffix}`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<UsageSummary>;
      }),
    ]).then(([modelsResult, usageResult]) => {
      if (signal.aborted) return;
      const errs: string[] = [];
      if (modelsResult.status === "fulfilled") setModels(modelsResult.value);
      else errs.push(`Models: ${modelsResult.reason}`);
      if (usageResult.status === "fulfilled") setUsage(usageResult.value);
      else errs.push(`Usage: ${usageResult.reason}`);
      setErrors(errs);
      setLoading(false);
      hasData.current = true;
    });

    return () => controller.abort();
  }, [rangeKey]);

  return { models, usage, loading, errors, initialLoad: loading && !hasData.current };
}
```

- [ ] **Step 3: Build and verify**

```bash
cd web && npx tsc --noEmit && cd ..
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/types/projector.ts web/src/hooks/use-projector-data.ts
git commit -m "feat: add projector TypeScript types and data hook"
```

---

### Task 8: Build the projector calculation utilities

**Files:**
- Create: `web/src/lib/projector-calc.ts`

- [ ] **Step 1: Create `web/src/lib/projector-calc.ts`**

Pure functions for projecting costs. No React dependencies.

```tsx
// web/src/lib/projector-calc.ts
import type { ProjectorModel, TokenBreakdown, TokenBreakdownSimple } from "@/types/projector";

export interface ProjectionResult {
  model: string;
  provider: string;
  cost_with_cache: number;
  cost_without_cache: number;
}

/** Calculate the cost of a token breakdown against a model's pricing (with cache). */
function costWithCache(model: ProjectorModel, tokens: TokenBreakdown): number {
  return (
    tokens.input_tokens * model.input_cost_per_token +
    (tokens.output_tokens + tokens.thinking_tokens) * model.output_cost_per_token +
    tokens.cache_read_tokens * model.cache_read_input_token_cost +
    tokens.cache_write_tokens * model.cache_creation_input_token_cost
  );
}

/** Calculate the cost without cache (all tokens as raw input/output). */
function costWithoutCache(model: ProjectorModel, tokens: TokenBreakdownSimple): number {
  return (
    tokens.input_tokens * model.input_cost_per_token +
    tokens.output_tokens * model.output_cost_per_token
  );
}

/** Project a token usage onto all models, returning sorted results. */
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

/** Build token breakdowns from manual calculator inputs. */
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
```

- [ ] **Step 2: Verify types**

```bash
cd web && npx tsc --noEmit && cd ..
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/projector-calc.ts
git commit -m "feat: add projector cost calculation utilities"
```

---

### Task 9: Build the Historical Projection section

**Files:**
- Create: `web/src/components/projector/projection-table.tsx`
- Create: `web/src/components/projector/projection-chart.tsx`
- Modify: `web/src/pages/projector.tsx`

- [ ] **Step 1: Create `web/src/components/projector/projection-table.tsx`**

```tsx
// web/src/components/projector/projection-table.tsx
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtUsd } from "@/lib/formatters";
import type { ProjectionResult } from "@/lib/projector-calc";

interface Props {
  data: ProjectionResult[];
  currentModels: string[];
  currentCost: number;
}

export function ProjectionTable({ data, currentModels, currentCost }: Props) {
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const providers = useMemo(() => {
    const set = new Set(data.map((d) => d.provider));
    return ["all", ...Array.from(set).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    if (providerFilter === "all") return data;
    return data.filter((d) => d.provider === providerFilter);
  }, [data, providerFilter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Model Cost Comparison</CardTitle>
        <CardDescription>Projected cost if you used each model</CardDescription>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {providers.map((p) => (
            <Button
              key={p}
              type="button"
              size="xs"
              variant={providerFilter === p ? "default" : "outline"}
              className={providerFilter === p ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
              onClick={() => setProviderFilter(p)}
            >
              {p === "all" ? "All" : p}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium">Provider</th>
                <th className="pb-2 pr-4 font-medium text-right">With Cache</th>
                <th className="pb-2 pr-4 font-medium text-right">No Cache</th>
                <th className="pb-2 font-medium text-right">vs Actual</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isCurrent = currentModels.some(
                  (m) => row.model.includes(m) || m.includes(row.model),
                );
                const diff =
                  currentCost > 0
                    ? ((row.cost_without_cache - currentCost) / currentCost) * 100
                    : 0;
                return (
                  <tr
                    key={row.model}
                    className={`border-b last:border-0 ${isCurrent ? "bg-sky-50" : ""}`}
                  >
                    <td className="py-2 pr-4 font-medium">
                      {row.model}
                      {isCurrent && (
                        <span className="ml-1.5 text-[10px] font-semibold text-sky-700">
                          CURRENT
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{row.provider}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(row.cost_with_cache)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(row.cost_without_cache)}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-slate-500"}`}>
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `web/src/components/projector/projection-chart.tsx`**

```tsx
// web/src/components/projector/projection-chart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtUsd } from "@/lib/formatters";
import type { ProjectionResult } from "@/lib/projector-calc";

const config = {
  cost_with_cache: { label: "With Cache", color: "hsl(221 83% 53%)" },
  cost_without_cache: { label: "No Cache", color: "hsl(25 95% 53%)" },
} satisfies ChartConfig;

interface Props {
  data: ProjectionResult[];
  currentModels: string[];
  limit?: number;
}

export function ProjectionChart({ data, currentModels, limit = 15 }: Props) {
  const top = data.slice(0, limit).map((d) => ({
    ...d,
    model: d.model.replace(/-\d{8}$/, "").slice(0, 24),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost Projection</CardTitle>
        <CardDescription>Top {limit} models by cost (lower is cheaper)</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[400px] w-full">
          <BarChart data={top} layout="vertical" accessibilityLayer margin={{ left: 10 }}>
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="model"
              type="category"
              width={160}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <XAxis
              type="number"
              tickFormatter={(v: number) => fmtUsd(v)}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend />
            <Bar
              dataKey="cost_with_cache"
              fill="var(--color-cost_with_cache)"
              radius={[0, 4, 4, 0]}
              minPointSize={2}
            />
            <Bar
              dataKey="cost_without_cache"
              fill="var(--color-cost_without_cache)"
              radius={[0, 4, 4, 0]}
              minPointSize={2}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Update `web/src/pages/projector.tsx` with historical projection section**

```tsx
// web/src/pages/projector.tsx
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useProjectorData } from "@/hooks/use-projector-data";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { projectUsage } from "@/lib/projector-calc";
import { ProjectionTable } from "@/components/projector/projection-table";
import { ProjectionChart } from "@/components/projector/projection-chart";
import { Button } from "@/components/ui/button";
import type { DateRange } from "@/lib/api";

const TREND_WINDOWS = ["7day", "14day", "30day", "90day", "all"] as const;
type TrendWindow = (typeof TREND_WINDOWS)[number];

function trendWindowToDateRange(window: TrendWindow): DateRange | undefined {
  if (window === "all") return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = fmt(today);
  const cutoff = new Date(today);
  const days = window === "7day" ? 7 : window === "14day" ? 14 : window === "30day" ? 30 : 90;
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return { from: fmt(cutoff), to };
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ProjectorPage() {
  const [trendWindow, setTrendWindow] = useSearchParamState<TrendWindow>("window", "30day", TREND_WINDOWS);
  const dateRange = useMemo(() => trendWindowToDateRange(trendWindow), [trendWindow]);
  const { models, usage, loading, errors, initialLoad } = useProjectorData(dateRange);

  const projection = useMemo(() => {
    if (!models || !usage) return null;
    return projectUsage(models.models, usage.totals.with_cache, usage.totals.without_cache);
  }, [models, usage]);

  const currentModels = useMemo(() => {
    if (!usage) return [];
    return usage.by_model.map((m) => m.model);
  }, [usage]);

  const currentCost = useMemo(() => {
    if (!usage) return 0;
    return usage.by_model.reduce((sum, m) => sum + m.equivalent_api_cost, 0);
  }, [usage]);

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Usage Projector
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Project your usage onto other models' pricing.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            ← Dashboard
          </Link>
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errors.join("; ")}
          </div>
        )}

        {/* Period selector */}
        <div className="flex flex-wrap gap-1.5">
          {TREND_WINDOWS.map((w) => (
            <Button
              key={w}
              type="button"
              size="xs"
              variant={trendWindow === w ? "default" : "outline"}
              className={trendWindow === w ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
              onClick={() => setTrendWindow(w)}
            >
              {w === "all" ? "All" : w.toUpperCase()}
            </Button>
          ))}
        </div>

        {/* Historical Projection */}
        {projection && (
          <section className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                Historical Projection
              </p>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                What if you used a different model?
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ProjectionTable
                data={projection}
                currentModels={currentModels}
                currentCost={currentCost}
              />
              <ProjectionChart
                data={projection}
                currentModels={currentModels}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build and verify**

```bash
cd web && npx tsc --noEmit && npm run build && cd ..
```

Expected: compiles and builds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/projector/ web/src/pages/projector.tsx
git commit -m "feat: add historical projection section with table and chart"
```

---

### Task 10: Build the Manual Calculator section

**Files:**
- Create: `web/src/components/projector/manual-calculator.tsx`
- Modify: `web/src/pages/projector.tsx`

- [ ] **Step 1: Create `web/src/components/projector/manual-calculator.tsx`**

```tsx
// web/src/components/projector/manual-calculator.tsx
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { projectUsage, manualTokens } from "@/lib/projector-calc";
import { ProjectionTable } from "./projection-table";
import { ProjectionChart } from "./projection-chart";
import type { ProjectorModel } from "@/types/projector";

function TokenInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}

interface Props {
  models: ProjectorModel[];
}

export function ManualCalculator({ models }: Props) {
  const [input, setInput] = useState(0);
  const [output, setOutput] = useState(0);
  const [thinking, setThinking] = useState(0);
  const [cacheRead, setCacheRead] = useState(0);
  const [cacheWrite, setCacheWrite] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const projection = useMemo(() => {
    const total = input + output + thinking + cacheRead + cacheWrite;
    if (total === 0) return null;
    const { withCache, withoutCache } = manualTokens(input, output, thinking, cacheRead, cacheWrite);
    return projectUsage(models, withCache, withoutCache);
  }, [models, input, output, thinking, cacheRead, cacheWrite]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
          Calculator
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          Manual Cost Estimator
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token Input</CardTitle>
          <CardDescription>Enter token counts to see projected costs across models</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TokenInput label="Input Tokens" value={input} onChange={setInput} />
            <TokenInput label="Output Tokens" value={output} onChange={setOutput} />
          </div>

          {showAdvanced && (
            <div className="grid gap-4 sm:grid-cols-3">
              <TokenInput label="Thinking Tokens" value={thinking} onChange={setThinking} />
              <TokenInput label="Cache Read Tokens" value={cacheRead} onChange={setCacheRead} />
              <TokenInput label="Cache Write Tokens" value={cacheWrite} onChange={setCacheWrite} />
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-500"
          >
            {showAdvanced ? "Hide Advanced ▲" : "Advanced ▼"}
          </Button>
        </CardContent>
      </Card>

      {projection && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ProjectionTable data={projection} currentModels={[]} currentCost={0} />
          <ProjectionChart data={projection} currentModels={[]} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add ManualCalculator to `web/src/pages/projector.tsx`**

Import and add after the Historical Projection section:

```tsx
import { ManualCalculator } from "@/components/projector/manual-calculator";
```

Add in the JSX, after the historical projection `</section>` and before the closing `</div>`:

```tsx
{models && (
  <ManualCalculator models={models.models} />
)}
```

- [ ] **Step 3: Build and verify**

```bash
cd web && npx tsc --noEmit && npm run build && cd ..
```

Expected: compiles and builds.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/projector/manual-calculator.tsx web/src/pages/projector.tsx
git commit -m "feat: add manual token calculator with real-time projection"
```

---

### Task 11: Build the Model Price Reference table

**Files:**
- Create: `web/src/components/projector/price-reference.tsx`
- Modify: `web/src/pages/projector.tsx`

- [ ] **Step 1: Create `web/src/components/projector/price-reference.tsx`**

```tsx
// web/src/components/projector/price-reference.tsx
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ProjectorModel } from "@/types/projector";

function fmtPrice(perToken: number): string {
  const perMillion = perToken * 1_000_000;
  if (perMillion >= 1) return `$${perMillion.toFixed(2)}`;
  if (perMillion >= 0.01) return `$${perMillion.toFixed(4)}`;
  return `$${perMillion.toFixed(6)}`;
}

type SortKey = "name" | "provider" | "input" | "output" | "cache_read" | "cache_write";

interface Props {
  models: ProjectorModel[];
}

export function PriceReference({ models }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("input");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "provider": cmp = a.provider.localeCompare(b.provider); break;
        case "input": cmp = a.input_cost_per_token - b.input_cost_per_token; break;
        case "output": cmp = a.output_cost_per_token - b.output_cost_per_token; break;
        case "cache_read": cmp = a.cache_read_input_token_cost - b.cache_read_input_token_cost; break;
        case "cache_write": cmp = a.cache_creation_input_token_cost - b.cache_creation_input_token_cost; break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [models, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortAsc ? " ↑" : " ↓") : "");

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
          Reference
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950 hover:text-slate-700"
        >
          Model Price Table
          <span className="text-sm text-slate-400">{open ? "▲" : "▼"}</span>
        </button>
        <p className="text-[13px] text-slate-600">
          Prices per 1M tokens. Source: LiteLLM. {models.length} models available.
        </p>
      </div>

      {open && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search models…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-sm rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {filtered.length} models
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="pb-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort("name")}>
                      Model{sortIndicator("name")}
                    </th>
                    <th className="pb-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort("provider")}>
                      Provider{sortIndicator("provider")}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right cursor-pointer" onClick={() => toggleSort("input")}>
                      Input{sortIndicator("input")}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right cursor-pointer" onClick={() => toggleSort("output")}>
                      Output{sortIndicator("output")}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right cursor-pointer" onClick={() => toggleSort("cache_read")}>
                      Cache Read{sortIndicator("cache_read")}
                    </th>
                    <th className="pb-2 font-medium text-right cursor-pointer" onClick={() => toggleSort("cache_write")}>
                      Cache Write{sortIndicator("cache_write")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{m.name}</td>
                      <td className="py-2 pr-4 text-slate-500">{m.provider}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(m.input_cost_per_token)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(m.output_cost_per_token)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(m.cache_read_input_token_cost)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtPrice(m.cache_creation_input_token_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add PriceReference to `web/src/pages/projector.tsx`**

Import:
```tsx
import { PriceReference } from "@/components/projector/price-reference";
```

Add in the JSX, after the ManualCalculator section, before the closing `</div>`:

```tsx
{models && (
  <PriceReference models={models.models} />
)}
```

- [ ] **Step 3: Build and verify**

```bash
cd web && npx tsc --noEmit && npm run build && cd ..
```

Expected: compiles and builds.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/projector/price-reference.tsx web/src/pages/projector.tsx
git commit -m "feat: add collapsible model price reference table"
```

---

### Task 12: Full integration build and test

**Files:**
- No new files — verification only.

- [ ] **Step 1: Build the full Rust binary with embedded frontend**

```bash
cd web && npm run build && cd ..
cargo build
```

Expected: compiles with no errors.

- [ ] **Step 2: Run all Rust tests**

```bash
cargo test
```

Expected: all tests pass.

- [ ] **Step 3: Start the server and manually verify**

```bash
cargo run -- serve --no-browser
```

Then open `http://localhost:3000` — dashboard should load as before. Navigate to `http://localhost:3000/projector` — the projector page should render.

Verify the API endpoints:
```bash
curl -s http://localhost:3000/api/projector/models | head -c 500
curl -s http://localhost:3000/api/projector/usage-summary | head -c 500
```

Expected: both return JSON with the expected structure.

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration fixes for usage projector"
```
