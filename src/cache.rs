use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::collector::{Collector, ParseResult};
use crate::schema::Session;

#[derive(Serialize, Deserialize)]
struct CacheEntry {
    mtime: u64,
    size: u64,
    sessions: Vec<Session>,
}

#[derive(Serialize, Deserialize, Default)]
struct CacheStore {
    entries: HashMap<String, CacheEntry>,
}

impl CacheStore {
    fn load(path: &Path) -> Self {
        match fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    fn save(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(bytes) = serde_json::to_vec(self) {
            let _ = fs::write(path, bytes);
        }
    }
}

fn file_meta(path: &Path) -> Option<(u64, u64)> {
    let meta = fs::metadata(path).ok()?;
    let mtime = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
    Some((mtime, meta.len()))
}

/// Parse a collector's raw_dir with file-level caching.
/// Only re-parses files whose mtime or size changed since last run.
pub fn cached_parse(
    collector: &dyn Collector,
    raw_dir: &Path,
    cache_path: &Path,
) -> ParseResult {
    let mut store = CacheStore::load(cache_path);
    let pattern = raw_dir.join(collector.parse_glob());
    let pattern = pattern.to_string_lossy();

    let mut sessions = Vec::new();
    let mut warnings = Vec::new();
    let mut current_files = HashSet::new();
    let mut dirty = false;

    let entries = match glob::glob(&pattern) {
        Ok(e) => e,
        Err(e) => {
            warnings.push(format!("{}: glob: {e}", collector.name()));
            return ParseResult { sessions, warnings };
        }
    };

    for entry in entries {
        let path = match entry {
            Ok(p) => p,
            Err(e) => {
                warnings.push(format!("{}: glob entry: {e}", collector.name()));
                continue;
            }
        };

        let rel = match path.strip_prefix(raw_dir) {
            Ok(r) => r.to_string_lossy().to_string(),
            Err(_) => continue,
        };
        current_files.insert(rel.clone());

        let (mtime, size) = match file_meta(&path) {
            Some(m) => m,
            None => continue,
        };

        // Cache hit?
        if let Some(cached) = store.entries.get(&rel) {
            if cached.mtime == mtime && cached.size == size {
                sessions.extend(cached.sessions.iter().cloned());
                continue;
            }
        }

        // Cache miss: parse the file
        dirty = true;
        match collector.parse_file(&path) {
            Ok(result) => {
                warnings.extend(result.warnings);
                let entry = CacheEntry {
                    mtime,
                    size,
                    sessions: result.sessions.clone(),
                };
                sessions.extend(result.sessions);
                store.entries.insert(rel, entry);
            }
            Err(e) => {
                warnings.push(format!("{}: {}: {e}", collector.name(), path.display()));
            }
        }
    }

    // Prune entries for deleted files
    let before = store.entries.len();
    store.entries.retain(|k, _| current_files.contains(k));
    if store.entries.len() != before {
        dirty = true;
    }

    if dirty {
        store.save(cache_path);
    }

    sessions.sort_by_key(|s| s.start_time);
    ParseResult { sessions, warnings }
}
