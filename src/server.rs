use std::sync::Arc;

use axum::{
    Router,
    extract::{Query, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Json, Response},
    routing::get,
};
use rust_embed::Embed;
use serde::Deserialize;
use tower_http::cors::CorsLayer;

use crate::analytics;
use crate::query::{
    AppState, DateRange, SessionFilter, collect_sessions, filter_by_date, filter_sessions, paginate,
};

#[derive(Deserialize, Default)]
struct BashHistoryQuery {
    from: Option<String>,
    to: Option<String>,
    tool: Option<String>,
    q: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(Deserialize, Default)]
struct SessionsListQuery {
    project: Option<String>,
    tool: Option<String>,
    q: Option<String>,
    from: Option<String>,
    to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(serde::Serialize)]
struct HostToolStat {
    tool: String,
    sessions: usize,
    files: usize,
    bytes: u64,
}

#[derive(serde::Serialize)]
struct HostInfo {
    hostname: String,
    total_sessions: usize,
    last_activity: Option<String>,
    first_activity: Option<String>,
    tools: Vec<HostToolStat>,
}

#[derive(serde::Serialize, Clone, Copy)]
struct EndpointInfo {
    method: &'static str,
    path: &'static str,
    description: &'static str,
}

#[derive(serde::Serialize)]
struct ServerInfo {
    version: &'static str,
    data_dir: String,
    raw_dir: String,
    cache_dir: String,
    collectors: Vec<String>,
}

#[derive(serde::Serialize)]
struct ApiInfoResponse {
    server: ServerInfo,
    hosts: Vec<HostInfo>,
    endpoints: Vec<EndpointInfo>,
}

const ENDPOINTS: &[EndpointInfo] = &[
    EndpointInfo { method: "GET", path: "/api/sessions", description: "Raw sessions with optional filters and pagination" },
    EndpointInfo { method: "GET", path: "/api/sessions/list", description: "Lightweight session summaries with title, message/token totals; supports project/tool/q filters" },
    EndpointInfo { method: "GET", path: "/api/sessions/:id", description: "Full Session record (all messages) for one session id" },
    EndpointInfo { method: "GET", path: "/api/summary", description: "Top-level totals plus per-day sessions/messages/tokens" },
    EndpointInfo { method: "GET", path: "/api/tokens/daily", description: "Daily token totals split by tool" },
    EndpointInfo { method: "GET", path: "/api/tokens/by-model", description: "Per-model output/thinking token totals" },
    EndpointInfo { method: "GET", path: "/api/tools/usage", description: "Tool-call frequencies across all sessions" },
    EndpointInfo { method: "GET", path: "/api/tools/status", description: "Success vs error counts per tool" },
    EndpointInfo { method: "GET", path: "/api/projects", description: "Project breakdown: sessions, tokens, last activity" },
    EndpointInfo { method: "GET", path: "/api/hosts", description: "Per-host session and token totals" },
    EndpointInfo { method: "GET", path: "/api/duration", description: "Daily session-duration totals" },
    EndpointInfo { method: "GET", path: "/api/activity/heatmap", description: "Session starts bucketed by weekday × hour" },
    EndpointInfo { method: "GET", path: "/api/cost", description: "Equivalent API cost plus subscription savings, with daily breakdown" },
    EndpointInfo { method: "GET", path: "/api/messages/latency", description: "Assistant message latency distribution" },
    EndpointInfo { method: "GET", path: "/api/git/activity", description: "Sessions per git repository" },
    EndpointInfo { method: "GET", path: "/api/directories", description: "Sessions per working directory" },
    EndpointInfo { method: "GET", path: "/api/insights/conversations", description: "Depth and message-length histograms" },
    EndpointInfo { method: "GET", path: "/api/insights/cache-efficiency", description: "Cache-read vs cache-write per tool" },
    EndpointInfo { method: "GET", path: "/api/insights/thinking", description: "Thinking-token usage per model" },
    EndpointInfo { method: "GET", path: "/api/insights/toolchains", description: "Common sequential tool-call chains" },
    EndpointInfo { method: "GET", path: "/api/insights/model-switches", description: "Mid-session model switch rate" },
    EndpointInfo { method: "GET", path: "/api/insights/languages", description: "Detected language and task-type for first user message" },
    EndpointInfo { method: "GET", path: "/api/insights/session-complexity", description: "Avg messages per session by hour" },
    EndpointInfo { method: "GET", path: "/api/bash-history", description: "Paginated list of every shell command run by an agent" },
    EndpointInfo { method: "GET", path: "/api/bash-history/stats", description: "Aggregate stats: features, complexity, behavior, per-project" },
    EndpointInfo { method: "GET", path: "/api/projector/models", description: "Catalog of model pricing for the cost projector" },
    EndpointInfo { method: "GET", path: "/api/projector/usage-summary", description: "Usage totals used to project costs onto other models" },
    EndpointInfo { method: "GET", path: "/api/info", description: "Server metadata, connected hosts, and registered endpoints" },
];

