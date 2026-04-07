# SOLID Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the backend to fix SOLID violations: extract analytics into a service layer, make collector paths injectable, add a collector registry, and deduplicate summary logic.

**Architecture:** Extract all data-aggregation logic from `server.rs` and `insights.rs` handlers into pure functions in a new `analytics.rs` module with typed result structs. Move collector construction into a registry in `collector/mod.rs`. Make collector source paths configurable via `with_source()` constructors.

**Tech Stack:** Rust, axum, serde, chrono

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/analytics.rs` | Create | All aggregation/analysis functions with typed result structs |
| `src/collector/mod.rs` | Modify | Add `collector_registry()` function, add `with_source()` to trait guidance |
| `src/collector/claude.rs` | Modify | Add `with_source()` constructor |
| `src/collector/gemini.rs` | Modify | Add `with_source()` constructor |
| `src/collector/codex.rs` | Modify | Add `with_source()` constructor |
| `src/collector/kimi.rs` | Modify | Add `with_source()` constructor |
| `src/server.rs` | Modify | Thin handlers — delegate to `analytics` functions |
| `src/insights.rs` | Modify | Thin handlers — delegate to `analytics` functions |
| `src/main.rs` | Modify | Use registry + analytics for `print_summary` |

---

### Task 1: Make collector source paths injectable

**Files:**
- Modify: `src/collector/claude.rs:47-58`
- Modify: `src/collector/gemini.rs:53-64`
- Modify: `src/collector/codex.rs:56-67`
- Modify: `src/collector/kimi.rs:40-51`

- [ ] **Step 1: Add `with_source()` to ClaudeCollector**

In `src/collector/claude.rs`, replace:

```rust
pub struct ClaudeCollector {
    source: PathBuf,
}

impl ClaudeCollector {
    pub fn new() -> Self {
        let home = dirs::home_dir().expect("cannot resolve home dir");
        Self {
            source: home.join(".claude/projects"),
        }
    }
}
```

with:

```rust
pub struct ClaudeCollector {
    source: PathBuf,
}

impl ClaudeCollector {
    pub fn new() -> Self {
        Self::with_source(None)
    }

    pub fn with_source(source: Option<PathBuf>) -> Self {
        let source = source.unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot resolve home dir")
                .join(".claude/projects")
        });
        Self { source }
    }
}
```

- [ ] **Step 2: Add `with_source()` to GeminiCollector**

In `src/collector/gemini.rs`, replace:

```rust
pub struct GeminiCollector {
    source: PathBuf,
}

impl GeminiCollector {
    pub fn new() -> Self {
        let home = dirs::home_dir().expect("cannot resolve home dir");
        Self {
            source: home.join(".gemini/tmp"),
        }
    }
}
```

with:

```rust
pub struct GeminiCollector {
    source: PathBuf,
}

impl GeminiCollector {
    pub fn new() -> Self {
        Self::with_source(None)
    }

    pub fn with_source(source: Option<PathBuf>) -> Self {
        let source = source.unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot resolve home dir")
                .join(".gemini/tmp")
        });
        Self { source }
    }
}
```

- [ ] **Step 3: Add `with_source()` to CodexCollector**

In `src/collector/codex.rs`, replace:

```rust
pub struct CodexCollector {
    source: PathBuf,
}

impl CodexCollector {
    pub fn new() -> Self {
        let home = dirs::home_dir().expect("cannot resolve home dir");
        Self {
            source: home.join(".codex/sessions"),
        }
    }
}
```

with:

```rust
pub struct CodexCollector {
    source: PathBuf,
}

impl CodexCollector {
    pub fn new() -> Self {
        Self::with_source(None)
    }

    pub fn with_source(source: Option<PathBuf>) -> Self {
        let source = source.unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot resolve home dir")
                .join(".codex/sessions")
        });
        Self { source }
    }
}
```

- [ ] **Step 4: Add `with_source()` to KimiCollector**

In `src/collector/kimi.rs`, replace:

```rust
pub struct KimiCollector {
    source: PathBuf,
}

impl KimiCollector {
    pub fn new() -> Self {
        let home = dirs::home_dir().expect("cannot resolve home dir");
        Self {
            source: home.join(".kimi/sessions"),
        }
    }
}
```

with:

```rust
pub struct KimiCollector {
    source: PathBuf,
}

impl KimiCollector {
    pub fn new() -> Self {
        Self::with_source(None)
    }

    pub fn with_source(source: Option<PathBuf>) -> Self {
        let source = source.unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot resolve home dir")
                .join(".kimi/sessions")
        });
        Self { source }
    }
}
```

- [ ] **Step 5: Build and verify**

Run: `cargo build 2>&1`
Expected: compiles with no errors (existing callers all use `new()` which still works)

- [ ] **Step 6: Commit**

```bash
git add src/collector/claude.rs src/collector/gemini.rs src/collector/codex.rs src/collector/kimi.rs
git commit -m "refactor: make collector source paths injectable via with_source()"
```

---

### Task 2: Add collector registry to collector/mod.rs

**Files:**
- Modify: `src/collector/mod.rs`
- Modify: `src/main.rs:96-118`

- [ ] **Step 1: Add `collector_registry()` function to `src/collector/mod.rs`**

Add this function at the end of `src/collector/mod.rs`:

```rust
/// Registry of all known collectors.
/// Returns (name, constructor) pairs. To add a new tool, add an entry here.
pub fn collector_registry() -> Vec<(&'static str, Box<dyn Collector + Send + Sync>)> {
    vec![
        ("gemini", Box::new(gemini::GeminiCollector::new())),
        ("claude", Box::new(claude::ClaudeCollector::new())),
        ("codex", Box::new(codex::CodexCollector::new())),
        ("kimi", Box::new(kimi::KimiCollector::new())),
    ]
}

/// Build collectors filtered by tool names. If `tools` is None, returns all.
pub fn build_collectors(tools: &Option<Vec<String>>) -> Vec<Box<dyn Collector + Send + Sync>> {
    let registry = collector_registry();
    match tools {
        Some(selected) => {
            let mut collectors = Vec::new();
            for name in selected {
                match registry.into_iter().find(|(n, _)| *n == name.as_str()) {
                    Some((_, c)) => collectors.push(c),
                    None => eprintln!("unknown tool: {name}"),
                }
                // rebuild registry each iteration since into_iter consumes it
            }
            // Simpler: filter from a fresh registry each time
            let mut collectors = Vec::new();
            for name in selected {
                let registry = collector_registry();
                match registry.into_iter().find(|(n, _)| *n == name.as_str()) {
                    Some((_, c)) => collectors.push(c),
                    None => eprintln!("unknown tool: {name}"),
                }
            }
            collectors
        }
        None => registry.into_iter().map(|(_, c)| c).collect(),
    }
}
```

Wait — the above has a bug with consuming the registry. Simpler approach:

```rust
/// Registry of all known collector names.
pub fn collector_names() -> &'static [&'static str] {
    &["gemini", "claude", "codex", "kimi"]
}

