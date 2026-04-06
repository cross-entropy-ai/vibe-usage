use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use chrono::{Datelike, Local, Timelike};
use rust_embed::Embed;
use serde::Deserialize;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use crate::collector::{raw_dirs_for, Collector};
use crate::pricing;
use crate::schema::{Role, Session, Tool};

#[derive(Embed)]
#[folder = "web/dist"]
struct Asset;

/// Cache TTL: re-parse after this duration
const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(30);

pub(crate) struct SessionCache {
    pub sessions: Vec<Session>,
    pub updated_at: Instant,
}

pub(crate) struct AppState {
    pub collectors: Vec<Box<dyn Collector + Send + Sync>>,
    pub data_dir: PathBuf,
    pub cache: RwLock<Option<SessionCache>>,
}

// ── Helpers ─────────────────────────────────────────────────────────

fn parse_sessions(state: &AppState) -> Vec<Session> {
    let mut all = Vec::new();
    for c in &state.collectors {
        for raw_dir in raw_dirs_for(c.as_ref(), &state.data_dir) {
            if let Ok(sessions) = c.parse(&raw_dir) {
                all.extend(sessions);
            }
        }
    }
    all.sort_by_key(|s| s.start_time);
    all
}

pub(crate) async fn collect_sessions(state: &AppState) -> Vec<Session> {
    // Check cache under read lock
    {
        let cache = state.cache.read().await;
        if let Some(ref c) = *cache {
            if c.updated_at.elapsed() < CACHE_TTL {
                return c.sessions.clone();
            }
        }
    }
    // Cache miss or stale — re-parse under write lock
    let mut cache = state.cache.write().await;
    // Double-check: another request may have refreshed while we waited
    if let Some(ref c) = *cache {
        if c.updated_at.elapsed() < CACHE_TTL {
            return c.sessions.clone();
        }
    }
    let sessions = parse_sessions(state);
    *cache = Some(SessionCache {
        sessions: sessions.clone(),
        updated_at: Instant::now(),
    });
    sessions
}

/// Sum tokens across messages, returning (input, output, thinking, cache_read, cache_write).
fn sum_tokens(sessions: &[Session]) -> (u64, u64, u64, u64, u64) {
    let mut inp = 0u64;
    let mut out = 0u64;
    let mut think = 0u64;
    let mut cr = 0u64;
    let mut cw = 0u64;
    for s in sessions {
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                inp += t.input.unwrap_or(0);
                out += t.output.unwrap_or(0);
                think += t.thinking.unwrap_or(0);
                cr += t.cache_read.unwrap_or(0);
                cw += t.cache_write.unwrap_or(0);
            }
        }
    }
    (inp, out, think, cr, cw)
}

// ── Query params ────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct SessionFilter {
    tool: Option<String>,
    from: Option<String>,
    to: Option<String>,
    project: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

fn filter_sessions(sessions: Vec<Session>, q: &SessionFilter) -> Vec<Session> {
    sessions
        .into_iter()
        .filter(|s| {
            if let Some(ref tool) = q.tool {
                if s.tool.to_string() != *tool {
                    return false;
                }
            }
            if let Some(ref from) = q.from {
                if s.start_time.format("%Y-%m-%d").to_string() < *from {
                    return false;
                }
            }
            if let Some(ref to) = q.to {
                if s.start_time.format("%Y-%m-%d").to_string() > *to {
                    return false;
                }
            }
            if let Some(ref proj) = q.project {
                match &s.project {
                    Some(p) => {
                        if !p.to_lowercase().contains(&proj.to_lowercase()) {
                            return false;
                        }
                    }
                    None => return false,
                }
            }
            true
        })
        .collect()
}

fn paginate(sessions: Vec<Session>, q: &SessionFilter) -> Vec<Session> {
    let offset = q.offset.unwrap_or(0);
    let limit = q.limit.unwrap_or(sessions.len());
    sessions.into_iter().skip(offset).take(limit).collect()
}

// ── API handlers ────────────────────────────────────────────────────

/// GET /api/sessions?tool=claude&from=2026-03-01&to=2026-04-01&project=foo&limit=50&offset=0
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

