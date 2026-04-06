//! Deep-analysis endpoints mined from historical session data.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use axum::{extract::State, response::Json, routing::get, Router};
use chrono::Timelike;
use serde_json::json;

use crate::schema::Role;
use crate::server::{collect_sessions, AppState};

// ── Helpers ─────────────────────────────────────────────────────────

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

fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF |
        0x20000..=0x2A6DF | 0x2A700..=0x2B73F | 0x2B740..=0x2B81F |
        0x3000..=0x303F | 0xFF00..=0xFFEF
    )
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

// ── API handlers ────────────────────────────────────────────────────

/// GET /api/insights/conversations — depth histogram, prompt/response length stats
async fn conversations(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut depths: Vec<usize> = sessions.iter().map(|s| s.messages.len()).collect();
    depths.sort();

    let buckets = [("1-5", 1, 6), ("6-10", 6, 11), ("11-20", 11, 21),
        ("21-50", 21, 51), ("51-100", 51, 101), ("101-200", 101, 201), ("200+", 201, usize::MAX)];
    let depth_histogram: Vec<serde_json::Value> = buckets.iter()
        .map(|(label, lo, hi)| json!({"bucket": label, "count": depths.iter().filter(|d| **d >= *lo && **d < *hi).count()}))
        .collect();

    let mut prompt_lens: Vec<usize> = sessions.iter().flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::User).map(|m| m.content.len()).collect();
    prompt_lens.sort();

    let mut response_lens: Vec<usize> = sessions.iter().flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::Assistant).map(|m| m.content.len()).collect();
    response_lens.sort();

    let avg = |v: &[usize]| if v.is_empty() { 0.0 } else { v.iter().sum::<usize>() as f64 / v.len() as f64 };

    Json(json!({
        "depth": { "histogram": depth_histogram, "avg": avg(&depths), "median": median(&depths), "total_sessions": depths.len() },
        "prompt_length": { "avg_chars": avg(&prompt_lens) as u64, "median_chars": median(&prompt_lens) as u64, "total": prompt_lens.len() },
        "response_length": { "avg_chars": avg(&response_lens) as u64, "median_chars": median(&response_lens) as u64, "total": response_lens.len() },
    }))
}