#[derive(Embed)]
#[folder = "web/dist"]
struct Asset;

async fn api_sessions(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SessionFilter>,
) -> Json<serde_json::Value> {
    let sessions = filter_sessions(&collect_sessions(&state).await, &q);
    let total = sessions.len();
    let sessions = paginate(sessions, &q);
    Json(serde_json::json!({
        "total": total,
        "offset": q.offset.unwrap_or(0),
        "count": sessions.len(),
        "sessions": sessions,
    }))
}

struct PricingAdapter<'a>(&'a dyn crate::pricing::PricingProvider);

impl<'a> analytics::PricingLookup for PricingAdapter<'a> {
    fn input_output(&self, model: &str) -> Option<(f64, f64)> {
        self.0
            .price_for(model)
            .map(|p| (p.input_cost_per_token, p.output_cost_per_token))
    }
}

async fn api_sessions_list(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SessionsListQuery>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(
        &collect_sessions(&state).await,
        &DateRange { from: q.from.clone(), to: q.to.clone() },
    );
    let list_q = analytics::ListQuery {
        project: q.project.clone(),
        tool: q.tool.clone(),
        q: q.q.clone(),
        limit: q.limit.unwrap_or(200),
        offset: q.offset.unwrap_or(0),
    };
    Json(serde_json::to_value(analytics::build_list(&sessions, &list_q)).unwrap())
}

async fn api_session_detail(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Response {
    let sessions = collect_sessions(&state).await;
    match sessions.iter().find(|s| s.id == id) {
        Some(s) => {
            let cost = analytics::estimated_cost_usd(s, &PricingAdapter(state.pricing.as_ref()));
            let mut v = serde_json::to_value(s).unwrap();
            v["estimated_cost_usd"] = serde_json::json!(cost);
            Json(v).into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "not found"})),
        )
            .into_response(),
    }
}

async fn api_summary(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::summary(&sessions)).unwrap())
}

async fn api_tokens_daily(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::daily_tokens(&sessions)).unwrap())
}

async fn api_tokens_by_model(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::tokens_by_model(&sessions)).unwrap())
}

async fn api_tools_usage(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::tools_usage(&sessions)).unwrap())
}

async fn api_projects(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::projects(&sessions)).unwrap())
}

async fn api_hosts(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::hosts_summary(&sessions)).unwrap())
}

async fn api_duration(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::duration(&sessions)).unwrap())
}

async fn api_activity_heatmap(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::activity_heatmap(&sessions)).unwrap())
}

async fn api_cost(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(
        serde_json::to_value(analytics::cost_breakdown(&sessions, state.pricing.as_ref())).unwrap(),
    )
}

async fn api_messages_latency(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::messages_latency(&sessions)).unwrap())
}

async fn api_tools_status(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::tools_status(&sessions)).unwrap())
}

async fn api_git_activity(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::git_activity(&sessions)).unwrap())
}

async fn api_directories(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::directories(&sessions)).unwrap())
}

