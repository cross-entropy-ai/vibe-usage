use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use super::Collector;
use crate::schema::*;

// ── Raw Gemini JSON schema ──────────────────────────────────────────

#[derive(Deserialize)]
struct RawSession {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "startTime")]
    start_time: DateTime<Utc>,
    #[serde(rename = "lastUpdated")]
    last_updated: Option<DateTime<Utc>>,
    messages: Vec<RawMessage>,
}

#[derive(Deserialize)]
struct RawMessage {
    #[serde(rename = "type")]
    msg_type: String,
    timestamp: DateTime<Utc>,
    content: serde_json::Value,
    model: Option<String>,
    tokens: Option<RawTokens>,
    #[serde(rename = "toolCalls")]
    tool_calls: Option<Vec<RawToolCall>>,
}

#[derive(Deserialize)]
struct RawTokens {
    input: Option<u64>,
    output: Option<u64>,
    cached: Option<u64>,
    thoughts: Option<u64>,
}

#[derive(Deserialize)]
struct RawToolCall {
    name: String,
    args: Option<serde_json::Value>,
    status: Option<String>,
}

// ── Collector ───────────────────────────────────────────────────────

pub struct GeminiCollector {
    source: PathBuf,
}

impl GeminiCollector {
    pub fn new() -> Self {
        let home = dirs::home_dir().expect("cannot resolve home dir");
        Self {
            source: home.join(".gemini/tmp"),
        }
    }
}

impl Collector for GeminiCollector {
    fn name(&self) -> &str {
        "gemini"
    }

    fn source_dir(&self) -> &Path {
        &self.source
    }

    fn glob_patterns(&self) -> Vec<&str> {
        vec!["*/chats/*.json"]
    }

    fn parse(&self, raw_dir: &Path) -> Result<Vec<Session>> {
        let pattern = raw_dir.join("*/chats/*.json");
        let pattern = pattern.to_string_lossy();

        let mut sessions = Vec::new();
        for entry in glob::glob(&pattern)? {
            let path = entry?;
            match parse_gemini_file(&path) {
                Ok(s) => sessions.push(s),
                Err(e) => eprintln!("warn: skipping {}: {e}", path.display()),
            }
        }
        sessions.sort_by_key(|s| s.start_time);
        Ok(sessions)
    }
}

fn parse_gemini_file(path: &PathBuf) -> Result<Session> {
    let project = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string());

    let data = fs::read_to_string(path).context("read file")?;
    let raw: RawSession = serde_json::from_str(&data).context("parse json")?;

    let mut model: Option<String> = None;
    let messages: Vec<Message> = raw
        .messages
        .into_iter()
        .filter_map(|m| {
            let role = match m.msg_type.as_str() {
                "user" => Role::User,
                "gemini" => Role::Assistant,
                "warning" | "error" | "info" => Role::System,
                _ => return None,
            };

            let content = extract_content(&m.content);
            if content.is_empty() && m.tool_calls.is_none() {
                return None;
            }

            if let Some(ref mdl) = m.model {
                model = Some(mdl.clone());
            }

            let tokens = m.tokens.map(|t| TokenUsage {
                input: t.input,
                output: t.output,
                thinking: t.thoughts,
                cache_read: t.cached,
                cache_write: None,
            });

            let tool_calls = m
                .tool_calls
                .unwrap_or_default()
                .into_iter()
                .map(|tc| ToolCall {
                    name: tc.name,
                    args: tc.args,
                    status: tc.status,
                })
                .collect();

            Some(Message {
                role,
                content,
                timestamp: m.timestamp,
                model: m.model,
                tokens,
                duration_ms: None,
                tool_calls,
            })
        })
        .collect();

    Ok(Session {
        id: raw.session_id,
        tool: Tool::Gemini,
        project,
        model,
        start_time: raw.start_time,
        end_time: raw.last_updated,
        duration_ms: None,
        cwd: None,
        git: None,
        messages,
    })
}

fn extract_content(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}
