use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::Deserialize;

use super::Collector;
use crate::schema::*;

// ── Raw Kimi JSONL schema ───────────────────────────────────────────

#[derive(Deserialize)]
struct RawLine {
    role: String,
    content: Option<serde_json::Value>,
    tool_calls: Option<Vec<RawToolCall>>,
    token_count: Option<u64>,
}

#[derive(Deserialize)]
struct RawToolCall {
    function: RawFunction,
}

#[derive(Deserialize)]
struct RawFunction {
    name: String,
    arguments: Option<String>,
}

#[derive(Deserialize)]
struct Metadata {
    session_id: String,
    title: Option<String>,
}

// ── Collector ───────────────────────────────────────────────────────

pub struct KimiCollector {
    source: PathBuf,
}

impl KimiCollector {
    pub fn new() -> Self {
        let home = dirs::home_dir().expect("cannot resolve home dir");
        Self {
            source: home.join(".kimi/sessions"),
        }
    }
}

impl Collector for KimiCollector {
    fn name(&self) -> &str {
        "kimi"
    }

    fn source_dir(&self) -> &Path {
        &self.source
    }

    fn glob_patterns(&self) -> Vec<&str> {
        vec!["*/*/context.jsonl", "*/*/metadata.json"]
    }

    fn parse(&self, raw_dir: &Path) -> Result<Vec<Session>> {
        let pattern = raw_dir.join("*/*/context.jsonl");
        let pattern = pattern.to_string_lossy();

        let mut sessions = Vec::new();
        for entry in glob::glob(&pattern)? {
            let path = entry?;
            match parse_kimi_session(&path) {
                Ok(Some(s)) => sessions.push(s),
                Ok(None) => {}
                Err(e) => eprintln!("warn: skipping {}: {e}", path.display()),
            }
        }
        sessions.sort_by_key(|s| s.start_time);
        Ok(sessions)
    }
}

fn parse_kimi_session(context_path: &PathBuf) -> Result<Option<Session>> {
    let session_dir = context_path.parent().unwrap();
    let project_hash = session_dir
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string());

    let meta_path = session_dir.join("metadata.json");
    let (session_id, title) = if meta_path.exists() {
        let data = fs::read_to_string(&meta_path).context("read metadata")?;
        let meta: Metadata = serde_json::from_str(&data).unwrap_or(Metadata {
            session_id: String::new(),
            title: None,
        });
        (meta.session_id, meta.title)
    } else {
        let id = session_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        (id, None)
    };

    let file = fs::File::open(context_path).context("open context.jsonl")?;
    let reader = std::io::BufReader::new(file);

    let mut messages = Vec::new();
    let mut last_tokens: Option<u64> = None;

    let file_meta = fs::metadata(context_path)?;
    let mtime: DateTime<Utc> = file_meta.modified()?.into();

    for line in reader.lines() {
        let line = line.context("read line")?;
        if line.trim().is_empty() {
            continue;
        }

        let raw: RawLine = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match raw.role.as_str() {
            "_usage" => {
                let new_total = raw.token_count.unwrap_or(0);
                let delta = last_tokens.map(|prev| new_total.saturating_sub(prev));
                last_tokens = Some(new_total);

                if let Some(delta) = delta {
                    if let Some(last) = messages.last_mut() {
                        let msg: &mut Message = last;
                        if msg.role == Role::Assistant && msg.tokens.is_none() {
                            msg.tokens = Some(TokenUsage {
                                input: None,
                                output: Some(delta),
                                thinking: None,
                                cache_read: None,
                                cache_write: None,
                            });
                        }
                    }
                }
            }
            "_checkpoint" => continue,
            "user" => {
                let content = extract_content(&raw.content);
                if content.is_empty() {
                    continue;
                }
                messages.push(Message {
                    role: Role::User,
                    content,
                    timestamp: mtime,
                    model: None,
                    tokens: None,
                    duration_ms: None,
                    tool_calls: vec![],
                });
            }
            "assistant" => {
                let content = extract_content(&raw.content);
                let tool_calls: Vec<ToolCall> = raw
                    .tool_calls
                    .unwrap_or_default()
                    .into_iter()
                    .map(|tc| {
                        let args = tc
                            .function
                            .arguments
                            .as_deref()
                            .and_then(|s| serde_json::from_str(s).ok());
                        ToolCall {
                            name: tc.function.name,
                            args,
                            status: None,
                        }
                    })
                    .collect();

                if content.is_empty() && tool_calls.is_empty() {
                    continue;
                }

                messages.push(Message {
                    role: Role::Assistant,
                    content,
                    timestamp: mtime,
                    model: None,
                    tokens: None,
                    duration_ms: None,
                    tool_calls,
                });
            }
            "tool" => continue,
            _ => continue,
        }
    }

    if messages.is_empty() {
        return Ok(None);
    }

    let project = title.or(project_hash);

    Ok(Some(Session {
        id: session_id,
        tool: Tool::Kimi,
        project,
        model: None,
        start_time: mtime,
        end_time: None,
        duration_ms: None,
        cwd: None,
        git: None,
        messages,
    }))
}

fn extract_content(v: &Option<serde_json::Value>) -> String {
    match v {
        None => String::new(),
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|item| match item.get("type").and_then(|t| t.as_str()) {
                Some("text") => item.get("text").and_then(|t| t.as_str()).map(String::from),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}