async fn api_bash_history(
    State(state): State<Arc<AppState>>,
    Query(q): Query<BashHistoryQuery>,
) -> Json<serde_json::Value> {
    let range = DateRange {
        from: q.from.clone(),
        to: q.to.clone(),
    };
    let mut sessions = filter_by_date(&collect_sessions(&state).await, &range);
    if let Some(tool) = &q.tool {
        sessions.retain(|s| s.tool.to_string() == *tool);
    }
    let offset = q.offset.unwrap_or(0);
    let limit = q.limit.unwrap_or(200).min(2000);
    Json(
        serde_json::to_value(analytics::bash_history(
            &sessions,
            offset,
            limit,
            q.q.as_deref(),
        ))
        .unwrap(),
    )
}

async fn api_info(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    use std::collections::BTreeMap;

    let raw_root = state.data_dir.join("raw");
    let cache_dir = state.data_dir.join("cache");

    // Walk raw_root to count files and bytes per (host, tool).
    let mut fs_stats: BTreeMap<(String, String), (usize, u64)> = BTreeMap::new();
    if let Ok(host_entries) = std::fs::read_dir(&raw_root) {
        for host_entry in host_entries.flatten() {
            let host = host_entry.file_name().to_string_lossy().to_string();
            if let Ok(tool_entries) = std::fs::read_dir(host_entry.path()) {
                for tool_entry in tool_entries.flatten() {
                    let tool = tool_entry.file_name().to_string_lossy().to_string();
                    let mut files = 0usize;
                    let mut bytes = 0u64;
                    walk_count(&tool_entry.path(), &mut files, &mut bytes);
                    fs_stats.insert((host.clone(), tool), (files, bytes));
                }
            }
        }
    }

    // Aggregate session counts per (host, tool) from the cache.
    let sessions = collect_sessions(&state).await;
    let mut session_counts: BTreeMap<(String, String), usize> = BTreeMap::new();
    let mut host_last: BTreeMap<String, chrono::DateTime<chrono::Utc>> = BTreeMap::new();
    let mut host_first: BTreeMap<String, chrono::DateTime<chrono::Utc>> = BTreeMap::new();
    for s in sessions.iter() {
        let host = s.hostname.clone().unwrap_or_else(|| "unknown".to_string());
        *session_counts
            .entry((host.clone(), s.tool.to_string()))
            .or_default() += 1;
        host_last
            .entry(host.clone())
            .and_modify(|e| {
                if s.start_time > *e {
                    *e = s.start_time;
                }
            })
            .or_insert(s.start_time);
        host_first
            .entry(host)
            .and_modify(|e| {
                if s.start_time < *e {
                    *e = s.start_time;
                }
            })
            .or_insert(s.start_time);
    }

    let mut hosts_map: BTreeMap<String, Vec<HostToolStat>> = BTreeMap::new();
    for ((host, tool), (files, bytes)) in &fs_stats {
        let sessions = session_counts.get(&(host.clone(), tool.clone())).copied().unwrap_or(0);
        hosts_map.entry(host.clone()).or_default().push(HostToolStat {
            tool: tool.clone(),
            sessions,
            files: *files,
            bytes: *bytes,
        });
    }
    // Include hosts that exist in cache but have no raw dir.
    for (host, _) in &host_last {
        hosts_map.entry(host.clone()).or_default();
    }

    let mut hosts: Vec<HostInfo> = hosts_map
        .into_iter()
        .map(|(hostname, mut tools)| {
            tools.sort_by(|a, b| b.sessions.cmp(&a.sessions));
            let total_sessions = tools.iter().map(|t| t.sessions).sum();
            HostInfo {
                last_activity: host_last.get(&hostname).map(|t| t.to_rfc3339()),
                first_activity: host_first.get(&hostname).map(|t| t.to_rfc3339()),
                hostname,
                total_sessions,
                tools,
            }
        })
        .collect();
    hosts.sort_by(|a, b| b.total_sessions.cmp(&a.total_sessions));

    let info = ApiInfoResponse {
        server: ServerInfo {
            version: env!("CARGO_PKG_VERSION"),
            data_dir: state.data_dir.to_string_lossy().to_string(),
            raw_dir: raw_root.to_string_lossy().to_string(),
            cache_dir: cache_dir.to_string_lossy().to_string(),
            collectors: state.collectors.iter().map(|c| c.name().to_string()).collect(),
        },
        hosts,
        endpoints: ENDPOINTS.to_vec(),
    };

    Json(serde_json::to_value(info).unwrap())
}