/// GET /api/summary
async fn api_summary(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    let total = sessions.len();

    let by_tool =
        |tool: &Tool| sessions.iter().filter(|s| &s.tool == tool).count();

    let total_msgs: usize = sessions.iter().map(|s| s.messages.len()).sum();
    let user_msgs: usize = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::User)
        .count();
    let assistant_msgs: usize = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::Assistant)
        .count();

    let (total_input, total_output, total_thinking, total_cache_read, total_cache_write) =
        sum_tokens(&sessions);

    // Daily stats
    let mut daily: BTreeMap<String, serde_json::Value> = BTreeMap::new();
    for s in &sessions {
        let day = s.start_time.format("%Y-%m-%d").to_string();
        let entry = daily.entry(day.clone()).or_insert_with(|| {
            serde_json::json!({
                "date": day,
                "sessions": 0u64,
                "messages": 0u64,
                "input_tokens": 0u64,
                "output_tokens": 0u64,
            })
        });
        if let Some(obj) = entry.as_object_mut() {
            *obj.get_mut("sessions").unwrap() =
                serde_json::json!(obj["sessions"].as_u64().unwrap_or(0) + 1);
            *obj.get_mut("messages").unwrap() =
                serde_json::json!(obj["messages"].as_u64().unwrap_or(0) + s.messages.len() as u64);
            let inp: u64 = s.messages.iter().filter_map(|m| m.tokens.as_ref()).filter_map(|t| t.input).sum();
            let out: u64 = s.messages.iter().filter_map(|m| m.tokens.as_ref()).filter_map(|t| t.output).sum();
            *obj.get_mut("input_tokens").unwrap() =
                serde_json::json!(obj["input_tokens"].as_u64().unwrap_or(0) + inp);
            *obj.get_mut("output_tokens").unwrap() =
                serde_json::json!(obj["output_tokens"].as_u64().unwrap_or(0) + out);
        }
    }

    // Top projects
    let mut projects: HashMap<String, usize> = HashMap::new();
    for s in &sessions {
        let key = format!("[{}] {}", s.tool, s.project.as_deref().unwrap_or("(unknown)"));
        *projects.entry(key).or_default() += 1;
    }
    let mut projects: Vec<_> = projects.into_iter().collect();
    projects.sort_by(|a, b| b.1.cmp(&a.1));
    let top_projects: Vec<serde_json::Value> = projects
        .iter()
        .take(20)
        .map(|(name, count)| serde_json::json!({"name": name, "sessions": count}))
        .collect();

    Json(serde_json::json!({
        "total_sessions": total,
        "by_tool": {
            "gemini": by_tool(&Tool::Gemini),
            "claude": by_tool(&Tool::Claude),
            "codex": by_tool(&Tool::Codex),
            "kimi": by_tool(&Tool::Kimi),
        },
        "messages": {
            "total": total_msgs,
            "user": user_msgs,
            "assistant": assistant_msgs,
        },
        "tokens": {
            "input": total_input,
            "output": total_output,
            "thinking": total_thinking,
            "cache_read": total_cache_read,
            "cache_write": total_cache_write,
        },
        "daily": daily.values().collect::<Vec<_>>(),
        "top_projects": top_projects,
        "period": {
            "start": sessions.first().map(|s| s.start_time.format("%Y-%m-%d").to_string()),
            "end": sessions.last().map(|s| s.start_time.format("%Y-%m-%d").to_string()),
        }
    }))
}

/// GET /api/tokens/daily — per-day token breakdown by tool
async fn api_tokens_daily(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    // day -> tool -> {input, output, thinking}
    let mut daily: BTreeMap<String, HashMap<String, (u64, u64, u64)>> = BTreeMap::new();
    for s in &sessions {
        let day = s.start_time.format("%Y-%m-%d").to_string();
        let tool = s.tool.to_string();
        let entry = daily.entry(day).or_default().entry(tool).or_default();
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.0 += t.input.unwrap_or(0);
                entry.1 += t.output.unwrap_or(0);
                entry.2 += t.thinking.unwrap_or(0);
            }
        }
    }

    let result: Vec<serde_json::Value> = daily
        .into_iter()
        .map(|(date, tools)| {
            let by_tool: serde_json::Value = tools
                .into_iter()
                .map(|(tool, (inp, out, think))| {
                    (tool, serde_json::json!({"input": inp, "output": out, "thinking": think}))
                })
                .collect::<serde_json::Map<String, serde_json::Value>>()
                .into();
            serde_json::json!({"date": date, "by_tool": by_tool})
        })
        .collect();

    Json(serde_json::json!(result))
}

