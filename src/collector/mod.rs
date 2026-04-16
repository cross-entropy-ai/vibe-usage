pub mod claude;
pub mod codex;
pub mod gemini;
pub mod kimi;

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::schema::Session;

/// Result of parsing a raw directory: sessions + any non-fatal warnings.
pub struct ParseResult {
    pub sessions: Vec<Session>,
    pub warnings: Vec<String>,
}

/// Every collector implements this trait.
pub trait Collector: Send + Sync {
    /// Human-readable name (used as subdirectory under raw/<hostname>/).
    fn name(&self) -> &str;

    /// Root directory where the tool stores its original data.
    fn source_dir(&self) -> &Path;

    /// Glob patterns *relative to source_dir* for files to sync.
    fn glob_patterns(&self) -> Vec<&str>;

    /// Parse sessions from the local raw copy at `raw_dir`.
    /// `raw_dir` is `<data_dir>/raw/<hostname>/<name>/`.
    /// Individual file errors are captured as warnings instead of aborting.
    fn parse(&self, raw_dir: &Path) -> Result<ParseResult>;
}

pub struct SyncStats {
    pub copied: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Get the local hostname.
pub fn hostname() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Incrementally sync raw files from a collector's source into
/// `data_dir/raw/<hostname>/<name>/`.
/// Only copies files whose source mtime is newer than the destination (or missing).
pub fn sync_collector(collector: &dyn Collector, data_dir: &Path) -> Result<SyncStats> {
    let raw_dir = data_dir.join("raw").join(hostname()).join(collector.name());
    let source = collector.source_dir();

    let mut copied = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for pattern in collector.glob_patterns() {
        let full_pattern = source.join(pattern);
        let full_pattern = full_pattern.to_string_lossy();

        for entry in glob::glob(&full_pattern)? {
            let src_path = match entry {
                Ok(p) => p,
                Err(e) => {
                    errors.push(format!("glob entry: {e}"));
                    continue;
                }
            };

            let rel = match src_path.strip_prefix(source) {
                Ok(r) => r.to_path_buf(),
                Err(e) => {
                    errors.push(format!("{}: {e}", src_path.display()));
                    continue;
                }
            };
            let dest_path = raw_dir.join(rel);

            let needs_copy = match fs::metadata(&dest_path) {
                Ok(dest_meta) => match fs::metadata(&src_path) {
                    Ok(src_meta) => {
                        let src_mtime = src_meta
                            .modified()
                            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                        let dest_mtime = dest_meta
                            .modified()
                            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                        src_mtime > dest_mtime
                    }
                    Err(e) => {
                        errors.push(format!("{}: {e}", src_path.display()));
                        continue;
                    }
                },
                Err(_) => true,
            };

            if needs_copy {
                if let Some(parent) = dest_path.parent() {
                    if let Err(e) = fs::create_dir_all(parent) {
                        errors.push(format!("{}: mkdir: {e}", dest_path.display()));
                        continue;
                    }
                }
                if let Err(e) = fs::copy(&src_path, &dest_path) {
                    errors.push(format!("{}: copy: {e}", src_path.display()));
                    continue;
                }
                copied += 1;
            } else {
                skipped += 1;
            }
        }
    }

    Ok(SyncStats {
        copied,
        skipped,
        errors,
    })
}

/// Build the raw_dir path for a given collector (for parsing).
/// Scans all hostnames under `data_dir/raw/` and parses each.
pub fn raw_dirs_for(collector: &dyn Collector, data_dir: &Path) -> Vec<PathBuf> {
    let raw_root = data_dir.join("raw");
    let mut dirs = Vec::new();
    if let Ok(entries) = fs::read_dir(&raw_root) {
        for entry in entries.flatten() {
            let host_dir = entry.path().join(collector.name());
            if host_dir.is_dir() {
                dirs.push(host_dir);
            }
        }
    }
    dirs
}

/// Return the default data directory: ~/.vibe-usage
pub fn default_data_dir() -> PathBuf {
    dirs::home_dir()
        .expect("cannot resolve home dir")
        .join(".vibe-usage")
}

/// Registry of all known collector names.
pub fn collector_names() -> &'static [&'static str] {
    &["gemini", "claude", "codex", "kimi"]
}

/// Create a collector by name. Returns None for unknown names.
pub fn create_collector(name: &str) -> Option<Box<dyn Collector + Send + Sync>> {
    match name {
        "gemini" => Some(Box::new(gemini::GeminiCollector::new())),
        "claude" => Some(Box::new(claude::ClaudeCollector::new())),
        "codex" => Some(Box::new(codex::CodexCollector::new())),
        "kimi" => Some(Box::new(kimi::KimiCollector::new())),
        _ => None,
    }
}

/// Build collectors filtered by tool names. If `tools` is None, returns all.
pub fn build_collectors(tools: &Option<Vec<String>>) -> Vec<Box<dyn Collector + Send + Sync>> {
    let names: Vec<&str> = match tools {
        Some(ts) => ts.iter().map(|s| s.as_str()).collect(),
        None => collector_names().to_vec(),
    };

    names
        .iter()
        .filter_map(|name| {
            let c = create_collector(name);
            if c.is_none() {
                eprintln!("unknown tool: {name}");
            }
            c
        })
        .collect()
}