fn walk_count(path: &std::path::Path, files: &mut usize, bytes: &mut u64) {
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(md) = entry.metadata() {
                if md.is_dir() {
                    walk_count(&p, files, bytes);
                } else if md.is_file() {
                    *files += 1;
                    *bytes += md.len();
                }
            }
        }
    }
}

async fn api_bash_history_stats(
    State(state): State<Arc<AppState>>,
    Query(q): Query<BashHistoryQuery>,
) -> Json<serde_json::Value> {
    let range = DateRange {
        from: q.from.clone(),
        to: q.to.clone(),
    };
    let sessions = filter_by_date(&collect_sessions(&state).await, &range);
    Json(
        serde_json::to_value(analytics::bash_stats(
            &sessions,
            q.tool.as_deref(),
            q.q.as_deref(),
        ))
        .unwrap(),
    )
}

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
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::usage_summary(&sessions, state.pricing.as_ref())).unwrap())
}

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

pub async fn serve(
    state: AppState,
    host: &str,
    port: u16,
    open_browser: bool,
) -> anyhow::Result<()> {
    let state = Arc::new(state);

    // Warm session cache in the background so the first dashboard request hits hot memory.
    {
        let s = state.clone();
        tokio::spawn(async move {
            let t = std::time::Instant::now();
            let _ = crate::query::collect_sessions(&s).await;
            let sty = crate::cli::style();
            eprintln!(
                "  {green}✓{reset} {dim}cache warm in {:.2}s{reset}",
                t.elapsed().as_secs_f64(),
                green = sty.green, reset = sty.reset, dim = sty.dim,
            );
        });
    }

    let app = Router::new()
        .route("/api/sessions", get(api_sessions))
        .route("/api/sessions/list", get(api_sessions_list))
        .route("/api/sessions/{id}", get(api_session_detail))
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
        .route("/api/bash-history", get(api_bash_history))
        .route("/api/bash-history/stats", get(api_bash_history_stats))
        .route("/api/info", get(api_info))
        .route("/api/projector/models", get(api_projector_models))
        .route("/api/projector/usage-summary", get(api_projector_usage_summary))
        .merge(crate::insights::router())
        .layer(CorsLayer::permissive())
        .fallback(static_handler)
        .with_state(state);

    let ip: std::net::IpAddr = host.parse()?;
    let addr = std::net::SocketAddr::from((ip, port));

    // Try requested port first, fall back to OS-assigned port if busy
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(_) => {
            let fallback = std::net::SocketAddr::from((ip, 0u16));
            let s = crate::cli::style();
            eprintln!(
                "  {yellow}Port {port} is busy, finding an available port…{reset}",
                yellow = s.yellow, reset = s.reset
            );
            tokio::net::TcpListener::bind(fallback).await?
        }
    };

    let actual_addr = listener.local_addr()?;
    let actual_port = actual_addr.port();

    let s = crate::cli::style();
    eprintln!();
    eprintln!(
        "  {bold}Listening{reset} on {addr}",
        bold = s.bold, reset = s.reset, addr = actual_addr
    );
    let url = if ip.is_unspecified() {
        eprintln!(
            "    {dim}→{reset} {cyan}http://localhost:{port}{reset}",
            dim = s.dim, reset = s.reset, cyan = s.cyan, port = actual_port
        );
        if let Some(lip) = local_ip() {
            eprintln!(
                "    {dim}→{reset} {cyan}http://{lip}:{port}{reset}",
                dim = s.dim, reset = s.reset, cyan = s.cyan, port = actual_port
            );
        }
        format!("http://localhost:{actual_port}")
    } else {
        eprintln!(
            "    {dim}→{reset} {cyan}http://{addr}{reset}",
            dim = s.dim, reset = s.reset, cyan = s.cyan, addr = actual_addr
        );
        format!("http://{actual_addr}")
    };

    if open_browser {
        if let Err(e) = open::that(&url) {
            eprintln!("Could not open browser: {e}");
        }
    }

    axum::serve(listener, app).await?;
    Ok(())
}

fn local_ip() -> Option<std::net::IpAddr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip())
}
