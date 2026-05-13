use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Which tool produced this session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Tool {
    Gemini,
    Claude,
    Codex,
    Kimi,
}

/// Unified role across all tools.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
    System,
}

/// A single tool invocation recorded inside a message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub args: Option<serde_json::Value>,
    pub status: Option<String>,
}

/// Token usage for one assistant turn.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TokenUsage {
    pub input: Option<u64>,
    pub output: Option<u64>,
    pub thinking: Option<u64>,
    pub cache_read: Option<u64>,
    pub cache_write: Option<u64>,
}

/// A unified message in the conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub model: Option<String>,
    pub tokens: Option<TokenUsage>,
    pub duration_ms: Option<u64>,
    pub tool_calls: Vec<ToolCall>,
}

/// Git context at the time of the session/message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitContext {
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub repo_url: Option<String>,
}

/// A unified session — one continuous conversation with a tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub tool: Tool,
    pub hostname: Option<String>,
    pub project: Option<String>,
    pub model: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub cwd: Option<String>,
    pub git: Option<GitContext>,
    pub messages: Vec<Message>,
}

impl std::fmt::Display for Tool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Tool::Gemini => write!(f, "gemini"),
            Tool::Claude => write!(f, "claude"),
            Tool::Codex => write!(f, "codex"),
            Tool::Kimi => write!(f, "kimi"),
        }
    }
}