/// GET /api/tokens/by-model — aggregate tokens per model
async fn api_tokens_by_model(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut models: HashMap<String, (u64, u64, u64, usize)> = HashMap::new();
    for s in &sessions {
        for m in &s.messages {
            let model = m
                .model
                .as_deref()
                .or(s.model.as_deref())
                .unwrap_or("unknown");
            let entry = models.entry(model.to_string()).or_default();
            if let Some(t) = &m.tokens {
                entry.0 += t.input.unwrap_or(0);
                entry.1 += t.output.unwrap_or(0);
                entry.2 += t.thinking.unwrap_or(0);
            }
            entry.3 += 1;
        }
    }

    let mut result: Vec<serde_json::Value> = models
        .into_iter()
        .map(|(model, (inp, out, think, msgs))| {
            serde_json::json!({
                "model": model,
                "input_tokens": inp,
                "output_tokens": out,
                "thinking_tokens": think,
                "messages": msgs,
            })
        })
        .collect();
    result.sort_by(|a, b| {
        let total = |v: &serde_json::Value| {
            v["input_tokens"].as_u64().unwrap_or(0)
                + v["output_tokens"].as_u64().unwrap_or(0)
                + v["thinking_tokens"].as_u64().unwrap_or(0)
        };
        total(b).cmp(&total(a))
    });

    Json(serde_json::json!(result))
}

/// GET /api/tools/usage — tool_call name frequency
async fn api_tools_usage(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    let mut tool_counts: HashMap<String, usize> = HashMap::new();
    for s in &sessions {
        for m in &s.messages {
            for tc in &m.tool_calls {
                *tool_counts.entry(tc.name.clone()).or_default() += 1;
            }
        }
    }

    let mut result: Vec<serde_json::Value> = tool_counts
        .into_iter()
        .map(|(name, count)| serde_json::json!({"name": name, "count": count}))
        .collect();
    result.sort_by(|a, b| b["count"].as_u64().cmp(&a["count"].as_u64()));

    Json(serde_json::json!(result))
}

/// GET /api/projects — per-project aggregation
async fn api_projects(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    // project_key -> (sessions, messages, input_tokens, output_tokens, duration_ms, tools_set)
    struct ProjectStats {
        sessions: usize,
        messages: usize,
        input_tokens: u64,
        output_tokens: u64,
        duration_ms: u64,
        tools: HashMap<String, usize>,
        first_seen: String,
        last_seen: String,
    }

    let mut projects: HashMap<String, ProjectStats> = HashMap::new();
    for s in &sessions {
        let key = s.project.as_deref().unwrap_or("(unknown)").to_string();
        let day = s.start_time.format("%Y-%m-%d").to_string();
        let entry = projects.entry(key).or_insert_with(|| ProjectStats {
            sessions: 0,
            messages: 0,
            input_tokens: 0,
            output_tokens: 0,
            duration_ms: 0,
            tools: HashMap::new(),
            first_seen: day.clone(),
            last_seen: day.clone(),
        });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        entry.duration_ms += s.duration_ms.unwrap_or(0);
        *entry.tools.entry(s.tool.to_string()).or_default() += 1;
        if day < entry.first_seen {
            entry.first_seen = day.clone();
        }
        if day > entry.last_seen {
            entry.last_seen = day;
        }
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }

    let mut result: Vec<serde_json::Value> = projects
        .into_iter()
        .map(|(name, stats)| {
            serde_json::json!({
                "name": name,
                "sessions": stats.sessions,
                "messages": stats.messages,
                "input_tokens": stats.input_tokens,
                "output_tokens": stats.output_tokens,
                "duration_ms": stats.duration_ms,
                "tools": stats.tools,
                "first_seen": stats.first_seen,
                "last_seen": stats.last_seen,
            })
        })
        .collect();
    result.sort_by(|a, b| b["sessions"].as_u64().cmp(&a["sessions"].as_u64()));

    Json(serde_json::json!(result))
}