/// Create a collector by name. Returns None for unknown names.
pub fn create_collector(name: &str) -> Option<Box<dyn Collector + Send + Sync>> {
    match name {
        "gemini" => Some(Box::new(gemini::GeminiCollector::new())),
        "claude" => Some(Box::new(claude::ClaudeCollector::new())),
        "codex" => Some(Box::new(codex::CodexCollector::new())),
        "kimi" => Some(Box::new(kimi::KimiCollector::new())),
        _ => None,
    }
}

/// Build collectors filtered by tool names. If `tools` is None, returns all.
pub fn build_collectors(tools: &Option<Vec<String>>) -> Vec<Box<dyn Collector + Send + Sync>> {
    let names: Vec<&str> = match tools {
        Some(ts) => ts.iter().map(|s| s.as_str()).collect(),
        None => collector_names().to_vec(),
    };

    names
        .iter()
        .filter_map(|name| {
            let c = create_collector(name);
            if c.is_none() {
                eprintln!("unknown tool: {name}");
            }
            c
        })
        .collect()
}
```

- [ ] **Step 2: Update `src/main.rs` to use the registry**

Remove the `build_collectors` function from `main.rs` (lines 96-118) and the individual collector imports. Replace:

```rust
use collector::{
    claude::ClaudeCollector, codex::CodexCollector, default_data_dir, gemini::GeminiCollector,
    kimi::KimiCollector, raw_dirs_for, sync_collector, Collector,
};
```

with:

```rust
use collector::{build_collectors, default_data_dir, raw_dirs_for, sync_collector, Collector};
```

And remove the entire `fn build_collectors(...)` function body from `main.rs` since it now lives in `collector/mod.rs`.

Update `main()` — the call `let collectors = build_collectors(&cli.tools);` stays the same, it just resolves to the new location.

- [ ] **Step 3: Build and verify**

Run: `cargo build 2>&1`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src/collector/mod.rs src/main.rs
git commit -m "refactor: move collector registry to collector/mod.rs (fixes O in SOLID)"
```

---

### Task 3: Create analytics module with typed result structs

**Files:**
- Create: `src/analytics.rs`
- Modify: `src/main.rs:1` (add `mod analytics;`)

This is the largest task. We extract all aggregation logic from `server.rs` (14 handlers) and `insights.rs` (8 handlers) into pure functions that take `&[Session]` and return typed structs.

- [ ] **Step 1: Create `src/analytics.rs` with summary and shared types**

Create the file with the summary analytics (used by both `main.rs::print_summary` and `server.rs::api_summary`), plus the helper types:

```rust
use std::collections::{BTreeMap, HashMap};

use chrono::{Datelike, Local, Timelike};
use serde::Serialize;

use crate::pricing::{self, PricingProvider};
use crate::schema::{Role, Session};

// ── Shared helpers ─────────────────────────────────────────────────

pub fn sum_tokens(sessions: &[Session]) -> TokenTotals {
    let mut t = TokenTotals::default();
    for s in sessions {
        for m in &s.messages {
            if let Some(tk) = &m.tokens {
                t.input += tk.input.unwrap_or(0);
                t.output += tk.output.unwrap_or(0);
                t.thinking += tk.thinking.unwrap_or(0);
                t.cache_read += tk.cache_read.unwrap_or(0);
                t.cache_write += tk.cache_write.unwrap_or(0);
            }
        }
    }
    t
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn median(sorted: &[usize]) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        (sorted[mid - 1] + sorted[mid]) as f64 / 2.0
    } else {
        sorted[mid] as f64
    }
}

fn avg(v: &[usize]) -> f64 {
    if v.is_empty() {
        0.0
    } else {
        v.iter().sum::<usize>() as f64 / v.len() as f64
    }
}

fn percentile_u64(sorted: &[u64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = (p / 100.0 * (sorted.len() as f64 - 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)] as f64
}

fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF |
        0x20000..=0x2A6DF | 0x2A700..=0x2B73F | 0x2B740..=0x2B81F |
        0x3000..=0x303F | 0xFF00..=0xFFEF
    )
}

fn classify_task(text: &str) -> &'static str {
    let rules: &[(&[&str], &str)] = &[
        (&["fix", "bug", "error", "issue", "broken", "wrong", "fail", "crash"], "Bug Fix"),
        (&["refactor", "clean", "simplify", "reorganize", "restructure"], "Refactor"),
        (&["test", "spec", "assert", "coverage"], "Testing"),
        (&["explain", "what is", "how does", "why", "understand", "tell me"], "Explanation"),
        (&["review", "check", "look at", "audit"], "Code Review"),
        (&["add", "implement", "create", "build", "make", "write", "new feature"], "New Feature"),
        (&["update", "change", "modify", "adjust", "tweak"], "Modification"),
        (&["deploy", "release", "publish", "ship"], "Deployment"),
        (&["config", "setup", "install", "init", "configure"], "Configuration"),
        (&["read", "show", "list", "find", "search", "look up", "fetch"], "Exploration"),
        (&["修", "改", "错", "问题"], "Bug Fix"),
        (&["重构", "优化", "清理"], "Refactor"),
        (&["测试"], "Testing"),
        (&["解释", "什么", "为什么", "怎么", "帮我看"], "Explanation"),
        (&["添加", "实现", "创建", "写", "新增", "做"], "New Feature"),
        (&["更新", "修改", "调整"], "Modification"),
        (&["部署", "发布"], "Deployment"),
        (&["配置", "安装", "设置"], "Configuration"),
        (&["读", "查", "找", "搜索", "列出", "看看"], "Exploration"),
        (&["commit", "push", "pr", "merge"], "Git Operations"),
    ];
    for (keywords, category) in rules {
        if keywords.iter().any(|k| text.contains(k)) {
            return category;
        }
    }
    "Other"
}

fn extract_extensions(args: &serde_json::Value) -> Vec<String> {
    let mut exts = Vec::new();
    for key in &["file_path", "path", "pattern", "file", "glob"] {
        if let Some(v) = args.get(key).and_then(|v| v.as_str()) {
            if let Some(ext) = std::path::Path::new(v).extension() {
                exts.push(ext.to_string_lossy().to_lowercase());
            }
        }
    }
    if let Some(cmd) = args.get("command").and_then(|v| v.as_str()) {
        for token in cmd.split_whitespace() {
            if token.contains('.') && !token.starts_with('-') && !token.starts_with("http") {
                if let Some(ext) = std::path::Path::new(token).extension() {
                    let e = ext.to_string_lossy().to_lowercase();
                    if matches!(
                        e.as_str(),
                        "rs" | "py" | "js" | "ts" | "tsx" | "jsx" | "go" | "java"
                            | "rb" | "c" | "cpp" | "h" | "hpp" | "css" | "html"
                            | "json" | "yaml" | "yml" | "toml" | "md" | "sh"
                            | "sql" | "proto" | "swift" | "kt" | "vue" | "svelte"
                    ) {
                        exts.push(e);
                    }
                }
            }
        }
    }
    exts
}

// ── Result structs ─────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize)]
pub struct TokenTotals {
    pub input: u64,
    pub output: u64,
    pub thinking: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}

#[derive(Debug, Serialize)]
pub struct SummaryStats {
    pub total_sessions: usize,
    pub by_tool: HashMap<String, usize>,
    pub total_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub tokens: TokenTotals,
    pub daily: Vec<DailyStats>,
    pub top_projects: Vec<NameCount>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DailyStats {
    pub date: String,
    pub sessions: u64,
    pub messages: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Serialize)]
pub struct NameCount {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct DailyTokensByTool {
    pub date: String,
    pub by_tool: HashMap<String, TokenBreakdown>,
}

#[derive(Debug, Serialize)]
pub struct TokenBreakdown {
    pub input: u64,
    pub output: u64,
    pub thinking: u64,
}

#[derive(Debug, Serialize)]
pub struct ModelTokenStats {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub messages: usize,
}

#[derive(Debug, Serialize)]
pub struct ProjectStats {
    pub name: String,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub duration_ms: u64,
    pub tools: HashMap<String, usize>,
    pub first_seen: String,
    pub last_seen: String,
}

#[derive(Debug, Serialize)]
pub struct HostStats {
    pub hostname: String,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub tools: HashMap<String, usize>,
}

#[derive(Debug, Serialize)]
pub struct DurationStats {
    pub daily: Vec<DailyDuration>,
    pub by_project: Vec<ProjectDuration>,
}

#[derive(Debug, Serialize)]
pub struct DailyDuration {
    pub date: String,
    pub duration_ms: u64,
    pub duration_min: f64,
}

#[derive(Debug, Serialize)]
pub struct ProjectDuration {
    pub project: String,
    pub duration_ms: u64,
    pub duration_min: f64,
}

#[derive(Debug, Serialize)]
pub struct HeatmapCell {
    pub day: &'static str,
    pub day_index: usize,
    pub hour: usize,
    pub count: u64,
}

#[derive(Debug, Serialize)]
pub struct LatencyStats {
    pub overall: PercentileStats,
    pub by_model: Vec<ModelLatency>,
    pub histogram: Vec<BucketCount>,
}

#[derive(Debug, Serialize)]
pub struct PercentileStats {
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub avg: f64,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ModelLatency {
    pub model: String,
    #[serde(flatten)]
    pub stats: PercentileStats,
}

#[derive(Debug, Serialize)]
pub struct BucketCount {
    pub bucket: &'static str,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ToolStatusStats {
    pub name: String,
    pub total: usize,
    pub success: usize,
    pub error: usize,
}

#[derive(Debug, Serialize)]
pub struct GitRepoStats {
    pub repo: String,
    pub branches: Vec<String>,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub last_seen: String,
}

#[derive(Debug, Serialize)]
pub struct DirectoryStats {
    pub directory: String,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub tools: HashMap<String, usize>,
}

// ── Insights result structs ────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConversationInsights {
    pub depth_histogram: Vec<BucketCount>,
    pub depth_avg: f64,
    pub depth_median: f64,
    pub total_sessions: usize,
    pub prompt_avg_chars: u64,
    pub prompt_median_chars: u64,
    pub prompt_total: usize,
    pub response_avg_chars: u64,
    pub response_median_chars: u64,
    pub response_total: usize,
}

#[derive(Debug, Serialize)]
pub struct CacheEntry {
    pub name: String,
    pub input_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub hit_rate_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct CacheEfficiency {
    pub by_tool: Vec<CacheEntry>,
    pub by_model: Vec<CacheEntry>,
}

#[derive(Debug, Serialize)]
pub struct ThinkingEntry {
    pub model: String,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub thinking_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct ToolchainInsights {
    pub top_chains: Vec<ChainCount>,
    pub file_types: Vec<ExtCount>,
}

#[derive(Debug, Serialize)]
pub struct ChainCount {
    pub chain: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ExtCount {
    pub extension: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ProjectLifecycleEntry {
    pub project: String,
    pub total_sessions: usize,
    pub timeline: Vec<WeekCount>,
}

#[derive(Debug, Serialize)]
pub struct WeekCount {
    pub week: String,
    pub sessions: usize,
}

#[derive(Debug, Serialize)]
pub struct ModelSwitchInsights {
    pub total_sessions: usize,
    pub sessions_with_switch: usize,
    pub switch_rate_pct: f64,
    pub top_switches: Vec<SwitchCount>,
}

#[derive(Debug, Serialize)]
pub struct SwitchCount {
    pub switch: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct LanguageInsights {
    pub languages: Vec<LangCount>,
    pub task_types: Vec<TaskCount>,
}

#[derive(Debug, Serialize)]
pub struct LangCount {
    pub language: String,
    pub sessions: usize,
}

#[derive(Debug, Serialize)]
pub struct TaskCount {
    pub task: String,
    pub sessions: usize,
}

#[derive(Debug, Serialize)]
pub struct HourlyComplexity {
    pub hour: usize,
    pub sessions: usize,
    pub total_messages: usize,
    pub avg_messages_per_session: f64,
    pub avg_tokens_per_session: u64,
}

// ── Cost result structs ────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CostBreakdown {
    pub equivalent_api_cost_usd: f64,
    pub actual_cost_usd: f64,
    pub saved_usd: f64,
    pub by_model: Vec<ModelCost>,
    pub by_tool: HashMap<String, ToolCost>,
    pub daily: Vec<DailyCost>,
}

#[derive(Debug, Serialize)]
pub struct ModelCost {
    pub model: String,
    pub tool: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub equivalent_api_cost_usd: f64,
    pub is_subscription: bool,
}

#[derive(Debug, Serialize)]
pub struct ToolCost {
    pub equivalent_api_cost_usd: f64,
    pub actual_cost_usd: f64,
    pub saved_usd: f64,
    pub subscription: Option<SubscriptionInfo>,
}

#[derive(Debug, Serialize)]
pub struct SubscriptionInfo {
    pub plan: String,
    pub monthly_usd: f64,
    pub months: f64,
}

#[derive(Debug, Serialize)]
pub struct DailyCost {
    pub date: String,
    pub equivalent_api_cost_usd: f64,
}

// ── Analytics functions ────────────────────────────────────────────

pub fn summary(sessions: &[Session]) -> SummaryStats {
    let mut by_tool: HashMap<String, usize> = HashMap::new();
    for s in sessions {
        *by_tool.entry(s.tool.to_string()).or_default() += 1;
    }

    let total_messages: usize = sessions.iter().map(|s| s.messages.len()).sum();
    let user_messages: usize = sessions.iter().flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::User).count();
    let assistant_messages: usize = sessions.iter().flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::Assistant).count();

    let tokens = sum_tokens(sessions);

    let mut daily_map: BTreeMap<String, DailyStats> = BTreeMap::new();
    for s in sessions {
        let day = s.start_time.format("%Y-%m-%d").to_string();
        let entry = daily_map.entry(day.clone()).or_insert_with(|| DailyStats {
            date: day, sessions: 0, messages: 0, input_tokens: 0, output_tokens: 0,
        });
        entry.sessions += 1;
        entry.messages += s.messages.len() as u64;
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }

    let mut project_counts: HashMap<String, usize> = HashMap::new();
    for s in sessions {
        let key = format!("[{}] {}", s.tool, s.project.as_deref().unwrap_or("(unknown)"));
        *project_counts.entry(key).or_default() += 1;
    }
    let mut top_projects: Vec<NameCount> = project_counts
        .into_iter()
        .map(|(name, count)| NameCount { name, count })
        .collect();
    top_projects.sort_by(|a, b| b.count.cmp(&a.count));
    top_projects.truncate(20);

    SummaryStats {
        total_sessions: sessions.len(),
        by_tool,
        total_messages,
        user_messages,
        assistant_messages,
        tokens,
        daily: daily_map.into_values().collect(),
        top_projects,
        period_start: sessions.first().map(|s| s.start_time.format("%Y-%m-%d").to_string()),
        period_end: sessions.last().map(|s| s.start_time.format("%Y-%m-%d").to_string()),
    }
}

pub fn daily_tokens(sessions: &[Session]) -> Vec<DailyTokensByTool> {
    let mut daily: BTreeMap<String, HashMap<String, TokenBreakdown>> = BTreeMap::new();
    for s in sessions {
        let day = s.start_time.format("%Y-%m-%d").to_string();
        let tool = s.tool.to_string();
        let entry = daily.entry(day).or_default().entry(tool).or_insert_with(|| TokenBreakdown { input: 0, output: 0, thinking: 0 });
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input += t.input.unwrap_or(0);
                entry.output += t.output.unwrap_or(0);
                entry.thinking += t.thinking.unwrap_or(0);
            }
        }
    }
    daily.into_iter().map(|(date, by_tool)| DailyTokensByTool { date, by_tool }).collect()
}

pub fn tokens_by_model(sessions: &[Session]) -> Vec<ModelTokenStats> {
    let mut models: HashMap<String, (u64, u64, u64, usize)> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown").to_string();
            let entry = models.entry(model).or_default();
            if let Some(t) = &m.tokens {
                entry.0 += t.input.unwrap_or(0);
                entry.1 += t.output.unwrap_or(0);
                entry.2 += t.thinking.unwrap_or(0);
            }
            entry.3 += 1;
        }
    }
    let mut result: Vec<ModelTokenStats> = models.into_iter()
        .map(|(model, (inp, out, think, msgs))| ModelTokenStats {
            model, input_tokens: inp, output_tokens: out, thinking_tokens: think, messages: msgs,
        }).collect();
    result.sort_by(|a, b| (b.input_tokens + b.output_tokens + b.thinking_tokens).cmp(&(a.input_tokens + a.output_tokens + a.thinking_tokens)));
    result
}

pub fn tools_usage(sessions: &[Session]) -> Vec<NameCount> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            for tc in &m.tool_calls {
                *counts.entry(tc.name.clone()).or_default() += 1;
            }
        }
    }
    let mut result: Vec<NameCount> = counts.into_iter().map(|(name, count)| NameCount { name, count }).collect();
    result.sort_by(|a, b| b.count.cmp(&a.count));
    result
}

pub fn projects(sessions: &[Session]) -> Vec<ProjectStats> {
    let mut map: HashMap<String, ProjectStats> = HashMap::new();
    for s in sessions {
        let key = s.project.as_deref().unwrap_or("(unknown)").to_string();
        let day = s.start_time.format("%Y-%m-%d").to_string();
        let entry = map.entry(key.clone()).or_insert_with(|| ProjectStats {
            name: key, sessions: 0, messages: 0, input_tokens: 0, output_tokens: 0,
            duration_ms: 0, tools: HashMap::new(), first_seen: day.clone(), last_seen: day.clone(),
        });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        entry.duration_ms += s.duration_ms.unwrap_or(0);
        *entry.tools.entry(s.tool.to_string()).or_default() += 1;
        if day < entry.first_seen { entry.first_seen = day.clone(); }
        if day > entry.last_seen { entry.last_seen = day; }
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }
    let mut result: Vec<ProjectStats> = map.into_values().collect();
    result.sort_by(|a, b| b.sessions.cmp(&a.sessions));
    result
}

pub fn duration(sessions: &[Session]) -> DurationStats {
    let mut daily: BTreeMap<String, u64> = BTreeMap::new();
    let mut by_project: HashMap<String, u64> = HashMap::new();
    for s in sessions {
        let dur = s.duration_ms.unwrap_or(0);
        if dur == 0 { continue; }
        let day = s.start_time.format("%Y-%m-%d").to_string();
        *daily.entry(day).or_default() += dur;
        let proj = s.project.as_deref().unwrap_or("(unknown)").to_string();
        *by_project.entry(proj).or_default() += dur;
    }
    let daily = daily.into_iter().map(|(date, ms)| DailyDuration { date, duration_ms: ms, duration_min: ms as f64 / 60000.0 }).collect();
    let mut by_project: Vec<ProjectDuration> = by_project.into_iter()
        .map(|(project, ms)| ProjectDuration { project, duration_ms: ms, duration_min: ms as f64 / 60000.0 }).collect();
    by_project.sort_by(|a, b| b.duration_ms.cmp(&a.duration_ms));
    DurationStats { daily, by_project }
}

pub fn activity_heatmap(sessions: &[Session]) -> Vec<HeatmapCell> {
    let mut grid = [[0u64; 24]; 7];
    for s in sessions {
        let local = s.start_time.with_timezone(&Local);
        let weekday = local.weekday().num_days_from_monday() as usize;
        let hour = local.hour() as usize;
        grid[weekday][hour] += 1;
    }
    let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let mut result = Vec::new();
    for (d, day_name) in days.iter().enumerate() {
        for h in 0..24 {
            if grid[d][h] > 0 {
                result.push(HeatmapCell { day: day_name, day_index: d, hour: h, count: grid[d][h] });
            }
        }
    }
    result
}

pub fn cost_breakdown(sessions: &[Session], pricing: &dyn PricingProvider) -> CostBreakdown {
    let mut by_model_map: HashMap<String, (u64, u64, u64, u64, u64, String)> = HashMap::new();
    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown").to_string();
            let entry = by_model_map.entry(model).or_insert_with(|| (0, 0, 0, 0, 0, tool.clone()));
            if let Some(t) = &m.tokens {
                entry.0 += t.input.unwrap_or(0);
                entry.1 += t.output.unwrap_or(0);
                entry.2 += t.thinking.unwrap_or(0);
                entry.3 += t.cache_read.unwrap_or(0);
                entry.4 += t.cache_write.unwrap_or(0);
            }
        }
    }

    let mut total_equiv = 0.0f64;
    let mut by_model: Vec<ModelCost> = Vec::new();
    for (model, (inp, out, think, cr, cw, tool)) in &by_model_map {
        let equiv = pricing.price_for(model)
            .map(|p| pricing::calculate_cost(&p, *inp, *out, *think, *cr, *cw))
            .unwrap_or(0.0);
        total_equiv += equiv;
        by_model.push(ModelCost {
            model: model.clone(), tool: tool.clone(),
            input_tokens: *inp, output_tokens: *out, thinking_tokens: *think,
            cache_read_tokens: *cr, cache_write_tokens: *cw,
            equivalent_api_cost_usd: round2(equiv),
            is_subscription: pricing.is_subscription(tool),
        });
    }
    by_model.sort_by(|a, b| b.equivalent_api_cost_usd.partial_cmp(&a.equivalent_api_cost_usd).unwrap_or(std::cmp::Ordering::Equal));

    let mut tool_equiv: HashMap<String, f64> = HashMap::new();
    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing.price_for(model)
                    .map(|p| pricing::calculate_cost(&p,
                        t.input.unwrap_or(0), t.output.unwrap_or(0),
                        t.thinking.unwrap_or(0), t.cache_read.unwrap_or(0),
                        t.cache_write.unwrap_or(0)))
                    .unwrap_or(0.0);
                *tool_equiv.entry(tool.clone()).or_default() += cost;
            }
        }
    }

    let mut tool_first: HashMap<String, String> = HashMap::new();
    let mut tool_last: HashMap<String, String> = HashMap::new();
    for s in sessions {
        let tool = s.tool.to_string();
        let day = s.start_time.format("%Y-%m-%d").to_string();
        tool_first.entry(tool.clone()).or_insert_with(|| day.clone());
        tool_last.insert(tool.clone(), day);
        tool_equiv.entry(tool).or_insert(0.0);
    }

    let mut total_actual = 0.0f64;
    let mut total_saved = 0.0f64;
    let mut by_tool: HashMap<String, ToolCost> = HashMap::new();
    for (tool, equiv) in tool_equiv {
        let (actual, sub_info) = if let Some(sub) = pricing.subscription_for(&tool) {
            let first = tool_first.get(&tool).cloned().unwrap_or_default();
            let last = tool_last.get(&tool).cloned().unwrap_or_default();
            let months = pricing.subscription_months(&tool, &first, &last);
            let sub_cost = months * sub.monthly_usd;
            (sub_cost, Some(SubscriptionInfo { plan: sub.plan.clone(), monthly_usd: sub.monthly_usd, months }))
        } else {
            (equiv, None)
        };
        total_actual += actual;
        let saved = equiv - actual;
        if saved > 0.0 { total_saved += saved; }
        by_tool.insert(tool, ToolCost {
            equivalent_api_cost_usd: round2(equiv),
            actual_cost_usd: round2(actual),
            saved_usd: round2(saved),
            subscription: sub_info,
        });
    }

    let mut daily_map: BTreeMap<String, f64> = BTreeMap::new();
    for s in sessions {
        let day = s.start_time.format("%Y-%m-%d").to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing.price_for(model)
                    .map(|p| pricing::calculate_cost(&p,
                        t.input.unwrap_or(0), t.output.unwrap_or(0),
                        t.thinking.unwrap_or(0), t.cache_read.unwrap_or(0),
                        t.cache_write.unwrap_or(0)))
                    .unwrap_or(0.0);
                *daily_map.entry(day.clone()).or_default() += cost;
            }
        }
    }
    let daily = daily_map.into_iter()
        .map(|(date, cost)| DailyCost { date, equivalent_api_cost_usd: round2(cost) }).collect();

    CostBreakdown {
        equivalent_api_cost_usd: round2(total_equiv),
        actual_cost_usd: round2(total_actual),
        saved_usd: round2(total_saved),
        by_model, by_tool, daily,
    }
}

pub fn messages_latency(sessions: &[Session]) -> LatencyStats {
    let mut all_durations: Vec<u64> = Vec::new();
    let mut by_model: HashMap<String, Vec<u64>> = HashMap::new();

    for s in sessions {
        for m in &s.messages {
            if m.role != Role::Assistant { continue; }
            if let Some(dur) = m.duration_ms {
                all_durations.push(dur);
                let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown").to_string();
                by_model.entry(model).or_default().push(dur);
            }
        }
    }

    fn compute_stats(durations: &mut Vec<u64>) -> PercentileStats {
        durations.sort();
        let count = durations.len();
        let avg = if count > 0 { durations.iter().sum::<u64>() as f64 / count as f64 } else { 0.0 };
        PercentileStats {
            p50: percentile_u64(durations, 50.0),
            p95: percentile_u64(durations, 95.0),
            p99: percentile_u64(durations, 99.0),
            avg: (avg * 100.0).round() / 100.0,
            count,
        }
    }

    let overall = compute_stats(&mut all_durations);

    let mut model_stats: Vec<ModelLatency> = by_model.into_iter()
        .map(|(model, mut durs)| ModelLatency { model: model.clone(), stats: compute_stats(&mut durs) })
        .collect();
    model_stats.sort_by(|a, b| b.stats.count.cmp(&a.stats.count));

    let buckets: &[(&str, u64, u64)] = &[
        ("0-1s", 0, 1000), ("1-3s", 1000, 3000), ("3-5s", 3000, 5000),
        ("5-10s", 5000, 10000), ("10-30s", 10000, 30000), ("30s+", 30000, u64::MAX),
    ];
    let histogram = buckets.iter()
        .map(|(bucket, lo, hi)| BucketCount { bucket, count: all_durations.iter().filter(|d| **d >= *lo && **d < *hi).count() })
        .collect();

    LatencyStats { overall, by_model: model_stats, histogram }
}

pub fn tools_status(sessions: &[Session]) -> Vec<ToolStatusStats> {
    let mut map: HashMap<String, (usize, usize, usize)> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            for tc in &m.tool_calls {
                let entry = map.entry(tc.name.clone()).or_default();
                entry.0 += 1;
                match tc.status.as_deref() {
                    Some("error") => entry.2 += 1,
                    _ => entry.1 += 1,
                }
            }
        }
    }
    let mut result: Vec<ToolStatusStats> = map.into_iter()
        .map(|(name, (total, success, error))| ToolStatusStats { name, total, success, error }).collect();
    result.sort_by(|a, b| b.total.cmp(&a.total));
    result
}

pub fn git_activity(sessions: &[Session]) -> Vec<GitRepoStats> {
    let mut repos: HashMap<String, GitRepoStats> = HashMap::new();
    for s in sessions {
        let git = match &s.git { Some(g) => g, None => continue };
        let repo_key = match git.repo_url.as_deref().or(git.branch.as_deref()) {
            Some(k) => k.to_string(), None => continue,
        };
        let day = s.start_time.format("%Y-%m-%d").to_string();
        let entry = repos.entry(repo_key.clone()).or_insert_with(|| GitRepoStats {
            repo: repo_key, branches: Vec::new(), sessions: 0, messages: 0,
            input_tokens: 0, output_tokens: 0, last_seen: day.clone(),
        });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        if day > entry.last_seen { entry.last_seen = day; }
        if let Some(ref branch) = git.branch {
            if !entry.branches.contains(branch) {
                entry.branches.push(branch.clone());
            }
        }
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }
    let mut result: Vec<GitRepoStats> = repos.into_values().collect();
    result.sort_by(|a, b| b.sessions.cmp(&a.sessions));
    result
}

pub fn directories(sessions: &[Session]) -> Vec<DirectoryStats> {
    let home = dirs::home_dir().unwrap_or_default();
    let home_str = home.to_string_lossy().to_string();

    let mut map: HashMap<String, DirectoryStats> = HashMap::new();
    for s in sessions {
        let cwd = match &s.cwd {
            Some(c) => {
                if c.starts_with(&home_str) {
                    format!("~{}", &c[home_str.len()..])
                } else {
                    c.clone()
                }
            }
            None => continue,
        };
        let entry = map.entry(cwd.clone()).or_insert_with(|| DirectoryStats {
            directory: cwd, sessions: 0, messages: 0, input_tokens: 0, output_tokens: 0, tools: HashMap::new(),
        });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        *entry.tools.entry(s.tool.to_string()).or_default() += 1;
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }
    let mut result: Vec<DirectoryStats> = map.into_values().collect();
    result.sort_by(|a, b| b.sessions.cmp(&a.sessions));
    result
}

// ── Insights analytics functions ───────────────────────────────────

pub fn conversation_insights(sessions: &[Session]) -> ConversationInsights {
    let mut depths: Vec<usize> = sessions.iter().map(|s| s.messages.len()).collect();
    depths.sort();

    let buckets: &[(&str, usize, usize)] = &[
        ("1-5", 1, 6), ("6-10", 6, 11), ("11-20", 11, 21),
        ("21-50", 21, 51), ("51-100", 51, 101), ("101-200", 101, 201), ("200+", 201, usize::MAX),
    ];
    let depth_histogram = buckets.iter()
        .map(|(bucket, lo, hi)| BucketCount { bucket, count: depths.iter().filter(|d| **d >= *lo && **d < *hi).count() })
        .collect();

    let mut prompt_lens: Vec<usize> = sessions.iter().flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::User).map(|m| m.content.len()).collect();
    prompt_lens.sort();
    let mut response_lens: Vec<usize> = sessions.iter().flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::Assistant).map(|m| m.content.len()).collect();
    response_lens.sort();

    ConversationInsights {
        depth_histogram,
        depth_avg: avg(&depths),
        depth_median: median(&depths),
        total_sessions: depths.len(),
        prompt_avg_chars: avg(&prompt_lens) as u64,
        prompt_median_chars: median(&prompt_lens) as u64,
        prompt_total: prompt_lens.len(),
        response_avg_chars: avg(&response_lens) as u64,
        response_median_chars: median(&response_lens) as u64,
        response_total: response_lens.len(),
    }
}

pub fn cache_efficiency(sessions: &[Session]) -> CacheEfficiency {
    let mut by_tool: HashMap<String, (u64, u64, u64)> = HashMap::new();
    let mut by_model: HashMap<String, (u64, u64, u64)> = HashMap::new();

    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                let inp = t.input.unwrap_or(0);
                let cr = t.cache_read.unwrap_or(0);
                let cw = t.cache_write.unwrap_or(0);
                if inp + cr == 0 { continue; }
                let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown").to_string();
                let te = by_tool.entry(tool.clone()).or_default();
                te.0 += inp; te.1 += cr; te.2 += cw;
                let me = by_model.entry(model).or_default();
                me.0 += inp; me.1 += cr; me.2 += cw;
            }
        }
    }

    let to_entries = |stats: HashMap<String, (u64, u64, u64)>| -> Vec<CacheEntry> {
        let mut r: Vec<CacheEntry> = stats.into_iter().map(|(name, (inp, cr, cw))| {
            let total = inp + cr;
            let hit_rate = if total > 0 { cr as f64 / total as f64 * 100.0 } else { 0.0 };
            CacheEntry { name, input_tokens: inp, cache_read_tokens: cr, cache_write_tokens: cw, hit_rate_pct: (hit_rate * 10.0).round() / 10.0 }
        }).collect();
        r.sort_by(|a, b| b.cache_read_tokens.cmp(&a.cache_read_tokens));
        r
    };

    CacheEfficiency { by_tool: to_entries(by_tool), by_model: to_entries(by_model) }
}

pub fn thinking_ratio(sessions: &[Session]) -> Vec<ThinkingEntry> {
    let mut by_model: HashMap<String, (u64, u64)> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                let out = t.output.unwrap_or(0);
                let think = t.thinking.unwrap_or(0);
                if out + think == 0 { continue; }
                let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown").to_string();
                let e = by_model.entry(model).or_default();
                e.0 += out; e.1 += think;
            }
        }
    }
    let mut result: Vec<ThinkingEntry> = by_model.into_iter()
        .filter(|(_, (_, think))| *think > 0)
        .map(|(model, (out, think))| {
            let ratio = think as f64 / (out + think) as f64 * 100.0;
            ThinkingEntry { model, output_tokens: out, thinking_tokens: think, thinking_pct: (ratio * 10.0).round() / 10.0 }
        }).collect();
    result.sort_by(|a, b| b.thinking_tokens.cmp(&a.thinking_tokens));
    result
}

pub fn toolchain_insights(sessions: &[Session]) -> ToolchainInsights {
    let mut bigrams: HashMap<String, usize> = HashMap::new();
    let mut file_exts: HashMap<String, usize> = HashMap::new();

    for s in sessions {
        let names: Vec<&str> = s.messages.iter().flat_map(|m| m.tool_calls.iter()).map(|tc| tc.name.as_str()).collect();
        for pair in names.windows(2) {
            *bigrams.entry(format!("{} -> {}", pair[0], pair[1])).or_default() += 1;
        }
        for m in &s.messages {
            for tc in &m.tool_calls {
                if let Some(ref args) = tc.args {
                    for ext in extract_extensions(args) {
                        *file_exts.entry(ext).or_default() += 1;
                    }
                }
            }
        }
    }

    let mut top_chains: Vec<ChainCount> = bigrams.into_iter()
        .map(|(chain, count)| ChainCount { chain, count }).collect();
    top_chains.sort_by(|a, b| b.count.cmp(&a.count));
    top_chains.truncate(30);

    let mut file_types: Vec<ExtCount> = file_exts.into_iter()
        .map(|(extension, count)| ExtCount { extension, count }).collect();
    file_types.sort_by(|a, b| b.count.cmp(&a.count));
    file_types.truncate(30);

    ToolchainInsights { top_chains, file_types }
}

pub fn project_lifecycle(sessions: &[Session]) -> Vec<ProjectLifecycleEntry> {
    let mut lifecycle: HashMap<String, BTreeMap<String, usize>> = HashMap::new();
    for s in sessions {
        let project = s.project.as_deref().unwrap_or("(unknown)").to_string();
        let week = s.start_time.format("%G-W%V").to_string();
        *lifecycle.entry(project).or_default().entry(week).or_default() += 1;
    }
    let mut projects: Vec<_> = lifecycle.into_iter().collect();
    projects.sort_by(|a, b| {
        let ta: usize = a.1.values().sum();
        let tb: usize = b.1.values().sum();
        tb.cmp(&ta)
    });
    projects.into_iter().take(20).map(|(name, weeks)| {
        let total_sessions: usize = weeks.values().sum();
        let timeline = weeks.into_iter().map(|(week, sessions)| WeekCount { week, sessions }).collect();
        ProjectLifecycleEntry { project: name, total_sessions, timeline }
    }).collect()
}

pub fn model_switches(sessions: &[Session]) -> ModelSwitchInsights {
    let mut switched = 0usize;
    let total = sessions.len();
    let mut switch_pairs: HashMap<String, usize> = HashMap::new();

    for s in sessions {
        let models: Vec<&str> = s.messages.iter().filter(|m| m.role == Role::Assistant)
            .filter_map(|m| m.model.as_deref()).collect();
        let mut prev: Option<&str> = None;
        let mut did_switch = false;
        for model in &models {
            if let Some(p) = prev {
                if p != *model {
                    did_switch = true;
                    *switch_pairs.entry(format!("{} -> {}", p, model)).or_default() += 1;
                }
            }
            prev = Some(model);
        }
        if did_switch { switched += 1; }
    }

    let mut top_switches: Vec<SwitchCount> = switch_pairs.into_iter()
        .map(|(switch, count)| SwitchCount { switch, count }).collect();
    top_switches.sort_by(|a, b| b.count.cmp(&a.count));
    top_switches.truncate(15);

    ModelSwitchInsights {
        total_sessions: total,
        sessions_with_switch: switched,
        switch_rate_pct: if total > 0 { (switched as f64 / total as f64 * 1000.0).round() / 10.0 } else { 0.0 },
        top_switches,
    }
}

pub fn language_insights(sessions: &[Session]) -> LanguageInsights {
    let mut lang_counts: HashMap<String, usize> = HashMap::new();
    let mut task_counts: HashMap<String, usize> = HashMap::new();

    for s in sessions {
        if let Some(msg) = s.messages.iter().find(|m| m.role == Role::User) {
            let text = &msg.content;
            let cjk = text.chars().filter(|c| is_cjk(*c)).count();
            let latin = text.chars().filter(|c| c.is_ascii_alphabetic()).count();
            let lang = if cjk > latin / 3 && cjk > 3 { "Chinese" } else { "English" };
            *lang_counts.entry(lang.to_string()).or_default() += 1;
            *task_counts.entry(classify_task(&text.to_lowercase()).to_string()).or_default() += 1;
        }
    }

    let mut languages: Vec<LangCount> = lang_counts.into_iter()
        .map(|(language, sessions)| LangCount { language, sessions }).collect();
    languages.sort_by(|a, b| b.sessions.cmp(&a.sessions));

    let mut task_types: Vec<TaskCount> = task_counts.into_iter()
        .map(|(task, sessions)| TaskCount { task, sessions }).collect();
    task_types.sort_by(|a, b| b.sessions.cmp(&a.sessions));

    LanguageInsights { languages, task_types }
}

pub fn session_complexity(sessions: &[Session]) -> Vec<HourlyComplexity> {
    let mut by_hour: [(usize, usize, u64); 24] = [(0, 0, 0); 24];
    for s in sessions {
        let hour = s.start_time.with_timezone(&Local).hour() as usize;
        by_hour[hour].0 += 1;
        by_hour[hour].1 += s.messages.len();
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                by_hour[hour].2 += t.input.unwrap_or(0) + t.output.unwrap_or(0);
            }
        }
    }
    (0..24).map(|h| {
        let (sessions, msgs, tokens) = by_hour[h];
        let avg_msgs = if sessions > 0 { msgs as f64 / sessions as f64 } else { 0.0 };
        let avg_tokens = if sessions > 0 { tokens as f64 / sessions as f64 } else { 0.0 };
        HourlyComplexity {
            hour: h, sessions, total_messages: msgs,
            avg_messages_per_session: (avg_msgs * 10.0).round() / 10.0,
            avg_tokens_per_session: avg_tokens.round() as u64,
        }
    }).collect()
}
```

