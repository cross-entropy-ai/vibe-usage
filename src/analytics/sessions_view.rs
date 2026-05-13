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
                first_preview = Some(build_preview(&content_lower, idx, first_term.len()));
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
