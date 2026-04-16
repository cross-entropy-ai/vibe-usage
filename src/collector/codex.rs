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

    fn parse_glob(&self) -> &str {
        "*/*/*/*.jsonl"
    }

    fn parse_file(&self, path: &Path) -> Result<ParseResult> {
        let sessions = parse_codex_file(&path.to_path_buf())?
            .into_iter()
            .collect();
        Ok(ParseResult { sessions, warnings: vec![] })
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
    let mut session_model: Option<String> = None;
    let mut current_model: Option<String> = None;
    let mut messages = Vec::new();
    let mut first_ts: Option<DateTime<Utc>> = None;
    let mut last_ts: Option<DateTime<Utc>> = None;
    let mut last_assistant_idx: Option<usize> = None;
    let mut pending_token_snapshot: Option<TokenUsage> = None;
    let mut last_assigned_snapshot: Option<TokenUsage> = None;
    let mut assistant_block_open = false;

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
                current_model = raw
                    .payload
                    .get("model")
                    .and_then(|m| m.as_str())
                    .map(String::from);
                if session_model.is_none() {
                    session_model = current_model.clone();
                }
            }
            "event_msg" => {
                // Cache the latest cumulative token snapshot for the current assistant block.
                if assistant_block_open
                    && raw.payload.get("type").and_then(|t| t.as_str()) == Some("token_count")
                {
                    if let Ok(tc) = serde_json::from_value::<RawTokenCount>(raw.payload) {
                        if let Some(usage) = tc.info.and_then(|i| i.total_token_usage) {
                            pending_token_snapshot = Some(TokenUsage {
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
                let is_user_message = raw
                    .payload
                    .get("type")
                    .and_then(|t| t.as_str())
                    .is_some_and(|t| t == "message")
                    && raw
                        .payload
                        .get("role")
                        .and_then(|r| r.as_str())
                        .is_some_and(|r| r == "user");

                if is_user_message && assistant_block_open {
                    finalize_codex_turn(
                        &mut messages,
                        last_assistant_idx,
                        &mut pending_token_snapshot,
                        &mut last_assigned_snapshot,
                    );
                    assistant_block_open = false;
                    last_assistant_idx = None;
                }

                if let Some(msg) =
                    parse_response_item(&raw.payload, raw.timestamp, current_model.as_ref())
                {
                    if msg.role == Role::Assistant {
                        last_assistant_idx = Some(messages.len());
                        assistant_block_open = true;
                    }
                    messages.push(msg);
                }
            }
            _ => {}
        }
    }

    if messages.is_empty() {
        return Ok(None);
    }

    // Attach the final cumulative token snapshot to the last assistant in the open block.
    if assistant_block_open {
        finalize_codex_turn(
            &mut messages,
            last_assistant_idx,
            &mut pending_token_snapshot,
            &mut last_assigned_snapshot,
        );
    }

    Ok(Some(Session {
        id: session_id,
        tool: Tool::Codex,
        hostname: None,
        project: None,
        model: session_model,
        start_time: first_ts.unwrap(),
        end_time: last_ts,
        duration_ms: None,
        cwd,
        git,
        messages,
    }))
}

fn finalize_codex_turn(
    messages: &mut [Message],
    last_assistant_idx: Option<usize>,
    pending_token_snapshot: &mut Option<TokenUsage>,
    last_assigned_snapshot: &mut Option<TokenUsage>,
) {
    let Some(idx) = last_assistant_idx else {
        pending_token_snapshot.take();
        return;
    };

    let Some(current_snapshot) = pending_token_snapshot.take() else {
        return;
    };

    let delta = token_delta(&current_snapshot, last_assigned_snapshot.as_ref());
    if let Some(msg) = messages.get_mut(idx) {
        msg.tokens = Some(delta);
    }
    *last_assigned_snapshot = Some(current_snapshot);
}

fn token_delta(current: &TokenUsage, previous: Option<&TokenUsage>) -> TokenUsage {
    let previous = previous.cloned().unwrap_or_default();
    TokenUsage {
        input: current
            .input
            .map(|value| value.saturating_sub(previous.input.unwrap_or(0))),
        output: current
            .output
            .map(|value| value.saturating_sub(previous.output.unwrap_or(0))),
        thinking: current
            .thinking
            .map(|value| value.saturating_sub(previous.thinking.unwrap_or(0))),
        cache_read: current
            .cache_read
            .map(|value| value.saturating_sub(previous.cache_read.unwrap_or(0))),
        cache_write: current
            .cache_write
            .map(|value| value.saturating_sub(previous.cache_write.unwrap_or(0))),
    }
}

fn parse_response_item(
    payload: &serde_json::Value,
    ts: DateTime<Utc>,
    model: Option<&String>,
) -> Option<Message> {
    let item_type = payload.get("type")?.as_str()?;

    match item_type {
        "message" => {
            let role = match payload.get("role").and_then(|r| r.as_str()) {
                Some("user") => Role::User,
                Some("developer") => Role::System,
                Some("assistant") => Role::Assistant,
                _ => return None,
            };
            let is_assistant = role == Role::Assistant;

            let content = extract_codex_content(payload.get("content")?);
            if content.is_empty() {
                return None;
            }

            Some(Message {
                role,
                content,
                timestamp: ts,
                model: if is_assistant { model.cloned() } else { None },
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
                model: model.cloned(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::json;

    fn temp_dir(name: &str) -> PathBuf {
        let uniq = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("vibe-usage-codex-{name}-{uniq}"))
    }

    fn write_jsonl(path: &Path, lines: &[serde_json::Value]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut out = String::new();
        for line in lines {
            out.push_str(&serde_json::to_string(line).unwrap());
            out.push('\n');
        }
        fs::write(path, out).unwrap();
    }

    fn ts(hour: u32) -> String {
        Utc.with_ymd_and_hms(2026, 4, 16, hour, 0, 0)
            .unwrap()
            .to_rfc3339()
    }

    fn token_count(input: u64, output: u64, cache_read: u64, thinking: u64) -> serde_json::Value {
        json!({
            "type": "token_count",
            "info": {
                "total_token_usage": {
                    "input_tokens": input,
                    "output_tokens": output,
                    "cached_input_tokens": cache_read,
                    "reasoning_output_tokens": thinking
                }
            }
        })
    }

    #[test]
    fn assigns_token_deltas_per_assistant_turn() {
        let dir = temp_dir("per-turn");
        let path = dir.join("session.jsonl");
        write_jsonl(
            &path,
            &[
                json!({"timestamp": ts(1), "type": "session_meta", "payload": {"id": "s-1", "cwd": "/tmp/project", "git": {"branch": "main", "commit_hash": "abc123", "repository_url": "https://example.com/repo.git"}}}),
                json!({"timestamp": ts(2), "type": "turn_context", "payload": {"model": "gpt-5"}}),
                json!({"timestamp": ts(3), "type": "response_item", "payload": {"type": "message", "role": "user", "content": "hi"}}),
                json!({"timestamp": ts(4), "type": "response_item", "payload": {"type": "message", "role": "assistant", "content": "first"}}),
                json!({"timestamp": ts(5), "type": "event_msg", "payload": token_count(10, 2, 1, 3)}),
                json!({"timestamp": ts(6), "type": "response_item", "payload": {"type": "message", "role": "user", "content": "next"}}),
                json!({"timestamp": ts(7), "type": "turn_context", "payload": {"model": "gpt-5-codex"}}),
                json!({"timestamp": ts(8), "type": "response_item", "payload": {"type": "message", "role": "assistant", "content": "second"}}),
                json!({"timestamp": ts(9), "type": "event_msg", "payload": token_count(25, 7, 4, 8)}),
            ],
        );

        let session = parse_codex_file(&path).unwrap().unwrap();
        assert_eq!(session.model.as_deref(), Some("gpt-5"));
        assert_eq!(session.messages.len(), 4);
        assert_eq!(session.messages[1].model.as_deref(), Some("gpt-5"));
        assert_eq!(session.messages[1].tokens.as_ref().unwrap().input, Some(10));
        assert_eq!(session.messages[1].tokens.as_ref().unwrap().output, Some(2));
        assert_eq!(session.messages[3].model.as_deref(), Some("gpt-5-codex"));
        assert_eq!(session.messages[3].tokens.as_ref().unwrap().input, Some(15));
        assert_eq!(session.messages[3].tokens.as_ref().unwrap().output, Some(5));

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn attaches_tokens_to_tool_call_tail() {
        let dir = temp_dir("tool-tail");
        let path = dir.join("session.jsonl");
        write_jsonl(
            &path,
            &[
                json!({"timestamp": ts(1), "type": "session_meta", "payload": {"id": "s-2"}}),
                json!({"timestamp": ts(2), "type": "turn_context", "payload": {"model": "gpt-5"}}),
                json!({"timestamp": ts(3), "type": "response_item", "payload": {"type": "message", "role": "user", "content": "run it"}}),
                json!({"timestamp": ts(4), "type": "response_item", "payload": {"type": "message", "role": "assistant", "content": "I will"}}),
                json!({"timestamp": ts(5), "type": "response_item", "payload": {"type": "function_call", "name": "shell", "arguments": "{\"cmd\":\"echo hi\"}"}}),
                json!({"timestamp": ts(6), "type": "event_msg", "payload": token_count(11, 3, 0, 1)}),
            ],
        );

        let session = parse_codex_file(&path).unwrap().unwrap();
        assert_eq!(session.messages.len(), 3);
        assert!(session.messages[1].tokens.is_none());
        assert_eq!(session.messages[2].tool_calls.len(), 1);
        assert_eq!(session.messages[2].tokens.as_ref().unwrap().input, Some(11));
        assert_eq!(session.messages[2].tokens.as_ref().unwrap().output, Some(3));

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn developer_messages_map_to_system_role() {
        let ts = Utc.with_ymd_and_hms(2026, 4, 16, 8, 0, 0).unwrap();
        let payload = json!({
            "type": "message",
            "role": "developer",
            "content": [
                {"type": "input_text", "text": "Follow these instructions."}
            ]
        });

        let msg = parse_response_item(&payload, ts, None).expect("expected message");
        assert_eq!(msg.role, Role::System);
        assert_eq!(msg.content, "Follow these instructions.");
    }
}
