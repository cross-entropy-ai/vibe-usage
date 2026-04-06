pub mod claude;
pub mod codex;
pub mod gemini;
pub mod kimi;

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::schema::Session;

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
    fn parse(&self, raw_dir: &Path) -> Result<Vec<Session>>;
}

pub struct SyncStats {
    pub copied: usize,
    pub skipped: usize,
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
    let raw_dir = data_dir
        .join("raw")
        .join(hostname())
        .join(collector.name());
    let source = collector.source_dir();

    let mut copied = 0usize;
    let mut skipped = 0usize;

    for pattern in collector.glob_patterns() {
        let full_pattern = source.join(pattern);
        let full_pattern = full_pattern.to_string_lossy();

        for entry in glob::glob(&full_pattern)? {
            let src_path = entry?;

            let rel = src_path
                .strip_prefix(source)
                .context("strip source prefix")?;
            let dest_path = raw_dir.join(rel);

            let needs_copy = match fs::metadata(&dest_path) {
                Ok(dest_meta) => {
                    let src_meta = fs::metadata(&src_path)?;
                    let src_mtime = src_meta.modified()?;
                    let dest_mtime = dest_meta.modified()?;
                    src_mtime > dest_mtime
                }
                Err(_) => true,
            };

            if needs_copy {
                if let Some(parent) = dest_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&src_path, &dest_path)?;
                copied += 1;
            } else {
                skipped += 1;
            }
        }
    }

    Ok(SyncStats { copied, skipped })
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
