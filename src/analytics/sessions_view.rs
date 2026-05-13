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
