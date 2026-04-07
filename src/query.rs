use std::path::PathBuf;
use std::time::Instant;

use serde::Deserialize;
use tokio::sync::RwLock;

use crate::collector::{Collector, raw_dirs_for};
use crate::pricing::PricingProvider;
use crate::schema::Session;

const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(30);

struct SessionCache {
    sessions: Vec<Session>,
    updated_at: Instant,
}

pub struct AppState {
    pub collectors: Vec<Box<dyn Collector + Send + Sync>>,
    pub data_dir: PathBuf,
    pub pricing: Box<dyn PricingProvider>,
    cache: RwLock<Option<SessionCache>>,
}

impl AppState {
    pub fn new(
        collectors: Vec<Box<dyn Collector + Send + Sync>>,
        data_dir: PathBuf,
        pricing: Box<dyn PricingProvider>,
    ) -> Self {
        Self {
            collectors,
            data_dir,
            pricing,
            cache: RwLock::new(None),
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
            if let Ok(mut sessions) = c.parse(&raw_dir) {
                for s in &mut sessions {
                    s.hostname = host.clone();
                }
                all.extend(sessions);
            }
        }
    }
    all.sort_by_key(|s| s.start_time);
    all
}

pub async fn collect_sessions(state: &AppState) -> Vec<Session> {
    {
        let cache = state.cache.read().await;
        if let Some(ref c) = *cache {
            if c.updated_at.elapsed() < CACHE_TTL {
                return c.sessions.clone();
            }
        }
    }
    let mut cache = state.cache.write().await;
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
