use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use tokio::sync::RwLock;

use crate::collector::{Collector, raw_dirs_for};
use crate::pricing::PricingProvider;
use crate::schema::Session;

pub struct AppState {
    pub collectors: Vec<Box<dyn Collector + Send + Sync>>,
    pub data_dir: PathBuf,
    pub pricing: Box<dyn PricingProvider>,
    cache: RwLock<Option<Vec<Session>>>,
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
            let host = raw_dir
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string());
            match c.parse(&raw_dir) {
                Ok(result) => {
                    for w in &result.warnings {
                        eprintln!("warn: {w}");
                    }
                    let mut sessions = result.sessions;
                    for s in &mut sessions {
                        s.hostname = host.clone();
                    }
                    all.extend(sessions);
                }
                Err(e) => {
                    eprintln!("error: {} parse {}: {e}", c.name(), raw_dir.display());
                }
            }
        }
    }
    all.sort_by_key(|s| s.start_time);
    all
}

pub async fn collect_sessions(state: &AppState) -> Vec<Session> {
    // Fast path: not dirty, return cache if available
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

    let sessions = parse_sessions(state);
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

pub fn filter_sessions(sessions: Vec<Session>, q: &SessionFilter) -> Vec<Session> {
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

pub fn paginate(sessions: Vec<Session>, q: &SessionFilter) -> Vec<Session> {
    let offset = q.offset.unwrap_or(0);
    let limit = q.limit.unwrap_or(sessions.len());
    sessions.into_iter().skip(offset).take(limit).collect()
}
