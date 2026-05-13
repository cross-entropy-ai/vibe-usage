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

use schema::TokenUsage;

fn msg_with_tokens(role: Role, input: u64, output: u64, thinking: Option<u64>) -> Message {
    Message {
        role,
        content: String::new(),
        timestamp: ts(),
        model: None,
        tokens: Some(TokenUsage {
            input: Some(input),
            output: Some(output),
            thinking,
            cache_read: Some(999),    // must be excluded
            cache_write: Some(999),   // must be excluded
        }),
        duration_ms: None,
        tool_calls: vec![],
    }
}

#[test]
fn token_total_sums_input_output_thinking_only() {
    let s = session_with_messages(vec![
        msg_with_tokens(Role::Assistant, 100, 50, Some(20)),
        msg_with_tokens(Role::Assistant, 10, 5, None),
    ]);
    assert_eq!(sessions_view::token_total(&s), 100 + 50 + 20 + 10 + 5);
}

#[test]
fn token_total_handles_missing_usage() {
    let s = session_with_messages(vec![msg(Role::Assistant, "no usage")]);
    assert_eq!(sessions_view::token_total(&s), 0);
}

#[test]
fn match_session_returns_none_when_query_absent() {
    let s = session_with_messages(vec![msg(Role::User, "anything")]);
    assert!(sessions_view::match_session(&s, &[]).is_some());
    // Empty terms => no filtering, matches with no preview
    let result = sessions_view::match_session(&s, &[]).unwrap();
    assert_eq!(result.match_count, 0);
    assert!(result.preview.is_none());
}

#[test]
fn match_session_finds_substring_case_insensitive() {
    let s = session_with_messages(vec![
        msg(Role::User, "How does the CACHE work here?"),
        msg(Role::Assistant, "Cache lives in cache.rs"),
    ]);
    let result = sessions_view::match_session(&s, &["cache"]).unwrap();
    assert_eq!(result.match_count, 2);
    assert!(
        result.preview.as_ref().unwrap().to_lowercase().contains("cache"),
        "preview should contain the matched term (case-insensitively): {:?}",
        result.preview
    );
}

#[test]
fn match_session_requires_all_terms_and_combined() {
    let s = session_with_messages(vec![msg(Role::User, "cache invalidation is hard")]);
    assert!(sessions_view::match_session(&s, &["cache", "invalidation"]).is_some());
    assert!(sessions_view::match_session(&s, &["cache", "missing"]).is_none());
}

#[test]
fn match_session_ignores_system_messages_for_match() {
    let s = session_with_messages(vec![
        msg(Role::System, "you can talk about cache"),
        msg(Role::User, "hello world"),
    ]);
    assert!(sessions_view::match_session(&s, &["cache"]).is_none());
}

#[test]
fn match_session_preview_caps_length() {
    let long = "x".repeat(500);
    let content = format!("prefix {} cache {} suffix", long, long);
    let s = session_with_messages(vec![msg(Role::User, &content)]);
    let result = sessions_view::match_session(&s, &["cache"]).unwrap();
    let preview = result.preview.unwrap();
    assert!(preview.chars().count() <= 200);
    assert!(preview.contains("cache"));
}

#[test]
fn match_session_preview_preserves_original_case() {
    let s = session_with_messages(vec![msg(
        Role::User,
        "How does the CACHE invalidation work?",
    )]);
    let result = sessions_view::match_session(&s, &["cache"]).unwrap();
    let preview = result.preview.unwrap();
    assert!(
        preview.contains("CACHE"),
        "preview should keep original case, got: {preview}"
    );
}

fn make_session(id: &str, project: Option<&str>, user_text: &str) -> Session {
    let mut s = session_with_messages(vec![msg(Role::User, user_text)]);
    s.id = id.to_string();
    s.project = project.map(|p| p.to_string());
    s
}

#[test]
fn build_list_filters_by_project_tool_and_query() {
    let sessions = vec![
        make_session("a", Some("vibe-usage"), "cache stuff here"),
        make_session("b", Some("vibe-usage"), "unrelated"),
        make_session("c", Some("other"), "cache stuff in other"),
        make_session("d", None, "no project"),
    ];

    // Project filter
    let q = sessions_view::ListQuery {
        project: Some("vibe-usage".to_string()),
        tool: None,
        q: None,
        limit: 100,
        offset: 0,
    };
    let resp = sessions_view::build_list(&sessions, &q);
    assert_eq!(resp.total, 2);
    let ids: Vec<&str> = resp.sessions.iter().map(|s| s.id.as_str()).collect();
    assert!(ids.contains(&"a") && ids.contains(&"b"));

    // No-project pseudo-value
    let q = sessions_view::ListQuery {
        project: Some("__none__".to_string()),
        tool: None,
        q: None,
        limit: 100,
        offset: 0,
    };
    let resp = sessions_view::build_list(&sessions, &q);
    assert_eq!(resp.total, 1);
    assert_eq!(resp.sessions[0].id, "d");

    // Query filter applied
    let q = sessions_view::ListQuery {
        project: None,
        tool: None,
        q: Some("cache".to_string()),
        limit: 100,
        offset: 0,
    };
    let resp = sessions_view::build_list(&sessions, &q);
    assert_eq!(resp.total, 2);
    for item in &resp.sessions {
        assert!(item.match_count > 0);
        assert!(item.match_preview.is_some());
    }
}

#[test]
fn build_list_paginates_and_orders_newest_first() {
    use chrono::Duration;
    let mut sessions = Vec::new();
    for i in 0..5 {
        let mut s = make_session(&format!("s{i}"), None, "x");
        s.start_time = ts() + Duration::hours(i);
        sessions.push(s);
    }
    let q = sessions_view::ListQuery {
        project: None,
        tool: None,
        q: None,
        limit: 2,
        offset: 1,
    };
    let resp = sessions_view::build_list(&sessions, &q);
    assert_eq!(resp.total, 5);
    assert_eq!(resp.count, 2);
    assert_eq!(resp.sessions[0].id, "s3");
    assert_eq!(resp.sessions[1].id, "s2");
}

#[test]
fn build_list_populates_summary_fields() {
    let mut s = session_with_messages(vec![
        msg(Role::User, "hello world"),
        msg_with_tokens(Role::Assistant, 100, 50, None),
    ]);
    s.id = "only".to_string();
    let resp = sessions_view::build_list(
        &[s],
        &sessions_view::ListQuery::default(),
    );
    assert_eq!(resp.total, 1);
    let item = &resp.sessions[0];
    assert_eq!(item.title, "hello world");
    assert_eq!(item.message_count, 2);
    assert_eq!(item.token_total, 150);
    assert_eq!(item.tool, "claude");
}
