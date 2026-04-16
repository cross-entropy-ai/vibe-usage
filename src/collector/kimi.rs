use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, TimeZone, Utc};
use serde::Deserialize;

use super::{Collector, ParseResult};
use crate::schema::*;

// ── Raw Kimi JSONL schema ───────────────────────────────────────────

#[derive(Deserialize)]
struct RawLine {
    role: String,
    content: Option<serde_json::Value>,
    tool_calls: Option<Vec<RawToolCall>>,
    token_count: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_flexible_timestamp_opt")]
    timestamp: Option<DateTime<Utc>>,
    #[serde(default, deserialize_with = "deserialize_flexible_timestamp_opt")]
    created_at: Option<DateTime<Utc>>,
    #[serde(default, deserialize_with = "deserialize_flexible_timestamp_opt")]
    updated_at: Option<DateTime<Utc>>,
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

struct DraftMessage {
    role: Role,
    content: String,
    timestamp: Option<DateTime<Utc>>,
    model: Option<String>,
    tokens: Option<TokenUsage>,
    duration_ms: Option<u64>,
    tool_calls: Vec<ToolCall>,
}

#[derive(Default)]
struct WireTurn {
    begin: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    last: Option<DateTime<Utc>>,
}

#[derive(Default)]
struct WireTimeline {
    first_timestamp: Option<DateTime<Utc>>,
    turns: Vec<WireTurn>,
}

// ── Collector ───────────────────────────────────────────────────────

pub struct KimiCollector {
    source: PathBuf,
}

impl KimiCollector {
    pub fn new() -> Self {
        Self::with_source(None)
    }

    pub fn with_source(source: Option<PathBuf>) -> Self {
        let source = source.unwrap_or_else(|| {
            dirs::home_dir()
                .expect("cannot resolve home dir")
                .join(".kimi/sessions")
        });
        Self { source }
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
        vec!["*/*/context.jsonl", "*/*/metadata.json", "*/*/wire.jsonl"]
    }