/// GET /api/hosts — per-hostname aggregation
async fn api_hosts(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let raw_root = state.data_dir.join("raw");
    let mut hosts: Vec<serde_json::Value> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&raw_root) {
        for entry in entries.flatten() {
            let host_name = entry.file_name().to_string_lossy().to_string();
            let host_path = entry.path();
            if !host_path.is_dir() {
                continue;
            }

            let mut sessions_count = 0usize;
            let mut messages_count = 0usize;
            let mut input_tokens = 0u64;
            let mut output_tokens = 0u64;
            let mut tools_used: HashMap<String, usize> = HashMap::new();

            for c in &state.collectors {
                let tool_dir = host_path.join(c.name());
                if tool_dir.is_dir() {
                    if let Ok(ss) = c.parse(&tool_dir) {
                        *tools_used.entry(c.name().to_string()).or_default() += ss.len();
                        sessions_count += ss.len();
                        for s in &ss {
                            messages_count += s.messages.len();
                            for m in &s.messages {
                                if let Some(t) = &m.tokens {
                                    input_tokens += t.input.unwrap_or(0);
                                    output_tokens += t.output.unwrap_or(0);
                                }
                            }
                        }
                    }
                }
            }

            hosts.push(serde_json::json!({
                "hostname": host_name,
                "sessions": sessions_count,
                "messages": messages_count,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "tools": tools_used,
            }));
        }
    }

    hosts.sort_by(|a, b| b["sessions"].as_u64().cmp(&a["sessions"].as_u64()));
    Json(serde_json::json!(hosts))
}

/// GET /api/duration — per-day and per-project duration aggregation
async fn api_duration(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    // Daily duration
    let mut daily: BTreeMap<String, u64> = BTreeMap::new();
    // Per-project duration
    let mut by_project: HashMap<String, u64> = HashMap::new();

    for s in &sessions {
        let dur = s.duration_ms.unwrap_or(0);
        if dur == 0 {
            continue;
        }
        let day = s.start_time.format("%Y-%m-%d").to_string();
        *daily.entry(day).or_default() += dur;
        let proj = s.project.as_deref().unwrap_or("(unknown)").to_string();
        *by_project.entry(proj).or_default() += dur;
    }

    let daily_result: Vec<serde_json::Value> = daily
        .into_iter()
        .map(|(date, ms)| serde_json::json!({"date": date, "duration_ms": ms, "duration_min": ms as f64 / 60000.0}))
        .collect();

    let mut project_result: Vec<serde_json::Value> = by_project
        .into_iter()
        .map(|(name, ms)| serde_json::json!({"project": name, "duration_ms": ms, "duration_min": ms as f64 / 60000.0}))
        .collect();
    project_result.sort_by(|a, b| {
        b["duration_ms"].as_u64().cmp(&a["duration_ms"].as_u64())
    });

    Json(serde_json::json!({
        "daily": daily_result,
        "by_project": project_result,
    }))
}

/// GET /api/activity/heatmap — hour × weekday session count
async fn api_activity_heatmap(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    // [weekday 0-6][hour 0-23] -> count
    let mut grid = [[0u64; 24]; 7];

    for s in &sessions {
        let local = s.start_time.with_timezone(&Local);
        let weekday = local.weekday().num_days_from_monday() as usize; // Mon=0
        let hour = local.hour() as usize;
        grid[weekday][hour] += 1;
    }

    let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let mut result: Vec<serde_json::Value> = Vec::new();
    for (d, day_name) in days.iter().enumerate() {
        for h in 0..24 {
            if grid[d][h] > 0 {
                result.push(serde_json::json!({
                    "day": day_name,
                    "day_index": d,
                    "hour": h,
                    "count": grid[d][h],
                }));
            }
        }
    }

    Json(serde_json::json!(result))
}

