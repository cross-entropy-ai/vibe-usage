use std::sync::Arc;

use axum::{
    Router,
    extract::{Query, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Json, Response},
    routing::get,
};
use rust_embed::Embed;
use tower_http::cors::CorsLayer;

use crate::analytics;
use crate::query::{
    AppState, DateRange, SessionFilter, collect_sessions, filter_by_date, filter_sessions, paginate,
};

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

async fn api_summary(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::summary(&sessions)).unwrap())
}

async fn api_tokens_daily(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::daily_tokens(&sessions)).unwrap())
}

async fn api_tokens_by_model(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::tokens_by_model(&sessions)).unwrap())
}

async fn api_tools_usage(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::tools_usage(&sessions)).unwrap())
}

async fn api_projects(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::projects(&sessions)).unwrap())
}

async fn api_hosts(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::hosts_summary(&sessions)).unwrap())
}

async fn api_duration(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::duration(&sessions)).unwrap())
}

async fn api_activity_heatmap(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::activity_heatmap(&sessions)).unwrap())
}

async fn api_cost(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(
        serde_json::to_value(analytics::cost_breakdown(&sessions, state.pricing.as_ref())).unwrap(),
    )
}

async fn api_messages_latency(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::messages_latency(&sessions)).unwrap())
}

async fn api_tools_status(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::tools_status(&sessions)).unwrap())
}

async fn api_git_activity(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::git_activity(&sessions)).unwrap())
}

async fn api_directories(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::directories(&sessions)).unwrap())
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