    fn parse(&self, raw_dir: &Path) -> Result<ParseResult> {
        let pattern = raw_dir.join("*/*/context.jsonl");
        let pattern = pattern.to_string_lossy();

        let mut sessions = Vec::new();
        let mut warnings = Vec::new();
        for entry in glob::glob(&pattern)? {
            let path = match entry {
                Ok(p) => p,
                Err(e) => {
                    warnings.push(format!("kimi: glob entry: {e}"));
                    continue;
                }
            };
            match parse_kimi_session(&path) {
                Ok(Some(s)) => sessions.push(s),
                Ok(None) => {}
                Err(e) => warnings.push(format!("kimi: {}: {e}", path.display())),
            }
        }
        sessions.sort_by_key(|s| s.start_time);
        Ok(ParseResult { sessions, warnings })
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

    let wire_path = session_dir.join("wire.jsonl");
    let wire = parse_kimi_wire_timeline(&wire_path)?;

    let file = fs::File::open(context_path).context("open context.jsonl")?;
    let reader = std::io::BufReader::new(file);

    let mut drafts: Vec<DraftMessage> = Vec::new();
    let mut last_tokens: Option<u64> = None;
    let mut first_raw_timestamp = wire.first_timestamp;

    for line in reader.lines() {
        let line = line.context("read line")?;
        if line.trim().is_empty() {
            continue;
        }

        let raw: RawLine = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let line_timestamp = raw.timestamp.or(raw.created_at).or(raw.updated_at);
        if let Some(ts) = line_timestamp {
            first_raw_timestamp = Some(match first_raw_timestamp {
                Some(current) if current <= ts => current,
                _ => ts,
            });
        }

        match raw.role.as_str() {
            "_usage" => {
                let new_total = raw.token_count.unwrap_or(0);
                let delta = last_tokens.map(|prev| new_total.saturating_sub(prev));
                last_tokens = Some(new_total);

                if let Some(delta) = delta {
                    if let Some(last) = drafts.last_mut() {
                        if last.role == Role::Assistant && last.tokens.is_none() {
                            last.tokens = Some(TokenUsage {
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
                drafts.push(DraftMessage {
                    role: Role::User,
                    content,
                    timestamp: line_timestamp,
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

                drafts.push(DraftMessage {
                    role: Role::Assistant,
                    content,
                    timestamp: line_timestamp,
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

    // When Kimi does not expose any timestamps, keep the session anchored to a
    // synthetic raw-data time instead of copied-file mtime.
    let session_start = first_raw_timestamp.unwrap_or_else(unix_epoch);
    let timestamps = assign_kimi_timestamps(&drafts, &wire, session_start);
    let mut messages = Vec::with_capacity(drafts.len());
    for (draft, timestamp) in drafts.into_iter().zip(timestamps.into_iter()) {
        messages.push(Message {
            role: draft.role,
            content: draft.content,
            timestamp,
            model: draft.model,
            tokens: draft.tokens,
            duration_ms: draft.duration_ms,
            tool_calls: draft.tool_calls,
        });
    }

    if messages.is_empty() {
        return Ok(None);
    }

    let project = title.or(project_hash);

    Ok(Some(Session {
        id: session_id,
        tool: Tool::Kimi,
        hostname: None,
        project,
        model: None,
        start_time: session_start,
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

fn parse_kimi_wire_timeline(path: &Path) -> Result<WireTimeline> {
    if !path.exists() {
        return Ok(WireTimeline::default());
    }

    let file = fs::File::open(path).context("open wire.jsonl")?;
    let reader = std::io::BufReader::new(file);

    let mut timeline = WireTimeline::default();
    let mut current_turn: Option<WireTurn> = None;

    for line in reader.lines() {
        let line = line.context("read wire line")?;
        if line.trim().is_empty() {
            continue;
        }

        let raw: WireRecord = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let Some(ts) = raw.timestamp else {
            continue;
        };

        timeline.first_timestamp = Some(match timeline.first_timestamp {
            Some(current) if current <= ts => current,
            _ => ts,
        });

        let Some(message) = raw.message else {
            continue;
        };

        match message.msg_type.as_str() {
            "TurnBegin" => {
                if let Some(prev) = current_turn.take() {
                    timeline.turns.push(prev);
                }
                let mut new_turn = WireTurn::default();
                new_turn.begin = Some(ts);
                new_turn.last = Some(ts);
                current_turn = Some(new_turn);
            }
            "TurnEnd" => {
                let turn = current_turn.get_or_insert_with(WireTurn::default);
                if turn.begin.is_none() {
                    turn.begin = Some(ts);
                }
                turn.end = Some(ts);
                turn.last = Some(ts);
            }
            _ => {
                if let Some(turn) = current_turn.as_mut() {
                    turn.last = Some(ts);
                }
            }
        }
    }

    if let Some(turn) = current_turn {
        timeline.turns.push(turn);
    }

    Ok(timeline)
}

fn assign_kimi_timestamps(
    drafts: &[DraftMessage],
    wire: &WireTimeline,
    session_start: DateTime<Utc>,
) -> Vec<DateTime<Utc>> {
    let mut result = Vec::with_capacity(drafts.len());
    let mut turn_idx = 0usize;

    for (idx, draft) in drafts.iter().enumerate() {
        let turn = wire.turns.get(turn_idx);
        let ts = draft.timestamp.or_else(|| {
            turn.and_then(|t| match draft.role {
                Role::User => t.begin,
                Role::Assistant => t.end.or(t.last).or(t.begin),
                Role::System => None,
            })
        });
        let ts = ts.unwrap_or_else(|| session_start + chrono::Duration::milliseconds(idx as i64));
        result.push(ts);

        if draft.role == Role::Assistant && turn.is_some() {
            turn_idx += 1;
        }
    }

    result
}

fn unix_epoch() -> DateTime<Utc> {
    Utc.timestamp_opt(0, 0).single().unwrap()
}

#[derive(Deserialize)]
struct WireRecord {
    #[serde(default, deserialize_with = "deserialize_flexible_timestamp_opt")]
    timestamp: Option<DateTime<Utc>>,
    message: Option<WireMessage>,
}

#[derive(Deserialize)]
struct WireMessage {
    #[serde(rename = "type")]
    msg_type: String,
}

fn deserialize_flexible_timestamp_opt<'de, D>(
    deserializer: D,
) -> std::result::Result<Option<DateTime<Utc>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(parse_flexible_timestamp_value))
}

fn parse_flexible_timestamp_value(value: serde_json::Value) -> Option<DateTime<Utc>> {
    match value {
        serde_json::Value::String(s) => DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc)),
        serde_json::Value::Number(n) => n.as_f64().and_then(timestamp_from_seconds),
        _ => None,
    }
}

fn timestamp_from_seconds(seconds: f64) -> Option<DateTime<Utc>> {
    if !seconds.is_finite() {
        return None;
    }

    let secs = seconds.trunc() as i64;
    let nanos = ((seconds.fract().abs() * 1_000_000_000.0).round() as u32).min(999_999_999);
    Utc.timestamp_opt(secs, nanos).single()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("vibe-usage-{name}-{}-{stamp}", std::process::id()));
        path
    }

    fn write_session(root: &Path, context: &str, wire: Option<&str>) -> PathBuf {
        let session_dir = root.join("group").join("session-1");
        fs::create_dir_all(&session_dir).unwrap();
        fs::write(
            session_dir.join("metadata.json"),
            r#"{"session_id":"kimi-123","title":"Kimi Test"}"#,
        )
        .unwrap();
        fs::write(session_dir.join("context.jsonl"), context).unwrap();
        if let Some(wire) = wire {
            fs::write(session_dir.join("wire.jsonl"), wire).unwrap();
        }
        session_dir.join("context.jsonl")
    }

    #[test]
    fn parse_kimi_session_prefers_wire_timestamps() {
        let root = unique_temp_dir("wire");
        let context_path = write_session(
            &root,
            r#"{"role":"user","content":"Hello"}
{"role":"assistant","content":"Hi there"}
"#,
            Some(
                r#"{"type":"metadata","protocol_version":"1.3"}
{"timestamp":1770983426.420942,"message":{"type":"TurnBegin","payload":{"user_input":"Hello"}}}
{"timestamp":1770983430.25,"message":{"type":"StepBegin","payload":{"n":1}}}
{"timestamp":1770983432.75,"message":{"type":"TurnEnd","payload":{}}}
"#,
            ),
        );

        let session = parse_kimi_session(&context_path).unwrap().unwrap();
        let expected_begin = timestamp_from_seconds(1_770_983_426.420_942).unwrap();
        let expected_end = timestamp_from_seconds(1_770_983_432.75).unwrap();
        assert_eq!(session.start_time, expected_begin);
        assert_eq!(session.messages[0].timestamp, expected_begin);
        assert_eq!(session.messages[1].timestamp, expected_end);
    }

    #[test]
    fn parse_kimi_session_uses_raw_context_timestamps_when_present() {
        let root = unique_temp_dir("context");
        let context_path = write_session(
            &root,
            r#"{"role":"user","content":"Hello","timestamp":"2026-04-16T01:02:03Z"}
{"role":"assistant","content":"Hi there","timestamp":"2026-04-16T01:02:09Z"}
"#,
            None,
        );

        let session = parse_kimi_session(&context_path).unwrap().unwrap();
        let expected_user = DateTime::parse_from_rfc3339("2026-04-16T01:02:03Z")
            .unwrap()
            .with_timezone(&Utc);
        let expected_assistant = DateTime::parse_from_rfc3339("2026-04-16T01:02:09Z")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(session.start_time, expected_user);
        assert_eq!(session.messages[0].timestamp, expected_user);
        assert_eq!(session.messages[1].timestamp, expected_assistant);
    }
}
