//! Pure analytics functions — no Axum, no HTTP, no side effects.
//!
//! Every public function takes `&[Session]` (and optionally `&dyn PricingProvider`)
//! and returns a typed, `Serialize`-able struct.

mod activity;
mod bash_history;
mod cost;
mod insights;
mod projects;
mod projector;
mod sessions_view;
mod summary;
mod tokens;

pub use activity::*;
pub use bash_history::*;
pub use cost::*;
pub use insights::*;
pub use projects::*;
pub use projector::*;
pub use sessions_view::*;
pub use summary::*;
pub use tokens::*;

use chrono::{DateTime, Local, Utc};
use serde::Serialize;

// ── Shared helpers (visible to submodules only) ────────────────────

/// Convert a UTC timestamp to a local-timezone date string (YYYY-MM-DD).
pub(crate) fn local_date(ts: &DateTime<Utc>) -> String {
    ts.with_timezone(&Local).format("%Y-%m-%d").to_string()
}

pub(crate) fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

pub(crate) fn median(sorted: &[usize]) -> f64 {
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

pub(crate) fn avg(v: &[usize]) -> f64 {
    if v.is_empty() {
        0.0
    } else {
        v.iter().sum::<usize>() as f64 / v.len() as f64
    }
}

pub(crate) fn percentile_u64(sorted: &[u64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = (p / 100.0 * (sorted.len() as f64 - 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)] as f64
}

// ── Shared result structs ──────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct BucketCount {
    pub bucket: &'static str,
    pub count: usize,
}
