#[path = "../src/schema.rs"]
mod schema;

mod analytics {
    #![allow(dead_code)]

    use chrono::{DateTime, Local, Utc};

    pub(crate) fn local_date(ts: &DateTime<Utc>) -> String {
        ts.with_timezone(&Local).format("%Y-%m-%d").to_string()
    }

    pub mod tokens {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/analytics/tokens.rs"
        ));
    }
}

use analytics::tokens::tools_status;
use chrono::{DateTime, Utc};
use schema::{Message, Role, Session, Tool, ToolCall};

fn ts() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-04-16T00:00:00Z")
        .unwrap()
        .with_timezone(&Utc)
}

fn session_with_tool_calls(tool_calls: Vec<ToolCall>) -> Session {
    Session {
        id: "session-1".to_string(),
        tool: Tool::Claude,
        hostname: None,
        project: None,
        model: None,
        start_time: ts(),
        end_time: None,
        duration_ms: None,
        cwd: None,
        git: None,
        messages: vec![Message {
            role: Role::Assistant,
            content: String::new(),
            timestamp: ts(),
            model: None,
            tokens: None,
            duration_ms: None,
            tool_calls,
        }],
    }
}

#[test]
fn tools_status_counts_only_explicit_success_and_error() {
    let sessions = vec![session_with_tool_calls(vec![
        ToolCall {
            name: "search".to_string(),
            args: None,
            status: Some("success".to_string()),
        },
        ToolCall {
            name: "search".to_string(),
            args: None,
            status: Some("error".to_string()),
        },
        ToolCall {
            name: "search".to_string(),
            args: None,
            status: Some("cancelled".to_string()),
        },
        ToolCall {
            name: "search".to_string(),
            args: None,
            status: None,
        },
        ToolCall {
            name: "format".to_string(),
            args: None,
            status: Some("success".to_string()),
        },
    ])];

    let stats = tools_status(&sessions);

    let search = stats.iter().find(|stat| stat.name == "search").unwrap();
    assert_eq!(search.total, 4);
    assert_eq!(search.success, 1);
    assert_eq!(search.error, 1);

    let format = stats.iter().find(|stat| stat.name == "format").unwrap();
    assert_eq!(format.total, 1);
    assert_eq!(format.success, 1);
    assert_eq!(format.error, 0);
}