/// GET /api/cost — cost breakdown assuming all API pricing.
/// Shows "equivalent API cost" (what you'd pay without any plan),
/// actual subscription cost, and how much you saved.
async fn api_cost(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    let pricing_cfg = pricing::PricingConfig::load(&state.data_dir);

    // Per-model: all costs calculated at API rate
    let mut by_model: HashMap<String, (u64, u64, u64, u64, u64, String)> = HashMap::new();
    for s in &sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown").to_string();
            let entry = by_model.entry(model).or_insert_with(|| (0, 0, 0, 0, 0, tool.clone()));
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
    let mut model_costs: Vec<serde_json::Value> = Vec::new();
    for (model, (inp, out, think, cr, cw, tool)) in &by_model {
        let equiv = pricing::price_for(model)
            .map(|p| pricing::calculate_cost(&p, *inp, *out, *think, *cr, *cw))
            .unwrap_or(0.0);
        total_equiv += equiv;
        model_costs.push(serde_json::json!({
            "model": model,
            "tool": tool,
            "input_tokens": inp,
            "output_tokens": out,
            "thinking_tokens": think,
            "cache_read_tokens": cr,
            "cache_write_tokens": cw,
            "equivalent_api_cost_usd": round2(equiv),
            "is_subscription": pricing_cfg.is_subscription(tool),
        }));
    }
    model_costs.sort_by(|a, b| {
        b["equivalent_api_cost_usd"].as_f64().partial_cmp(&a["equivalent_api_cost_usd"].as_f64())
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Per-tool: equiv API cost + subscription info
    let mut tool_equiv: HashMap<String, f64> = HashMap::new();
    for s in &sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing::price_for(model)
                    .map(|p| pricing::calculate_cost(&p,
                        t.input.unwrap_or(0), t.output.unwrap_or(0),
                        t.thinking.unwrap_or(0), t.cache_read.unwrap_or(0),
                        t.cache_write.unwrap_or(0)))
                    .unwrap_or(0.0);
                *tool_equiv.entry(tool.clone()).or_default() += cost;
            }
        }
    }

    // Per-tool date ranges — also ensure every tool with sessions
    // appears in tool_equiv (even if it has zero token data)
    let mut tool_first: HashMap<String, String> = HashMap::new();
    let mut tool_last: HashMap<String, String> = HashMap::new();
    for s in &sessions {
        let tool = s.tool.to_string();
        let day = s.start_time.format("%Y-%m-%d").to_string();
        tool_first.entry(tool.clone()).or_insert_with(|| day.clone());
        tool_last.insert(tool.clone(), day);
        tool_equiv.entry(tool).or_insert(0.0);
    }

    let mut total_actual = 0.0f64;
    let mut total_saved = 0.0f64;
    let tool_result: serde_json::Value = tool_equiv
        .into_iter()
        .map(|(tool, equiv)| {
            let (actual, sub_info) = if let Some(sub) = pricing_cfg.subscriptions.get(&tool) {
                let first = tool_first.get(&tool).cloned().unwrap_or_default();
                let last = tool_last.get(&tool).cloned().unwrap_or_default();
                let months = pricing_cfg.subscription_months(&tool, &first, &last);
                let sub_cost = months * sub.monthly_usd;
                (sub_cost, Some(serde_json::json!({
                    "plan": sub.plan,
                    "monthly_usd": sub.monthly_usd,
                    "months": months,
                })))
            } else {
                (equiv, None)
            };
            total_actual += actual;
            let saved = equiv - actual;
            if saved > 0.0 { total_saved += saved; }
            (tool, serde_json::json!({
                "equivalent_api_cost_usd": round2(equiv),
                "actual_cost_usd": round2(actual),
                "saved_usd": round2(saved),
                "subscription": sub_info,
            }))
        })
        .collect::<serde_json::Map<String, serde_json::Value>>()
        .into();

    // Daily cost (at API rate, for the trend chart)
    let mut daily: BTreeMap<String, f64> = BTreeMap::new();
    for s in &sessions {
        let day = s.start_time.format("%Y-%m-%d").to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing::price_for(model)
                    .map(|p| pricing::calculate_cost(&p,
                        t.input.unwrap_or(0), t.output.unwrap_or(0),
                        t.thinking.unwrap_or(0), t.cache_read.unwrap_or(0),
                        t.cache_write.unwrap_or(0)))
                    .unwrap_or(0.0);
                *daily.entry(day.clone()).or_default() += cost;
            }
        }
    }
    let daily_result: Vec<serde_json::Value> = daily
        .into_iter()
        .map(|(date, cost)| serde_json::json!({"date": date, "equivalent_api_cost_usd": round2(cost)}))
        .collect();

    Json(serde_json::json!({
        "equivalent_api_cost_usd": round2(total_equiv),
        "actual_cost_usd": round2(total_actual),
        "saved_usd": round2(total_saved),
        "by_model": model_costs,
        "by_tool": tool_result,
        "daily": daily_result,
    }))
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// GET /api/messages/latency — percentile latency stats for assistant messages
async fn api_messages_latency(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    // Collect all assistant-message durations, optionally keyed by model
    let mut all_durations: Vec<u64> = Vec::new();
    let mut by_model: HashMap<String, Vec<u64>> = HashMap::new();

    for s in &sessions {
        for m in &s.messages {
            if m.role != Role::Assistant {
                continue;
            }
            if let Some(dur) = m.duration_ms {
                all_durations.push(dur);
                let model = m
                    .model
                    .as_deref()
                    .or(s.model.as_deref())
                    .unwrap_or("unknown")
                    .to_string();
                by_model.entry(model).or_default().push(dur);
            }
        }
    }

    fn percentile(sorted: &[u64], p: f64) -> f64 {
        if sorted.is_empty() {
            return 0.0;
        }
        let idx = (p / 100.0 * (sorted.len() as f64 - 1.0)).round() as usize;
        sorted[idx.min(sorted.len() - 1)] as f64
    }

    fn stats(durations: &mut Vec<u64>) -> serde_json::Value {
        durations.sort();
        let count = durations.len();
        let avg = if count > 0 {
            durations.iter().sum::<u64>() as f64 / count as f64
        } else {
            0.0
        };
        serde_json::json!({
            "p50": percentile(durations, 50.0),
            "p95": percentile(durations, 95.0),
            "p99": percentile(durations, 99.0),
            "avg": (avg * 100.0).round() / 100.0,
            "count": count,
        })
    }

    let overall = stats(&mut all_durations);

    let mut model_stats: Vec<serde_json::Value> = by_model
        .into_iter()
        .map(|(model, mut durs)| {
            let mut s = stats(&mut durs);
            s.as_object_mut().unwrap().insert("model".to_string(), serde_json::json!(model));
            s
        })
        .collect();
    model_stats.sort_by(|a, b| b["count"].as_u64().cmp(&a["count"].as_u64()));

    // Histogram buckets (in ms)
    let buckets: &[(&str, u64, u64)] = &[
        ("0-1s", 0, 1000),
        ("1-3s", 1000, 3000),
        ("3-5s", 3000, 5000),
        ("5-10s", 5000, 10000),
        ("10-30s", 10000, 30000),
        ("30s+", 30000, u64::MAX),
    ];
    let histogram: Vec<serde_json::Value> = buckets
        .iter()
        .map(|(label, lo, hi)| {
            let count = all_durations.iter().filter(|d| **d >= *lo && **d < *hi).count();
            serde_json::json!({"bucket": label, "count": count})
        })
        .collect();

    Json(serde_json::json!({
        "overall": overall,
        "by_model": model_stats,
        "histogram": histogram,
    }))
}