/// GET /api/insights/cache-efficiency — cache hit rates by tool and model
async fn cache_efficiency(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut by_tool: HashMap<String, (u64, u64, u64)> = HashMap::new();
    let mut by_model: HashMap<String, (u64, u64, u64)> = HashMap::new();

    for s in &sessions {
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

    let to_json = |stats: HashMap<String, (u64, u64, u64)>| -> Vec<serde_json::Value> {
        let mut r: Vec<_> = stats.into_iter().map(|(name, (inp, cr, cw))| {
            let total = inp + cr;
            let hit_rate = if total > 0 { cr as f64 / total as f64 * 100.0 } else { 0.0 };
            json!({"name": name, "input_tokens": inp, "cache_read_tokens": cr, "cache_write_tokens": cw, "hit_rate_pct": (hit_rate * 10.0).round() / 10.0 })
        }).collect();
        r.sort_by(|a, b| b["cache_read_tokens"].as_u64().cmp(&a["cache_read_tokens"].as_u64()));
        r
    };

    Json(json!({ "by_tool": to_json(by_tool), "by_model": to_json(by_model) }))
}

/// GET /api/insights/thinking — thinking token ratio by model
async fn thinking_ratio(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut by_model: HashMap<String, (u64, u64)> = HashMap::new();
    for s in &sessions {
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

    let mut result: Vec<serde_json::Value> = by_model.into_iter()
        .filter(|(_, (_, think))| *think > 0)
        .map(|(model, (out, think))| {
            let ratio = think as f64 / (out + think) as f64 * 100.0;
            json!({"model": model, "output_tokens": out, "thinking_tokens": think, "thinking_pct": (ratio * 10.0).round() / 10.0 })
        }).collect();
    result.sort_by(|a, b| b["thinking_tokens"].as_u64().cmp(&a["thinking_tokens"].as_u64()));
    Json(json!(result))
}

/// GET /api/insights/toolchains — common tool call sequences + file type distribution
async fn toolchains(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut bigrams: HashMap<String, usize> = HashMap::new();
    let mut file_exts: HashMap<String, usize> = HashMap::new();

    for s in &sessions {
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

    let mut chains: Vec<serde_json::Value> = bigrams.into_iter()
        .map(|(c, n)| json!({"chain": c, "count": n})).collect();
    chains.sort_by(|a, b| b["count"].as_u64().cmp(&a["count"].as_u64()));

    let mut exts: Vec<serde_json::Value> = file_exts.into_iter()
        .map(|(e, n)| json!({"extension": e, "count": n})).collect();
    exts.sort_by(|a, b| b["count"].as_u64().cmp(&a["count"].as_u64()));

    Json(json!({
        "top_chains": chains.into_iter().take(30).collect::<Vec<_>>(),
        "file_types": exts.into_iter().take(30).collect::<Vec<_>>(),
    }))
}

/// GET /api/insights/project-lifecycle — per-project weekly activity timeline
async fn project_lifecycle(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut lifecycle: HashMap<String, BTreeMap<String, usize>> = HashMap::new();
    for s in &sessions {
        let project = s.project.as_deref().unwrap_or("(unknown)").to_string();
        let week = s.start_time.format("%G-W%V").to_string();
        *lifecycle.entry(project).or_default().entry(week).or_default() += 1;
    }

    let mut projects: Vec<_> = lifecycle.into_iter().collect();
    projects.sort_by(|a, b| { let ta: usize = a.1.values().sum(); let tb: usize = b.1.values().sum(); tb.cmp(&ta) });

    let result: Vec<serde_json::Value> = projects.into_iter().take(20).map(|(name, weeks)| {
        let total: usize = weeks.values().sum();
        let timeline: Vec<serde_json::Value> = weeks.into_iter()
            .map(|(week, count)| json!({"week": week, "sessions": count})).collect();
        json!({"project": name, "total_sessions": total, "timeline": timeline })
    }).collect();

    Json(json!(result))
}

/// GET /api/insights/model-switches — sessions where model changed mid-conversation
async fn model_switches(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut switched = 0usize;
    let total = sessions.len();
    let mut switch_pairs: HashMap<String, usize> = HashMap::new();

    for s in &sessions {
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

    let mut pairs: Vec<serde_json::Value> = switch_pairs.into_iter()
        .map(|(p, n)| json!({"switch": p, "count": n})).collect();
    pairs.sort_by(|a, b| b["count"].as_u64().cmp(&a["count"].as_u64()));

    Json(json!({
        "total_sessions": total,
        "sessions_with_switch": switched,
        "switch_rate_pct": if total > 0 { (switched as f64 / total as f64 * 1000.0).round() / 10.0 } else { 0.0 },
        "top_switches": pairs.into_iter().take(15).collect::<Vec<_>>(),
    }))
}

/// GET /api/insights/languages — language detection + task classification
async fn languages(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut lang_counts: HashMap<String, usize> = HashMap::new();
    let mut task_counts: HashMap<String, usize> = HashMap::new();

    for s in &sessions {
        if let Some(msg) = s.messages.iter().find(|m| m.role == Role::User) {
            let text = &msg.content;
            let cjk = text.chars().filter(|c| is_cjk(*c)).count();
            let latin = text.chars().filter(|c| c.is_ascii_alphabetic()).count();
            let lang = if cjk > latin / 3 && cjk > 3 { "Chinese" } else { "English" };
            *lang_counts.entry(lang.to_string()).or_default() += 1;
            *task_counts.entry(classify_task(&text.to_lowercase()).to_string()).or_default() += 1;
        }
    }

    let mut langs: Vec<serde_json::Value> = lang_counts.into_iter()
        .map(|(l, n)| json!({"language": l, "sessions": n})).collect();
    langs.sort_by(|a, b| b["sessions"].as_u64().cmp(&a["sessions"].as_u64()));

    let mut tasks: Vec<serde_json::Value> = task_counts.into_iter()
        .map(|(t, n)| json!({"task": t, "sessions": n})).collect();
    tasks.sort_by(|a, b| b["sessions"].as_u64().cmp(&a["sessions"].as_u64()));

    Json(json!({ "languages": langs, "task_types": tasks }))
}

/// GET /api/insights/session-complexity — session complexity by hour of day
async fn session_complexity(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut by_hour: [(usize, usize, u64); 24] = [(0, 0, 0); 24];
    for s in &sessions {
        let hour = s.start_time.with_timezone(&chrono::Local).hour() as usize;
        by_hour[hour].0 += 1;
        by_hour[hour].1 += s.messages.len();
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                by_hour[hour].2 += t.input.unwrap_or(0) + t.output.unwrap_or(0);
            }
        }
    }

    let result: Vec<serde_json::Value> = (0..24).map(|h| {
        let (sessions, msgs, tokens) = by_hour[h];
        let avg_msgs = if sessions > 0 { msgs as f64 / sessions as f64 } else { 0.0 };
        let avg_tokens = if sessions > 0 { tokens as f64 / sessions as f64 } else { 0.0 };
        json!({"hour": h, "sessions": sessions, "total_messages": msgs,
            "avg_messages_per_session": (avg_msgs * 10.0).round() / 10.0,
            "avg_tokens_per_session": avg_tokens.round() as u64 })
    }).collect();

    Json(json!(result))
}

// ── Router ──────────────────────────────────────────────────────────

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
