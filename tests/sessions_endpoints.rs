// Minimal integration test that builds the same JSON shape returned by
// /api/sessions/list and /api/sessions/:id without spinning up Axum.
// (server.rs handlers are thin shims over build_list / Vec::find.)

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

fn ts(offset_hours: i64) -> DateTime<Utc> {
    use chrono::Duration;
    let base = DateTime::parse_from_rfc3339("2026-05-13T10:00:00Z")
        .unwrap()
        .with_timezone(&Utc);
    base + Duration::hours(offset_hours)
}

fn session(id: &str, project: Option<&str>, tool: Tool, offset: i64, msgs: Vec<Message>) -> Session {
    Session {
        id: id.to_string(),
        tool,
        hostname: None,
        project: project.map(|s| s.to_string()),
        model: Some("claude-opus-4-7".to_string()),
        start_time: ts(offset),
        end_time: None,
        duration_ms: None,
        cwd: None,
        git: None,
        messages: msgs,
    }
}

fn user(text: &str) -> Message {
    Message {
        role: Role::User,
        content: text.to_string(),
        timestamp: ts(0),
        model: None,
        tokens: None,
        duration_ms: None,
        tool_calls: vec![],
    }
}

#[test]
fn list_response_serializes_with_expected_fields() {
    let s = session("s1", Some("vibe-usage"), Tool::Claude, 0, vec![user("Hello world")]);
    let resp = sessions_view::build_list(&[s], &sessions_view::ListQuery::default());
    let json = serde_json::to_value(&resp).unwrap();

    assert_eq!(json["total"], 1);
    assert_eq!(json["offset"], 0);
    assert_eq!(json["count"], 1);

    let item = &json["sessions"][0];
    assert_eq!(item["id"], "s1");
    assert_eq!(item["tool"], "claude");
    assert_eq!(item["project"], "vibe-usage");
    assert_eq!(item["title"], "Hello world");
    assert_eq!(item["message_count"], 1);
    assert_eq!(item["match_count"], 0);
    // match_preview is omitted when None
    assert!(item.get("match_preview").is_none());
}

#[test]
fn list_response_includes_match_preview_when_query_hits() {
    let s = session(
        "s2",
        None,
        Tool::Claude,
        0,
        vec![user("the cache layer is fine here")],
    );
    let q = sessions_view::ListQuery {
        q: Some("cache".to_string()),
        ..Default::default()
    };
    let resp = sessions_view::build_list(&[s], &q);
    let json = serde_json::to_value(&resp).unwrap();
    assert!(json["sessions"][0]["match_preview"].is_string());
    assert!(json["sessions"][0]["match_count"].as_u64().unwrap() >= 1);
}