- [ ] **Step 2: Register the module in `src/main.rs`**

Add `mod analytics;` after the existing module declarations (after `mod server;`).

- [ ] **Step 3: Build and verify**

Run: `cargo build 2>&1`
Expected: compiles with no errors (nothing uses analytics yet, but it must compile)

- [ ] **Step 4: Commit**

```bash
git add src/analytics.rs src/main.rs
git commit -m "refactor: add analytics module with typed structs and pure functions"
```

---

### Task 4: Rewrite server.rs handlers to use analytics

**Files:**
- Modify: `src/server.rs`
- Modify: `src/query.rs` (remove `sum_tokens` and `round2` — now in analytics)

- [ ] **Step 1: Remove `sum_tokens` and `round2` from `src/query.rs`**

Delete the `sum_tokens` function (lines 76-94) and the `round2` function (lines 146-148) from `query.rs`.

- [ ] **Step 2: Rewrite `src/server.rs` handlers**

Replace the entire `server.rs` with thin handlers. Each handler: (1) fetches sessions, (2) optionally filters, (3) calls an analytics function, (4) serializes with `Json(serde_json::json!(...))`.

The new `server.rs` structure:

```rust
use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use rust_embed::Embed;
use tower_http::cors::CorsLayer;

use crate::analytics;
use crate::query::{collect_sessions, filter_sessions, paginate, AppState, SessionFilter};

#[derive(Embed)]
#[folder = "web/dist"]
struct Asset;

async fn api_sessions(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SessionFilter>,
) -> Json<serde_json::Value> {
    let sessions = filter_sessions(collect_sessions(&state).await, &q);
    let total = sessions.len();
    let sessions = paginate(sessions, &q);
    Json(serde_json::json!({
        "total": total,
        "offset": q.offset.unwrap_or(0),
        "count": sessions.len(),
        "sessions": sessions,
    }))
}

async fn api_summary(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::summary(&sessions)).unwrap())
}

async fn api_tokens_daily(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::daily_tokens(&sessions)).unwrap())
}

async fn api_tokens_by_model(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::tokens_by_model(&sessions)).unwrap())
}

async fn api_tools_usage(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::tools_usage(&sessions)).unwrap())
}

async fn api_projects(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::projects(&sessions)).unwrap())
}

async fn api_hosts(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    let mut hosts = Vec::new();
    let raw_root = state.data_dir.join("raw");
    if let Ok(entries) = std::fs::read_dir(&raw_root) {
        for entry in entries.flatten() {
            let host_name = entry.file_name().to_string_lossy().to_string();
            let host_path = entry.path();
            if !host_path.is_dir() { continue; }
            let mut host_sessions = Vec::new();
            for c in &state.collectors {
                let tool_dir = host_path.join(c.name());
                if tool_dir.is_dir() {
                    if let Ok(ss) = c.parse(&tool_dir) {
                        host_sessions.extend(ss);
                    }
                }
            }
            let tokens = analytics::sum_tokens(&host_sessions);
            let mut tools: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
            for s in &host_sessions {
                *tools.entry(s.tool.to_string()).or_default() += 1;
            }
            hosts.push(serde_json::json!({
                "hostname": host_name,
                "sessions": host_sessions.len(),
                "messages": host_sessions.iter().map(|s| s.messages.len()).sum::<usize>(),
                "input_tokens": tokens.input,
                "output_tokens": tokens.output,
                "tools": tools,
            }));
        }
    }
    hosts.sort_by(|a, b| b["sessions"].as_u64().cmp(&a["sessions"].as_u64()));
    Json(serde_json::json!(hosts))
}

async fn api_duration(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::duration(&sessions)).unwrap())
}

async fn api_activity_heatmap(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::activity_heatmap(&sessions)).unwrap())
}

async fn api_cost(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::cost_breakdown(&sessions, state.pricing.as_ref())).unwrap())
}

async fn api_messages_latency(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::messages_latency(&sessions)).unwrap())
}

async fn api_tools_status(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::tools_status(&sessions)).unwrap())
}

async fn api_git_activity(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::git_activity(&sessions)).unwrap())
}

async fn api_directories(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::directories(&sessions)).unwrap())
}

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    match Asset::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (StatusCode::OK, [(header::CONTENT_TYPE, mime.as_ref().to_string())], content.data.to_vec()).into_response()
        }
        None => match Asset::get("index.html") {
            Some(content) => (StatusCode::OK, [(header::CONTENT_TYPE, "text/html".to_string())], content.data.to_vec()).into_response(),
            None => (StatusCode::NOT_FOUND, "Not found").into_response(),
        },
    }
}

pub async fn serve(state: AppState, port: u16) -> anyhow::Result<()> {
    let state = Arc::new(state);
    let app = Router::new()
        .route("/api/sessions", get(api_sessions))
        .route("/api/summary", get(api_summary))
        .route("/api/tokens/daily", get(api_tokens_daily))
        .route("/api/tokens/by-model", get(api_tokens_by_model))
        .route("/api/tools/usage", get(api_tools_usage))
        .route("/api/projects", get(api_projects))
        .route("/api/hosts", get(api_hosts))
        .route("/api/duration", get(api_duration))
        .route("/api/activity/heatmap", get(api_activity_heatmap))
        .route("/api/cost", get(api_cost))
        .route("/api/messages/latency", get(api_messages_latency))
        .route("/api/tools/status", get(api_tools_status))
        .route("/api/git/activity", get(api_git_activity))
        .route("/api/directories", get(api_directories))
        .merge(crate::insights::router())
        .layer(CorsLayer::permissive())
        .fallback(static_handler)
        .with_state(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    eprintln!("Dashboard: http://localhost:{port}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

- [ ] **Step 3: Build and verify**

Run: `cargo build 2>&1`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src/server.rs src/query.rs
git commit -m "refactor: thin server.rs handlers to use analytics layer (fixes S in SOLID)"
```

