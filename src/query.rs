use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use tokio::sync::RwLock;

use crate::analytics::local_date;
use crate::collector::{Collector, raw_dirs_for};
use crate::pricing::PricingProvider;
use crate::schema::Session;

pub struct AppState {
    pub collectors: Vec<Box<dyn Collector + Send + Sync>>,
    pub data_dir: PathBuf,
    pub pricing: Box<dyn PricingProvider>,
    cache: RwLock<Option<Arc<Vec<Session>>>>,
    dirty: Arc<AtomicBool>,
    has_watcher: bool,
    _watcher: Option<RecommendedWatcher>,
}

impl AppState {
    pub fn new(
        collectors: Vec<Box<dyn Collector + Send + Sync>>,
        data_dir: PathBuf,
        pricing: Box<dyn PricingProvider>,
    ) -> Self {
        let dirty = Arc::new(AtomicBool::new(true));
        let raw_dir = data_dir.join("raw");
        let _ = fs::create_dir_all(&raw_dir);

        let watcher = {
            let flag = dirty.clone();
            notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
                if res.is_ok() {
                    flag.store(true, Ordering::Release);
                }
            })
            .and_then(|mut w| {
                w.watch(&raw_dir, RecursiveMode::Recursive)?;
                Ok(w)
            })
        };

        let has_watcher = watcher.is_ok();
        if !has_watcher {
            eprintln!("warn: fs watcher unavailable, cache will re-parse on every request");
        }

        Self {
            collectors,
            data_dir,
            pricing,
            cache: RwLock::new(None),
            dirty,
            has_watcher,
            _watcher: watcher.ok(),
        }
    }
}

fn parse_sessions(state: &AppState) -> Vec<Session> {
    let mut all = Vec::new();
    for c in &state.collectors {
        for raw_dir in raw_dirs_for(c.as_ref(), &state.data_dir) {
            let host_name = raw_dir
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string());

            let cache_path = state
                .data_dir
                .join("cache")
                .join(host_name.as_deref().unwrap_or("unknown"))
                .join(format!("{}.bin", c.name()));

            let result = crate::cache::cached_parse(c.as_ref(), &raw_dir, &cache_path);

            for w in &result.warnings {
                eprintln!("warn: {w}");
            }
            let mut sessions = result.sessions;
            for s in &mut sessions {
                s.hostname = host_name.clone();
            }
            all.extend(sessions);
        }
    }
    all.sort_by_key(|s| s.start_time);
    all
}

pub async fn collect_sessions(state: &AppState) -> Arc<Vec<Session>> {
    // Fast path: not dirty, return cache via read lock (concurrent readers)
    if !state.dirty.load(Ordering::Acquire) {
        let cache = state.cache.read().await;
        if let Some(ref sessions) = *cache {
            return sessions.clone();
        }
    }

    // Slow path: acquire write lock, double-check
    let mut cache = state.cache.write().await;
    if !state.dirty.load(Ordering::Acquire) {
        if let Some(ref sessions) = *cache {
            return sessions.clone();
        }
    }

    // Clear dirty before parsing — changes during parse will re-set it.
    // If watcher is absent, leave dirty=true so we always re-parse.
    if state.has_watcher {
        state.dirty.store(false, Ordering::Release);
    }

    let sessions = Arc::new(parse_sessions(state));
    *cache = Some(sessions.clone());
    sessions
}

#[derive(Deserialize, Default)]
pub struct SessionFilter {
    pub tool: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub project: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// Lightweight date-range filter shared by all analytics endpoints.
#[derive(Deserialize, Default)]
pub struct DateRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

pub fn filter_by_date(sessions: &[Session], range: &DateRange) -> Vec<Session> {
    if range.from.is_none() && range.to.is_none() {
        return sessions.to_vec();
    }
    sessions
        .iter()
        .filter(|s| {
            let day = local_date(&s.start_time);
            if let Some(ref from) = range.from {
                if day < *from {
                    return false;
                }
            }
            if let Some(ref to) = range.to {
                if day > *to {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect()
}

pub fn filter_sessions(sessions: &[Session], q: &SessionFilter) -> Vec<Session> {
    sessions
        .iter()
        .filter(|s| {
            if let Some(ref tool) = q.tool {
                if s.tool.to_string() != *tool {
                    return false;
                }
            }
            if let Some(ref from) = q.from {
                if local_date(&s.start_time) < *from {
                    return false;
                }
            }
            if let Some(ref to) = q.to {
                if local_date(&s.start_time) > *to {
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
        .cloned()
        .collect()
}

pub fn paginate(sessions: Vec<Session>, q: &SessionFilter) -> Vec<Session> {
    let offset = q.offset.unwrap_or(0);
    let limit = q.limit.unwrap_or(sessions.len());
    sessions.into_iter().skip(offset).take(limit).collect()
}