/// GET /api/tools/status — tool call success/failure aggregation
async fn api_tools_status(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    struct ToolStatus {
        total: usize,
        success: usize,
        error: usize,
    }

    let mut tool_map: HashMap<String, ToolStatus> = HashMap::new();
    for s in &sessions {
        for m in &s.messages {
            for tc in &m.tool_calls {
                let entry = tool_map.entry(tc.name.clone()).or_insert(ToolStatus {
                    total: 0,
                    success: 0,
                    error: 0,
                });
                entry.total += 1;
                match tc.status.as_deref() {
                    Some("error") => entry.error += 1,
                    _ => entry.success += 1, // None or "success"
                }
            }
        }
    }

    let mut result: Vec<serde_json::Value> = tool_map
        .into_iter()
        .map(|(name, s)| {
            serde_json::json!({
                "name": name,
                "total": s.total,
                "success": s.success,
                "error": s.error,
            })
        })
        .collect();
    result.sort_by(|a, b| b["total"].as_u64().cmp(&a["total"].as_u64()));

    Json(serde_json::json!(result))
}

/// GET /api/git/activity — aggregate sessions by git repo
async fn api_git_activity(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;

    struct RepoStats {
        branches: Vec<String>,
        sessions: usize,
        messages: usize,
        input_tokens: u64,
        output_tokens: u64,
        last_seen: String,
    }

    let mut repos: HashMap<String, RepoStats> = HashMap::new();
    for s in &sessions {
        let git = match &s.git {
            Some(g) => g,
            None => continue,
        };
        let repo_key = match git.repo_url.as_deref().or(git.branch.as_deref()) {
            Some(k) => k.to_string(),
            None => continue,
        };

        let day = s.start_time.format("%Y-%m-%d").to_string();
        let entry = repos.entry(repo_key).or_insert_with(|| RepoStats {
            branches: Vec::new(),
            sessions: 0,
            messages: 0,
            input_tokens: 0,
            output_tokens: 0,
            last_seen: day.clone(),
        });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        if day > entry.last_seen {
            entry.last_seen = day;
        }
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

    let mut result: Vec<serde_json::Value> = repos
        .into_iter()
        .map(|(repo, s)| {
            serde_json::json!({
                "repo": repo,
                "branches": s.branches,
                "sessions": s.sessions,
                "messages": s.messages,
                "input_tokens": s.input_tokens,
                "output_tokens": s.output_tokens,
                "last_seen": s.last_seen,
            })
        })
        .collect();
    result.sort_by(|a, b| b["sessions"].as_u64().cmp(&a["sessions"].as_u64()));

    Json(serde_json::json!(result))
}

/// GET /api/directories — aggregate sessions by working directory
async fn api_directories(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sessions = collect_sessions(&state).await;
    let home = dirs::home_dir().unwrap_or_default();
    let home_str = home.to_string_lossy();

    struct DirStats {
        sessions: usize,
        messages: usize,
        input_tokens: u64,
        output_tokens: u64,
        tools: HashMap<String, usize>,
    }

    let mut dir_map: HashMap<String, DirStats> = HashMap::new();
    for s in &sessions {
        let cwd = match &s.cwd {
            Some(c) => {
                if c.starts_with(home_str.as_ref()) {
                    format!("~{}", &c[home_str.len()..])
                } else {
                    c.clone()
                }
            }
            None => continue,
        };

        let entry = dir_map.entry(cwd).or_insert(DirStats {
            sessions: 0,
            messages: 0,
            input_tokens: 0,
            output_tokens: 0,
            tools: HashMap::new(),
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

    let mut result: Vec<serde_json::Value> = dir_map
        .into_iter()
        .map(|(dir, s)| {
            serde_json::json!({
                "directory": dir,
                "sessions": s.sessions,
                "messages": s.messages,
                "input_tokens": s.input_tokens,
                "output_tokens": s.output_tokens,
                "tools": s.tools,
            })
        })
        .collect();
    result.sort_by(|a, b| b["sessions"].as_u64().cmp(&a["sessions"].as_u64()));

    Json(serde_json::json!(result))
}

// ── Static file handler ─────────────────────────────────────────────

async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match Asset::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, mime.as_ref().to_string())],
                content.data.to_vec(),
            )
                .into_response()
        }
        None => match Asset::get("index.html") {
            Some(content) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/html".to_string())],
                content.data.to_vec(),
            )
                .into_response(),
            None => (StatusCode::NOT_FOUND, "Not found").into_response(),
        },
    }
}

// ── Server entry ────────────────────────────────────────────────────

pub async fn serve(
    collectors: Vec<Box<dyn Collector + Send + Sync>>,
    data_dir: PathBuf,
    port: u16,
) -> anyhow::Result<()> {
    let state = Arc::new(AppState {
        collectors,
        data_dir,
        cache: RwLock::new(None),
    });

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
    eprintln!("API endpoints:");
    eprintln!("  GET /api/summary");
    eprintln!("  GET /api/sessions?tool=&from=&to=&project=&limit=&offset=");
    eprintln!("  GET /api/tokens/daily");
    eprintln!("  GET /api/tokens/by-model");
    eprintln!("  GET /api/tools/usage");
    eprintln!("  GET /api/projects");
    eprintln!("  GET /api/hosts");
    eprintln!("  GET /api/duration");
    eprintln!("  GET /api/activity/heatmap");
    eprintln!("  GET /api/cost");
    eprintln!("  GET /api/messages/latency");
    eprintln!("  GET /api/tools/status");
    eprintln!("  GET /api/git/activity");
    eprintln!("  GET /api/directories");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