---

### Task 5: Rewrite insights.rs handlers to use analytics

**Files:**
- Modify: `src/insights.rs`

- [ ] **Step 1: Rewrite `src/insights.rs`**

Replace the entire file with thin handlers that delegate to analytics:

```rust
use std::sync::Arc;

use axum::{extract::State, response::Json, routing::get, Router};

use crate::analytics;
use crate::query::{collect_sessions, AppState};

async fn conversations(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::conversation_insights(&sessions)).unwrap())
}

async fn cache_efficiency(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::cache_efficiency(&sessions)).unwrap())
}

async fn thinking_ratio(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::thinking_ratio(&sessions)).unwrap())
}

async fn toolchains(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::toolchain_insights(&sessions)).unwrap())
}

async fn project_lifecycle(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::project_lifecycle(&sessions)).unwrap())
}

async fn model_switches(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::model_switches(&sessions)).unwrap())
}

async fn languages(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::language_insights(&sessions)).unwrap())
}

async fn session_complexity(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    Json(serde_json::to_value(analytics::session_complexity(&sessions)).unwrap())
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/insights/conversations", get(conversations))
        .route("/api/insights/cache-efficiency", get(cache_efficiency))
        .route("/api/insights/thinking", get(thinking_ratio))
        .route("/api/insights/toolchains", get(toolchains))
        .route("/api/insights/project-lifecycle", get(project_lifecycle))
        .route("/api/insights/model-switches", get(model_switches))
        .route("/api/insights/languages", get(languages))
        .route("/api/insights/session-complexity", get(session_complexity))
}
```

