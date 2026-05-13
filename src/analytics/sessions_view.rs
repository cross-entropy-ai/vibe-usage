use crate::schema::{Role, Session};

const TITLE_MAX_LEN: usize = 80;
const TITLE_FALLBACK: &str = "(no prompt)";

pub fn extract_title(session: &Session) -> String {
    let raw = session
        .messages
        .iter()
        .find(|m| matches!(m.role, Role::User) && !m.content.trim().is_empty())
        .map(|m| m.content.as_str());

    match raw {
        Some(text) => truncate_title(&collapse_whitespace(text)),
        None => TITLE_FALLBACK.to_string(),
    }
}

fn collapse_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_title(s: &str) -> String {
    if s.chars().count() <= TITLE_MAX_LEN {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(TITLE_MAX_LEN).collect();
        out.push('…');
        out
    }
}

pub fn token_total(session: &Session) -> u64 {
    session
        .messages
        .iter()
        .filter_map(|m| m.tokens.as_ref())
        .map(|t| {
            t.input.unwrap_or(0) + t.output.unwrap_or(0) + t.thinking.unwrap_or(0)
        })
        .sum()
}

const PREVIEW_MAX_LEN: usize = 200;
const PREVIEW_WINDOW: usize = 80;

pub struct MatchResult {
    pub match_count: usize,
    pub preview: Option<String>,
}

pub fn match_session(session: &Session, terms_lower: &[&str]) -> Option<MatchResult> {
    if terms_lower.is_empty() {
        return Some(MatchResult { match_count: 0, preview: None });
    }

    let mut total_matches = 0usize;
    let mut first_preview: Option<String> = None;

    for m in &session.messages {
        if !matches!(m.role, Role::User | Role::Assistant) {
            continue;
        }
        let content_lower = m.content.to_lowercase();

        if !terms_lower.iter().all(|t| content_lower.contains(t)) {
            continue;
        }

        total_matches += 1;

        if first_preview.is_none() {
            let first_term = terms_lower[0];
            if let Some(idx) = content_lower.find(first_term) {
                first_preview = Some(build_preview(&m.content, idx, first_term.len()));
            }
        }
    }

    if total_matches == 0 {
        return None;
    }
    Some(MatchResult {
        match_count: total_matches,
        preview: first_preview,
    })
}

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

const NO_PROJECT_KEY: &str = "__none__";

#[derive(Debug, Clone, Deserialize)]
pub struct ListQuery {
    pub project: Option<String>,
    pub tool: Option<String>,
    pub q: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    200
}

impl Default for ListQuery {
    fn default() -> Self {
        Self {
            project: None,
            tool: None,
            q: None,
            limit: default_limit(),
            offset: 0,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SessionListItem {
    pub id: String,
    pub tool: String,
    pub project: Option<String>,
    pub model: Option<String>,
    pub start_time: DateTime<Utc>,
    pub message_count: usize,
    pub token_total: u64,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_preview: Option<String>,
    pub match_count: usize,
}

#[derive(Debug, Serialize)]
pub struct SessionListResponse {
    pub total: usize,
    pub offset: usize,
    pub count: usize,
    pub sessions: Vec<SessionListItem>,
}

pub fn build_list(sessions: &[Session], q: &ListQuery) -> SessionListResponse {
    let terms_lower: Vec<String> = q
        .q
        .as_deref()
        .map(|s| {
            s.split_whitespace()
                .map(|t| t.to_lowercase())
                .collect()
        })
        .unwrap_or_default();
    let terms_ref: Vec<&str> = terms_lower.iter().map(|s| s.as_str()).collect();

    let mut filtered: Vec<(SessionListItem, DateTime<Utc>)> = Vec::new();

    for s in sessions {
        if let Some(proj) = &q.project {
            let matches_proj = match s.project.as_deref() {
                Some(p) => proj == p,
                None => proj == NO_PROJECT_KEY,
            };
            if !matches_proj {
                continue;
            }
        }
        if let Some(tool) = &q.tool {
            if s.tool.to_string() != *tool {
                continue;
            }
        }

        let match_result = if terms_ref.is_empty() {
            None
        } else {
            match match_session(s, &terms_ref) {
                Some(m) => Some(m),
                None => continue, // search active but no hit -> drop
            }
        };

        let (match_preview, match_count) = match match_result {
            Some(m) => (m.preview, m.match_count),
            None => (None, 0),
        };

        let item = SessionListItem {
            id: s.id.clone(),
            tool: s.tool.to_string(),
            project: s.project.clone(),
            model: s.model.clone(),
            start_time: s.start_time,
            message_count: s.messages.len(),
            token_total: token_total(s),
            title: extract_title(s),
            match_preview,
            match_count,
        };
        filtered.push((item, s.start_time));
    }

    // Newest first
    filtered.sort_by(|a, b| b.1.cmp(&a.1));

    let total = filtered.len();
    let offset = q.offset.min(total);
    let limit = q.limit.min(2000);
    let page: Vec<SessionListItem> = filtered
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|(item, _)| item)
        .collect();

    SessionListResponse {
        total,
        offset,
        count: page.len(),
        sessions: page,
    }
}

fn build_preview(content: &str, byte_idx: usize, match_len: usize) -> String {
    let start = content[..byte_idx]
        .char_indices()
        .rev()
        .nth(PREVIEW_WINDOW)
        .map(|(i, _)| i)
        .unwrap_or(0);
    let end_byte = byte_idx + match_len;
    let end = content[end_byte..]
        .char_indices()
        .nth(PREVIEW_WINDOW)
        .map(|(i, _)| end_byte + i)
        .unwrap_or(content.len());

    let mut snippet = String::new();
    if start > 0 {
        snippet.push('…');
    }
    snippet.push_str(&content[start..end]);
    if end < content.len() {
        snippet.push('…');
    }

    let snippet = snippet.split_whitespace().collect::<Vec<_>>().join(" ");
    if snippet.chars().count() > PREVIEW_MAX_LEN {
        snippet.chars().take(PREVIEW_MAX_LEN).collect()
    } else {
        snippet
    }
}
