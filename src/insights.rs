use std::sync::Arc;

use axum::{
    Router,
    extract::{Query, State},
    response::Json,
    routing::get,
};

use crate::analytics;
use crate::query::{AppState, DateRange, collect_sessions, filter_by_date};

async fn conversations(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::conversation_insights(&sessions)).unwrap())
}

async fn cache_efficiency(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::cache_efficiency(&sessions)).unwrap())
}

async fn thinking_ratio(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::thinking_ratio(&sessions)).unwrap())
}

async fn toolchains(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::toolchain_insights(&sessions)).unwrap())
}

async fn project_lifecycle(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::project_lifecycle(&sessions)).unwrap())
}

async fn model_switches(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::model_switches(&sessions)).unwrap())
}

async fn languages(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
    Json(serde_json::to_value(analytics::language_insights(&sessions)).unwrap())
}

async fn session_complexity(
    State(state): State<Arc<AppState>>,
    Query(r): Query<DateRange>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(&collect_sessions(&state).await, &r);
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