- [ ] **Step 2: Build and verify**

Run: `cargo build 2>&1`
Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add src/insights.rs
git commit -m "refactor: thin insights.rs handlers to use analytics layer"
```

---

### Task 6: Deduplicate print_summary in main.rs

**Files:**
- Modify: `src/main.rs`

- [ ] **Step 1: Replace `print_summary` with analytics-based version**

Replace the entire `print_summary` function in `main.rs` with:

```rust
fn print_summary(sessions: &[schema::Session]) {
    let stats = analytics::summary(sessions);

    let tool_str = {
        let mut parts: Vec<_> = stats.by_tool.iter().collect();
        parts.sort_by_key(|(k, _)| k.clone());
        parts.iter().map(|(name, count)| format!("{name}: {count}")).collect::<Vec<_>>().join(", ")
    };

    println!("=== Usage Summary ===");
    println!("Sessions:  {} ({tool_str})", stats.total_sessions);
    println!("Messages:  {} (user: {}, assistant: {})", stats.total_messages, stats.user_messages, stats.assistant_messages);
    println!("Tokens:    input: {}, output: {}", stats.tokens.input, stats.tokens.output);

    if let (Some(start), Some(end)) = (&stats.period_start, &stats.period_end) {
        println!("Period:    {start} — {end}");
    }

    println!("\nTop projects:");
    for p in stats.top_projects.iter().take(15) {
        println!("  {:>4}  {}", p.count, p.name);
    }
}
```

- [ ] **Step 2: Build and verify**

Run: `cargo build 2>&1`
Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add src/main.rs
git commit -m "refactor: deduplicate print_summary using analytics module"
```

---

### Task 7: Final build + verify JSON output compatibility

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `cargo build 2>&1`
Expected: clean compilation, no warnings

- [ ] **Step 2: Run the binary**

Run: `cargo run -- --help`
Expected: shows help text with sync/analyze/push/pull/serve subcommands

- [ ] **Step 3: Verify analytics serialization**

The analytics structs use `#[derive(Serialize)]`. The JSON output shape may differ slightly from the old hand-built `serde_json::json!()` calls (field names come from struct field names now). Review key endpoints:

- `SummaryStats` fields match old `api_summary` JSON keys
- `CostBreakdown` fields match old `api_cost` JSON keys

If any field names differ (e.g., old JSON used `"total_sessions"` but struct uses `total_sessions` — these match since serde uses field names by default), fix the struct field names.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: align analytics struct field names with existing API contracts"
```
