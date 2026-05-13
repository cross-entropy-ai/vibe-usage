#[path = "../src/schema.rs"]
mod schema;

mod sessions_view {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/analytics/sessions_view.rs"
    ));
}

use chrono::{DateTime, Utc};
use schema::{Message, Role, Session, Tool};

fn ts() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-05-13T10:00:00Z")
        .unwrap()
        .with_timezone(&Utc)
}

fn msg(role: Role, content: &str) -> Message {
    Message {
        role,
        content: content.to_string(),
        timestamp: ts(),
        model: None,
        tokens: None,
        duration_ms: None,
        tool_calls: vec![],
    }
}

fn session_with_messages(messages: Vec<Message>) -> Session {
    Session {
        id: "s1".to_string(),
        tool: Tool::Claude,
        hostname: None,
        project: Some("vibe-usage".to_string()),
        model: None,
        start_time: ts(),
        end_time: None,
        duration_ms: None,
        cwd: None,
        git: None,
        messages,
    }
}

#[test]
fn extract_title_uses_first_non_empty_user_message() {
    let s = session_with_messages(vec![
        msg(Role::System, "system prompt ignored"),
        msg(Role::Assistant, "ignored"),
        msg(Role::User, "first real prompt"),
        msg(Role::User, "second prompt"),
    ]);
    assert_eq!(sessions_view::extract_title(&s), "first real prompt");
}

#[test]
fn extract_title_collapses_newlines_and_truncates() {
    let long = "a".repeat(200);
    let s = session_with_messages(vec![msg(
        Role::User,
        &format!("line one\n\nline two\nlast {}", long),
    )]);
    let title = sessions_view::extract_title(&s);
    assert!(title.starts_with("line one line two last"));
    assert!(title.chars().count() <= 81); // 80 chars + ellipsis
    assert!(title.ends_with('…'));
}

#[test]
fn extract_title_falls_back_when_no_user_message() {
    let s = session_with_messages(vec![msg(Role::Assistant, "only assistant")]);
    assert_eq!(sessions_view::extract_title(&s), "(no prompt)");
}
