use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use super::Collector;
use crate::schema::*;

// ── Raw Claude JSONL schema ─────────────────────────────────────────

#[derive(Deserialize)]
struct RawLine {
    #[serde(rename = "type")]
    line_type: String,
    timestamp: Option<DateTime<Utc>>,
    message: Option<RawChatMessage>,
    cwd: Option<String>,
    #[serde(rename = "gitBranch")]
    git_branch: Option<String>,
    // system subtype fields
    subtype: Option<String>,
    #[serde(rename = "durationMs")]
    duration_ms: Option<u64>,
}

#[derive(Deserialize)]
struct RawChatMessage {
    role: Option<String>,
    content: serde_json::Value,
    model: Option<String>,
    usage: Option<RawUsage>,
}

#[derive(Deserialize)]
struct RawUsage {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

// ── Collector ───────────────────────────────────────────────────────

pub struct ClaudeCollector {
    source: PathBuf,
}

impl ClaudeCollector {
    pub fn new() -> Self {
        Self::with_source(None)
    }

    pub fn with_source(source: Option<PathBuf>) -> Self {
        let source = source.unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot resolve home dir")
                .join(".claude/projects")
        });
        Self { source }
    }
}

impl Collector for ClaudeCollector {
    fn name(&self) -> &str {
        "claude"
    }

    fn source_dir(&self) -> &Path {
        &self.source
    }

    fn glob_patterns(&self) -> Vec<&str> {
        vec!["*/*.jsonl"]
    }

    fn parse(&self, raw_dir: &Path) -> Result<Vec<Session>> {
        let pattern = raw_dir.join("*/*.jsonl");
        let pattern = pattern.to_string_lossy();

        let mut sessions = Vec::new();
        for entry in glob::glob(&pattern)? {
            let path = entry?;
            if path.to_string_lossy().contains("/subagents/") {
                continue;
            }
            match parse_claude_file(&path) {
                Ok(Some(s)) => sessions.push(s),
                Ok(None) => {}
                Err(e) => eprintln!("warn: skipping {}: {e}", path.display()),
            }
        }
        sessions.sort_by_key(|s| s.start_time);
        Ok(sessions)
    }
}

fn parse_claude_file(path: &PathBuf) -> Result<Option<Session>> {
    let project = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string());

    let session_id = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let file = fs::File::open(path).context("open file")?;
    let reader = std::io::BufReader::new(file);

    let mut messages = Vec::new();
    let mut session_model: Option<String> = None;
    let mut session_cwd: Option<String> = None;
    let mut session_git_branch: Option<String> = None;
    let mut total_duration_ms: u64 = 0;
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

        let ts = match raw.timestamp {
            Some(t) => t,
            None => continue,
        };

        if first_ts.is_none() {
            first_ts = Some(ts);
        }
        last_ts = Some(ts);

        if session_cwd.is_none() {
            session_cwd = raw.cwd;
        }
        if session_git_branch.is_none() {
            session_git_branch = raw.git_branch;
        }

        // Collect turn durations from system messages
        if raw.line_type == "system" && raw.subtype.as_deref() == Some("turn_duration") {
            if let Some(d) = raw.duration_ms {
                total_duration_ms += d;
            }
            continue;
        }

        match raw.line_type.as_str() {
            "user" | "assistant" => {}
            _ => continue,
        }

        let chat = match raw.message {
            Some(m) => m,
            None => continue,
        };

        let role = match chat.role.as_deref() {
            Some("user") => Role::User,
            Some("assistant") => Role::Assistant,
            _ => continue,
        };

        let (content, tool_calls) = extract_content_and_tools(&chat.content);
        if content.is_empty() && tool_calls.is_empty() {
            continue;
        }

        if let Some(ref mdl) = chat.model {
            session_model = Some(mdl.clone());
        }

        let tokens = chat.usage.map(|u| TokenUsage {
            input: u.input_tokens,
            output: u.output_tokens,
            thinking: None, // Claude doesn't separate thinking tokens
            cache_read: u.cache_read_input_tokens,
            cache_write: u.cache_creation_input_tokens,
        });

        messages.push(Message {
            role,
            content,
            timestamp: ts,
            model: chat.model,
            tokens,
            duration_ms: None,
            tool_calls,
        });
    }

    if messages.is_empty() {
        return Ok(None);
    }

    let git = session_git_branch.map(|branch| GitContext {
        branch: Some(branch),
        commit: None,
        repo_url: None,
    });

    Ok(Some(Session {
        id: session_id,
        tool: Tool::Claude,
        hostname: None,
        project,
        model: session_model,
        start_time: first_ts.unwrap(),
        end_time: last_ts,
        duration_ms: if total_duration_ms > 0 {
            Some(total_duration_ms)
        } else {
            None
        },
        cwd: session_cwd,
        git,
        messages,
    }))
}

fn extract_content_and_tools(v: &serde_json::Value) -> (String, Vec<ToolCall>) {
    match v {
        serde_json::Value::String(s) => (s.clone(), vec![]),
        serde_json::Value::Array(arr) => {
            let mut texts = Vec::new();
            let mut tools = Vec::new();
            for item in arr {
                match item.get("type").and_then(|t| t.as_str()) {
                    Some("text") => {
                        if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                            texts.push(t.to_string());
                        }
                    }
                    Some("tool_use") => {
                        let name = item
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        let args = item.get("input").cloned();
                        tools.push(ToolCall {
                            name,
                            args,
                            status: None,
                        });
                    }
                    _ => {}
                }
            }
            (texts.join("\n"), tools)
        }
        _ => (String::new(), vec![]),
    }
}
