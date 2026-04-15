use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use super::{Collector, ParseResult};
use crate::schema::*;

// ── Raw Codex JSONL schema ──────────────────────────────────────────

#[derive(Deserialize)]
struct RawLine {
    timestamp: DateTime<Utc>,
    #[serde(rename = "type")]
    line_type: String,
    payload: serde_json::Value,
}

#[derive(Deserialize)]
struct SessionMeta {
    id: String,
    cwd: Option<String>,
    git: Option<RawGit>,
}

#[derive(Deserialize)]
struct RawGit {
    branch: Option<String>,
    commit_hash: Option<String>,
    repository_url: Option<String>,
}

#[derive(Deserialize)]
struct RawTokenCount {
    info: Option<RawTokenInfo>,
}

#[derive(Deserialize)]
struct RawTokenInfo {
    total_token_usage: Option<RawTotalUsage>,
}

#[derive(Deserialize)]
struct RawTotalUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cached_input_tokens: Option<u64>,
    reasoning_output_tokens: Option<u64>,
}

// ── Collector ───────────────────────────────────────────────────────

pub struct CodexCollector {
    source: PathBuf,
}

impl CodexCollector {
    pub fn new() -> Self {
        Self::with_source(None)
    }

    pub fn with_source(source: Option<PathBuf>) -> Self {
        let source = source.unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot resolve home dir")
                .join(".codex/sessions")
        });
        Self { source }
    }
}

impl Collector for CodexCollector {
    fn name(&self) -> &str {
        "codex"
    }

    fn source_dir(&self) -> &Path {
        &self.source
    }

    fn glob_patterns(&self) -> Vec<&str> {
        vec!["*/*/*/*.jsonl"]
    }

    fn parse(&self, raw_dir: &Path) -> Result<ParseResult> {
        let pattern = raw_dir.join("*/*/*/*.jsonl");
        let pattern = pattern.to_string_lossy();

        let mut sessions = Vec::new();
        let mut warnings = Vec::new();
        for entry in glob::glob(&pattern)? {
            let path = match entry {
                Ok(p) => p,
                Err(e) => {
                    warnings.push(format!("codex: glob entry: {e}"));
                    continue;
                }
            };
            match parse_codex_file(&path) {
                Ok(Some(s)) => sessions.push(s),
                Ok(None) => {}
                Err(e) => warnings.push(format!("codex: {}: {e}", path.display())),
            }
        }
        sessions.sort_by_key(|s| s.start_time);
        Ok(ParseResult { sessions, warnings })
    }
}

fn parse_codex_file(path: &PathBuf) -> Result<Option<Session>> {
    let file = fs::File::open(path).context("open file")?;
    let reader = std::io::BufReader::new(file);

    let mut session_id = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut cwd: Option<String> = None;
    let mut git: Option<GitContext> = None;
    let mut model: Option<String> = None;
    let mut last_token_snapshot: Option<TokenUsage> = None;
    let mut messages = Vec::new();
    let mut first_ts: Option<DateTime<Utc>> = None;
    let mut last_ts: Option<DateTime<Utc>> = None;

    for line in reader.lines() {
        let line = line.context("read line")?;
        if line.trim().is_empty() {
            continue;
        }

        let raw: RawLine = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if first_ts.is_none() {
            first_ts = Some(raw.timestamp);
        }
        last_ts = Some(raw.timestamp);

        match raw.line_type.as_str() {
            "session_meta" => {
                if let Ok(meta) = serde_json::from_value::<SessionMeta>(raw.payload) {
                    session_id = meta.id;
                    cwd = meta.cwd;
                    git = meta.git.map(|g| GitContext {
                        branch: g.branch,
                        commit: g.commit_hash,
                        repo_url: g.repository_url,
                    });
                }
            }
            "turn_context" => {
                if model.is_none() {
                    model = raw
                        .payload
                        .get("model")
                        .and_then(|m| m.as_str())
                        .map(String::from);
                }
            }
            "event_msg" => {
                // Extract cumulative token usage from token_count events
                if raw.payload.get("type").and_then(|t| t.as_str()) == Some("token_count") {
                    if let Ok(tc) = serde_json::from_value::<RawTokenCount>(raw.payload) {
                        if let Some(usage) = tc.info.and_then(|i| i.total_token_usage) {
                            last_token_snapshot = Some(TokenUsage {
                                input: usage.input_tokens,
                                output: usage.output_tokens,
                                thinking: usage.reasoning_output_tokens,
                                cache_read: usage.cached_input_tokens,
                                cache_write: None,
                            });
                        }
                    }
                }
            }
            "response_item" => {
                if let Some(msg) = parse_response_item(&raw.payload, raw.timestamp) {
                    messages.push(msg);
                }
            }
            _ => {}
        }
    }

    if messages.is_empty() {
        return Ok(None);
    }

    // Attach final cumulative token snapshot to the last assistant message
    if let Some(tokens) = last_token_snapshot {
        if let Some(last_asst) = messages
            .iter_mut()
            .rev()
            .find(|m| m.role == Role::Assistant)
        {
            last_asst.tokens = Some(tokens);
        }
    }

    Ok(Some(Session {
        id: session_id,
        tool: Tool::Codex,
        hostname: None,
        project: None,
        model,
        start_time: first_ts.unwrap(),
        end_time: last_ts,
        duration_ms: None,
        cwd,
        git,
        messages,
    }))
}

fn parse_response_item(payload: &serde_json::Value, ts: DateTime<Utc>) -> Option<Message> {
    let item_type = payload.get("type")?.as_str()?;

    match item_type {
        "message" => {
            let role = match payload.get("role").and_then(|r| r.as_str()) {
                Some("user" | "developer") => Role::User,
                Some("assistant") => Role::Assistant,
                _ => return None,
            };

            let content = extract_codex_content(payload.get("content")?);
            if content.is_empty() {
                return None;
            }

            Some(Message {
                role,
                content,
                timestamp: ts,
                model: None,
                tokens: None,
                duration_ms: None,
                tool_calls: vec![],
            })
        }
        "function_call" => {
            let name = payload
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("unknown")
                .to_string();
            let args = payload
                .get("arguments")
                .and_then(|a| a.as_str())
                .and_then(|s| serde_json::from_str(s).ok());

            Some(Message {
                role: Role::Assistant,
                content: String::new(),
                timestamp: ts,
                model: None,
                tokens: None,
                duration_ms: None,
                tool_calls: vec![ToolCall {
                    name,
                    args,
                    status: None,
                }],
            })
        }
        _ => None,
    }
}

fn extract_codex_content(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|item| {
                let t = item.get("type")?.as_str()?;
                match t {
                    "input_text" | "text" | "output_text" => {
                        item.get("text").and_then(|v| v.as_str()).map(String::from)
                    }
                    _ => None,
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}
