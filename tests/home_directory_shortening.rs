#[path = "../src/schema.rs"]
mod schema;

mod analytics {
    #![allow(dead_code)]

    use chrono::{DateTime, Local, Utc};

    pub(crate) fn local_date(ts: &DateTime<Utc>) -> String {
        ts.with_timezone(&Local).format("%Y-%m-%d").to_string()
    }

    pub mod projects {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/analytics/projects.rs"
        ));
    }
}

use analytics::projects::directories;
use chrono::{TimeZone, Utc};
use schema::{Session, Tool};

fn session(cwd: Option<&str>) -> Session {
    Session {
        id: "session-1".to_string(),
        tool: Tool::Claude,
        hostname: None,
        project: None,
        model: None,
        start_time: Utc.with_ymd_and_hms(2026, 4, 16, 12, 0, 0).unwrap(),
        end_time: None,
        duration_ms: None,
        cwd: cwd.map(|value| value.to_string()),
        git: None,
        messages: vec![],
    }
}

#[test]
fn directories_only_shortens_boundary_safe_home_paths() {
    let home = dirs::home_dir().expect("home directory should exist for this test");
    let home_str = home.to_string_lossy().to_string();
    let child = home.join("project").to_string_lossy().to_string();
    let sibling = format!("{}2/project", home_str);
    let elsewhere = "/tmp/elsewhere".to_string();
    let shortened_child = format!("~{}project", std::path::MAIN_SEPARATOR);

    let stats = directories(&[
        session(Some(&home_str)),
        session(Some(&child)),
        session(Some(&sibling)),
        session(Some(&elsewhere)),
    ]);

    assert!(stats.iter().any(|entry| entry.directory == "~"));
    assert!(stats.iter().any(|entry| entry.directory == shortened_child));
    assert!(stats.iter().any(|entry| entry.directory == sibling));
    assert!(
        stats
            .iter()
            .any(|entry| entry.directory == "/tmp/elsewhere")
    );
    assert!(!stats.iter().any(|entry| entry.directory == "~2/project"));
}
