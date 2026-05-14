# Session Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/sessions` page that lists every recorded session across all four tools and lets the user click in to read the full conversation, with project-grouped nav, full-text search, and medium-density message rendering.

**Architecture:** New analytics module `analytics::sessions_view` builds two server-shaped responses (list summary + single detail) from the existing in-memory `Vec<Session>` cache. Two Axum routes (`/api/sessions/list`, `/api/sessions/:id`) expose them. The frontend adds a new React Router route `/sessions` with three small components (project nav, list, detail) that share URL query-param state.

**Tech Stack:** Rust (Axum + serde + chrono), React 19, React Router 7, Tailwind, shadcn/ui. New frontend deps: `react-markdown`, `remark-gfm`, `rehype-highlight`.

**Spec:** `docs/superpowers/specs/2026-05-13-session-viewer-design.md`

---

## File Structure

**Backend:**

- Create `src/analytics/sessions_view.rs` — pure functions: `extract_title`, `token_total`, `match_session`, `build_list`, plus response types `SessionListItem`, `SessionListResponse`
- Modify `src/analytics/mod.rs` — register submodule
- Modify `src/server.rs` — two new handlers (`api_sessions_list`, `api_sessions_detail`), `SessionListQuery` struct, `ENDPOINTS` table additions, two new `.route()` calls
- Create `tests/sessions_view.rs` — integration test for `sessions_view` helpers
- Create `tests/sessions_endpoints.rs` — HTTP-level test using a small in-memory `SessionRepository` impl

**Frontend (all paths under `web/src/`):**

- Create `types/sessions.ts` — TypeScript types mirroring backend response
- Create `lib/sessions-api.ts` — fetch helpers for the two endpoints
- Create `pages/sessions.tsx` — page shell + URL state hook
- Create `components/sessions/project-nav.tsx`
- Create `components/sessions/session-list.tsx`
- Create `components/sessions/session-detail.tsx`
- Create `components/sessions/message-bubble.tsx`
- Create `components/sessions/tool-call-row.tsx`
- Create `components/sessions/markdown.tsx`
- Modify `App.tsx` — register `/sessions` route
- Modify `components/dashboard-shell.tsx` — add Sessions link
- Modify `web/package.json` (via `npm install`) — add markdown deps

---

## Task 1: Backend — `extract_title` helper (TDD)

**Files:**
- Create: `src/analytics/sessions_view.rs`
- Modify: `src/analytics/mod.rs`
- Test: `tests/sessions_view.rs`

- [ ] **Step 1: Create the test file with the first failing test**

Create `tests/sessions_view.rs`:

```rust
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
```

- [ ] **Step 2: Create the empty module file**

Create `src/analytics/sessions_view.rs`:

```rust
use crate::schema::{Role, Session};

pub fn extract_title(_session: &Session) -> String {
    String::new()
}
```

- [ ] **Step 3: Register the submodule**

Modify `src/analytics/mod.rs`. Add after the existing `mod tokens;` line:

```rust
mod sessions_view;
```

And after `pub use tokens::*;`:

```rust
pub use sessions_view::*;
```

- [ ] **Step 4: Run the test, confirm it fails**

Run: `cargo test --test sessions_view extract_title_uses_first_non_empty_user_message`

Expected: FAIL (assertion `"" == "first real prompt"`).

- [ ] **Step 5: Implement `extract_title`**

Replace `src/analytics/sessions_view.rs` body with:

```rust
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
```

- [ ] **Step 6: Run, confirm pass**

Run: `cargo test --test sessions_view extract_title_uses_first_non_empty_user_message`

Expected: PASS.

- [ ] **Step 7: Add coverage tests**

Append to `tests/sessions_view.rs`:

```rust
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
```

Run: `cargo test --test sessions_view extract_title`

Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add src/analytics/sessions_view.rs src/analytics/mod.rs tests/sessions_view.rs
git commit -m "feat(sessions-view): title extraction with whitespace collapse and truncation"
```

---

## Task 2: Backend — `token_total` helper

**Files:**
- Modify: `src/analytics/sessions_view.rs`
- Test: `tests/sessions_view.rs`

- [ ] **Step 1: Append failing tests**

Append to `tests/sessions_view.rs`:

```rust
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
```

- [ ] **Step 2: Run, confirm fail**

Run: `cargo test --test sessions_view token_total`

Expected: FAIL — `token_total` not defined.

- [ ] **Step 3: Implement**

Append to `src/analytics/sessions_view.rs`:

```rust
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
```

- [ ] **Step 4: Run, confirm pass**

Run: `cargo test --test sessions_view token_total`

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/analytics/sessions_view.rs tests/sessions_view.rs
git commit -m "feat(sessions-view): token_total sums input+output+thinking"
```

---

## Task 3: Backend — search match + preview

**Files:**
- Modify: `src/analytics/sessions_view.rs`
- Test: `tests/sessions_view.rs`

- [ ] **Step 1: Append failing tests**

Append to `tests/sessions_view.rs`:

```rust
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
    assert!(result.preview.as_ref().unwrap().contains("cache"));
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
```

- [ ] **Step 2: Run, confirm fail**

Run: `cargo test --test sessions_view match_session`

Expected: FAIL — `match_session` not defined.

- [ ] **Step 3: Implement**

Append to `src/analytics/sessions_view.rs`:

```rust
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

        let first_term = terms_lower[0];
        let count = content_lower.matches(first_term).count();
        total_matches += count;

        if first_preview.is_none() {
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
```

- [ ] **Step 4: Run, confirm pass**

Run: `cargo test --test sessions_view match_session`

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/analytics/sessions_view.rs tests/sessions_view.rs
git commit -m "feat(sessions-view): case-insensitive AND search with preview snippet"
```

---

## Task 4: Backend — `SessionListItem` + `build_list`

**Files:**
- Modify: `src/analytics/sessions_view.rs`
- Test: `tests/sessions_view.rs`

- [ ] **Step 1: Append failing test**

Append to `tests/sessions_view.rs`:

```rust
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
```

- [ ] **Step 2: Run, confirm fail**

Run: `cargo test --test sessions_view build_list`

Expected: FAIL — types not defined.

- [ ] **Step 3: Implement types and `build_list`**

Append to `src/analytics/sessions_view.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

const NO_PROJECT_KEY: &str = "__none__";

#[derive(Debug, Clone, Default, Deserialize)]
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
```

- [ ] **Step 4: Run all sessions_view tests**

Run: `cargo test --test sessions_view`

Expected: all passing (title, token, match, build_list).

- [ ] **Step 5: Commit**

```bash
git add src/analytics/sessions_view.rs tests/sessions_view.rs
git commit -m "feat(sessions-view): build_list with project/tool/query filters and pagination"
```

---

## Task 5a: Backend — `estimated_cost_usd` helper

**Files:**
- Modify: `src/analytics/sessions_view.rs`
- Test: `tests/sessions_view.rs`

- [ ] **Step 1: Append failing test**

Append to `tests/sessions_view.rs`:

```rust
use schema::Tool as ToolEnum;

struct StubPricing {
    input: f64,
    output: f64,
}

impl sessions_view::PricingLookup for StubPricing {
    fn input_output(&self, _model: &str) -> Option<(f64, f64)> {
        Some((self.input, self.output))
    }
}

#[test]
fn estimated_cost_sums_per_model_rates() {
    let mut s = session_with_messages(vec![
        Message {
            role: Role::Assistant,
            content: String::new(),
            timestamp: ts(),
            model: Some("claude-opus".to_string()),
            tokens: Some(TokenUsage {
                input: Some(1_000),
                output: Some(500),
                thinking: None,
                cache_read: None,
                cache_write: None,
            }),
            duration_ms: None,
            tool_calls: vec![],
        },
    ]);
    s.tool = ToolEnum::Claude;
    let pricing = StubPricing { input: 0.000_003, output: 0.000_015 };
    let cost = sessions_view::estimated_cost_usd(&s, &pricing);
    // 1000 * 3e-6 + 500 * 15e-6 = 0.003 + 0.0075 = 0.0105
    assert!((cost - 0.0105).abs() < 1e-9, "got {cost}");
}

#[test]
fn estimated_cost_zero_when_pricing_missing() {
    struct NoPricing;
    impl sessions_view::PricingLookup for NoPricing {
        fn input_output(&self, _model: &str) -> Option<(f64, f64)> { None }
    }
    let s = session_with_messages(vec![msg_with_tokens(Role::Assistant, 100, 50, None)]);
    assert_eq!(sessions_view::estimated_cost_usd(&s, &NoPricing), 0.0);
}
```

- [ ] **Step 2: Run, confirm fail**

Run: `cargo test --test sessions_view estimated_cost`

Expected: FAIL (`PricingLookup` not defined).

- [ ] **Step 3: Implement**

Append to `src/analytics/sessions_view.rs`:

```rust
/// Trait used so that pure analytics code stays independent of the concrete
/// `PricingProvider` type. The HTTP layer adapts the real provider into this.
pub trait PricingLookup {
    fn input_output(&self, model: &str) -> Option<(f64, f64)>;
}

pub fn estimated_cost_usd(session: &Session, pricing: &dyn PricingLookup) -> f64 {
    let mut total = 0.0;
    for m in &session.messages {
        let model = match m.model.as_deref().or(session.model.as_deref()) {
            Some(m) => m,
            None => continue,
        };
        let Some((in_rate, out_rate)) = pricing.input_output(model) else {
            continue;
        };
        let tokens = match &m.tokens {
            Some(t) => t,
            None => continue,
        };
        total += (tokens.input.unwrap_or(0) as f64) * in_rate;
        total += (tokens.output.unwrap_or(0) as f64) * out_rate;
    }
    total
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cargo test --test sessions_view estimated_cost`

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/analytics/sessions_view.rs tests/sessions_view.rs
git commit -m "feat(sessions-view): per-session estimated cost via PricingLookup trait"
```

---

## Task 5: Backend — HTTP handlers + routes

**Files:**
- Modify: `src/server.rs`

- [ ] **Step 1: Add `SessionListQuery` struct + handler**

Open `src/server.rs`. After the existing `BashHistoryQuery` struct (around line 28), add:

```rust
#[derive(Deserialize, Default)]
struct SessionsListQuery {
    project: Option<String>,
    tool: Option<String>,
    q: Option<String>,
    from: Option<String>,
    to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
}
```

Then add (anywhere among other `async fn api_*` handlers — place it near `api_sessions`):

```rust
async fn api_sessions_list(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SessionsListQuery>,
) -> Json<serde_json::Value> {
    let sessions = filter_by_date(
        &collect_sessions(&state).await,
        &DateRange { from: q.from.clone(), to: q.to.clone() },
    );
    let list_q = analytics::ListQuery {
        project: q.project.clone(),
        tool: q.tool.clone(),
        q: q.q.clone(),
        limit: q.limit.unwrap_or(200),
        offset: q.offset.unwrap_or(0),
    };
    Json(serde_json::to_value(analytics::build_list(&sessions, &list_q)).unwrap())
}

struct PricingAdapter<'a>(&'a dyn crate::pricing::PricingProvider);

impl<'a> analytics::PricingLookup for PricingAdapter<'a> {
    fn input_output(&self, model: &str) -> Option<(f64, f64)> {
        self.0
            .price_for(model)
            .map(|p| (p.input_cost_per_token, p.output_cost_per_token))
    }
}

async fn api_session_detail(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Response {
    let sessions = collect_sessions(&state).await;
    match sessions.iter().find(|s| s.id == id) {
        Some(s) => {
            let cost = analytics::estimated_cost_usd(s, &PricingAdapter(state.pricing.as_ref()));
            let mut v = serde_json::to_value(s).unwrap();
            v["estimated_cost_usd"] = serde_json::json!(cost);
            Json(v).into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "not found"})),
        )
            .into_response(),
    }
}
```

- [ ] **Step 2: Register the routes**

In the `serve` function, find the route chain (starts with `Router::new().route("/api/sessions", ...)`). Add these two lines right after `.route("/api/sessions", get(api_sessions))`:

```rust
        .route("/api/sessions/list", get(api_sessions_list))
        .route("/api/sessions/:id", get(api_session_detail))
```

- [ ] **Step 3: Add endpoint metadata**

Find the `const ENDPOINTS: &[EndpointInfo]` array (around line 30). Insert two entries right after the existing `/api/sessions` entry:

```rust
    EndpointInfo { method: "GET", path: "/api/sessions/list", description: "Lightweight session summaries with title, message/token totals; supports project/tool/q filters" },
    EndpointInfo { method: "GET", path: "/api/sessions/:id", description: "Full Session record (all messages) for one session id" },
```

- [ ] **Step 4: Run cargo check**

Run: `cargo check`

Expected: clean build (no errors). Fix any import issues (`Response`, `IntoResponse` are already imported per existing file head).

- [ ] **Step 5: Smoke-run the server**

Run: `cargo run --release -- serve --no-browser` in one terminal, then in another:

```bash
curl -s 'http://localhost:8080/api/sessions/list?limit=2' | head -c 400
curl -s -o /dev/null -w "%{http_code}\n" 'http://localhost:8080/api/sessions/__nope__'
```

Expected: first call returns JSON with `total`/`sessions`; second prints `404`. Kill the server when done.

Note: if your local port isn't 8080, the server prints the actual URL on startup — use that.

- [ ] **Step 6: Commit**

```bash
git add src/server.rs
git commit -m "feat(api): add /api/sessions/list and /api/sessions/:id endpoints"
```

---

## Task 6: Backend — HTTP integration test for new endpoints

**Files:**
- Create: `tests/sessions_endpoints.rs`

- [ ] **Step 1: Write the test**

Create `tests/sessions_endpoints.rs`:

```rust
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
```

- [ ] **Step 2: Run, confirm pass**

Run: `cargo test --test sessions_endpoints`

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/sessions_endpoints.rs
git commit -m "test(sessions-endpoints): cover list response shape and search hit"
```

---

## Task 7: Frontend — install markdown deps

**Files:**
- Modify: `web/package.json` (via npm), `web/package-lock.json` (or `bun.lock`)

- [ ] **Step 1: Check which lockfile is canonical**

Run from repo root:

```bash
ls web/bun.lock web/package-lock.json 2>&1
```

Use `bun add` if `bun.lock` exists and is current; otherwise use `npm install --prefix web`.

- [ ] **Step 2: Install**

```bash
cd web
# pick one based on Step 1
bun add react-markdown remark-gfm rehype-highlight highlight.js
# or
npm install react-markdown remark-gfm rehype-highlight highlight.js
cd ..
```

- [ ] **Step 3: Verify build still works**

```bash
cd web && bun run build && cd ..   # or: npm run build --prefix web
```

Expected: vite build completes without error.

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/bun.lock web/package-lock.json 2>/dev/null || true
git add web/package.json
git commit -m "build(web): add react-markdown, remark-gfm, rehype-highlight for sessions viewer"
```

---

## Task 8: Frontend — types and API client

**Files:**
- Create: `web/src/types/sessions.ts`
- Create: `web/src/lib/sessions-api.ts`

- [ ] **Step 1: Add types**

Create `web/src/types/sessions.ts`:

```ts
export type ToolName = "claude" | "codex" | "gemini" | "kimi";
export type Role = "user" | "assistant" | "system";

export interface SessionListItem {
  id: string;
  tool: ToolName;
  project: string | null;
  model: string | null;
  start_time: string;
  message_count: number;
  token_total: number;
  title: string;
  match_preview?: string;
  match_count: number;
}

export interface SessionListResponse {
  total: number;
  offset: number;
  count: number;
  sessions: SessionListItem[];
}

export interface TokenUsage {
  input?: number | null;
  output?: number | null;
  thinking?: number | null;
  cache_read?: number | null;
  cache_write?: number | null;
}

export interface ToolCall {
  name: string;
  args?: unknown;
  status?: string | null;
}

export interface SessionMessage {
  role: Role;
  content: string;
  timestamp: string;
  model?: string | null;
  tokens?: TokenUsage | null;
  duration_ms?: number | null;
  tool_calls: ToolCall[];
}

export interface GitContext {
  branch?: string | null;
  commit?: string | null;
  repo_url?: string | null;
}

export interface SessionDetail {
  id: string;
  tool: ToolName;
  hostname?: string | null;
  project?: string | null;
  model?: string | null;
  start_time: string;
  end_time?: string | null;
  duration_ms?: number | null;
  cwd?: string | null;
  git?: GitContext | null;
  messages: SessionMessage[];
  estimated_cost_usd?: number;
}
```

- [ ] **Step 2: Add API client**

Create `web/src/lib/sessions-api.ts`:

```ts
import type { SessionDetail, SessionListResponse } from "@/types/sessions";

export interface ListParams {
  project?: string | null;
  tool?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

export async function fetchSessionList(params: ListParams): Promise<SessionListResponse> {
  const search = new URLSearchParams();
  if (params.project) search.set("project", params.project);
  if (params.tool && params.tool !== "all") search.set("tool", params.tool);
  if (params.q) search.set("q", params.q);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  const res = await fetch(`/api/sessions/list?${search.toString()}`);
  if (!res.ok) throw new Error(`session list failed: ${res.status}`);
  return res.json();
}

export async function fetchSessionDetail(id: string): Promise<SessionDetail | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`session detail failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/types/sessions.ts web/src/lib/sessions-api.ts
git commit -m "feat(web/sessions): types and fetch client"
```

---

## Task 9: Frontend — markdown component

**Files:**
- Create: `web/src/components/sessions/markdown.tsx`

- [ ] **Step 1: Implement**

Create `web/src/components/sessions/markdown.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words text-[13px] leading-6 text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && bun run build && cd ..`

Expected: build succeeds (the component isn't used yet but must compile).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/sessions/markdown.tsx
git commit -m "feat(web/sessions): markdown renderer with GFM and code highlight"
```

---

## Task 10: Frontend — tool call row

**Files:**
- Create: `web/src/components/sessions/tool-call-row.tsx`

- [ ] **Step 1: Implement**

Create `web/src/components/sessions/tool-call-row.tsx`:

```tsx
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCall } from "@/types/sessions";

function previewArgs(call: ToolCall): string {
  const args = call.args;
  if (args == null || typeof args !== "object") return "";
  const obj = args as Record<string, unknown>;
  for (const key of ["file_path", "path", "command", "pattern", "url", "query"]) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  const json = JSON.stringify(obj);
  return json.length > 80 ? json.slice(0, 77) + "…" : json;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCallRow({ call, forceOpen }: { call: ToolCall; forceOpen?: boolean }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = forceOpen ?? localOpen;
  const isError = call.status === "error";

  return (
    <div className="rounded border border-slate-200 bg-white text-[12px]">
      <button
        type="button"
        onClick={() => setLocalOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono"
      >
        <ChevronRight
          className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className={isError ? "text-rose-600" : "text-sky-700"}>
          {call.name}
        </span>
        <span className="ml-1 truncate text-slate-500">{previewArgs(call)}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] leading-5 text-slate-700">
{formatJson(call.args)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/sessions/tool-call-row.tsx
git commit -m "feat(web/sessions): collapsible tool-call row"
```

---

## Task 11: Frontend — message bubble

**Files:**
- Create: `web/src/components/sessions/message-bubble.tsx`

- [ ] **Step 1: Implement**

Create `web/src/components/sessions/message-bubble.tsx`:

```tsx
import type { SessionMessage } from "@/types/sessions";
import { Markdown } from "./markdown";
import { ToolCallRow } from "./tool-call-row";

export function MessageBubble({
  message,
  forceToolDetails,
}: {
  message: SessionMessage;
  forceToolDetails: boolean;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">
        system message
      </div>
    );
  }

  const bg = isUser ? "bg-sky-50" : "bg-slate-50";
  const label = isUser ? "👤 user" : "🤖 assistant";
  const time = new Date(message.timestamp).toLocaleTimeString();

  return (
    <div className={`${bg} rounded-md px-3 py-2`}>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-slate-500">
        <span>{label}</span>
        <span>·</span>
        <span>{time}</span>
        {message.model && (
          <>
            <span>·</span>
            <span className="font-mono">{message.model}</span>
          </>
        )}
        {(message.tokens?.thinking ?? 0) > 0 && (
          <>
            <span>·</span>
            <span title="thinking tokens">
              🧠 {(message.tokens!.thinking ?? 0).toLocaleString()}
            </span>
          </>
        )}
      </div>
      {message.content && <Markdown>{message.content}</Markdown>}
      {message.tool_calls.length > 0 && (
        <div className="mt-2 space-y-1">
          {message.tool_calls.map((call, i) => (
            <ToolCallRow key={i} call={call} forceOpen={forceToolDetails} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/sessions/message-bubble.tsx
git commit -m "feat(web/sessions): message bubble for user/assistant/system"
```

---

## Task 12: Frontend — project nav

**Files:**
- Create: `web/src/components/sessions/project-nav.tsx`

- [ ] **Step 1: Implement**

Create `web/src/components/sessions/project-nav.tsx`:

```tsx
import { useMemo } from "react";
import type { SessionListItem } from "@/types/sessions";

const NO_PROJECT_KEY = "__none__";

export function ProjectNav({
  items,
  selected,
  onSelect,
}: {
  items: SessionListItem[];
  selected: string | null;
  onSelect: (project: string | null) => void;
}) {
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      const key = it.project ?? NO_PROJECT_KEY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const total = items.length;

  function Row({ k, label, count }: { k: string | null; label: string; count: number }) {
    const isActive = (selected ?? null) === k;
    return (
      <button
        type="button"
        onClick={() => onSelect(k)}
        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[13px] ${
          isActive ? "bg-slate-200 text-slate-900" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        <span className="truncate">{label}</span>
        <span className="ml-2 text-[11px] text-slate-500">{count}</span>
      </button>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      <Row k={null} label="All projects" count={total} />
      <div className="my-1 border-t border-slate-200" />
      {groups.map(([key, count]) => (
        <Row
          key={key}
          k={key}
          label={key === NO_PROJECT_KEY ? "(no project)" : key}
          count={count}
        />
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/sessions/project-nav.tsx
git commit -m "feat(web/sessions): project nav with All / (no project) groups"
```

---

## Task 13: Frontend — session list

**Files:**
- Create: `web/src/components/sessions/session-list.tsx`

- [ ] **Step 1: Implement**

Create `web/src/components/sessions/session-list.tsx`:

```tsx
import { formatDistanceToNow } from "date-fns";
import type { SessionListItem } from "@/types/sessions";

const TOOLS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "kimi", label: "Kimi" },
];

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function SessionList({
  items,
  selectedId,
  q,
  tool,
  onQuery,
  onTool,
  onSelect,
  loading,
}: {
  items: SessionListItem[];
  selectedId: string | null;
  q: string;
  tool: string;
  onQuery: (v: string) => void;
  onTool: (v: string) => void;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-slate-200 p-2">
        <input
          type="search"
          placeholder="🔍 search messages…"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1 text-[13px]"
        />
        <div className="flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onTool(t.value)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                tool === t.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 text-[12px] text-slate-500">Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-3 text-[12px] text-slate-500">No sessions match.</div>
        )}
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`block w-full border-b border-slate-100 px-3 py-2 text-left ${
                active ? "border-l-2 border-l-sky-500 bg-sky-50/60" : "hover:bg-slate-50"
              }`}
            >
              <div className="truncate text-[13px] font-medium text-slate-900">
                {item.title}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                {formatDistanceToNow(new Date(item.start_time), { addSuffix: true })}
                {" · "}{item.tool}
                {" · "}{item.message_count} msg
                {" · "}{fmtTokens(item.token_total)}
              </div>
              {item.match_preview && (
                <div className="mt-1 truncate text-[11px] text-slate-600 italic">
                  …{item.match_preview}…
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/sessions/session-list.tsx
git commit -m "feat(web/sessions): list pane with search and tool filter"
```

---

## Task 14: Frontend — session detail pane

**Files:**
- Create: `web/src/components/sessions/session-detail.tsx`

- [ ] **Step 1: Implement**

Create `web/src/components/sessions/session-detail.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { SessionDetail } from "@/types/sessions";
import { MessageBubble } from "./message-bubble";

const INITIAL_RENDER = 50;
const PAGE_INC = 50;

function totalTokens(d: SessionDetail): number {
  let total = 0;
  for (const m of d.messages) {
    const t = m.tokens;
    if (!t) continue;
    total += (t.input ?? 0) + (t.output ?? 0) + (t.thinking ?? 0);
  }
  return total;
}

export function SessionDetail({
  detail,
  loading,
  error,
}: {
  detail: SessionDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER);
  const [showToolDetails, setShowToolDetails] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRenderCount(INITIAL_RENDER);
    setShowToolDetails(false);
  }, [detail?.id]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !detail) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setRenderCount((c) => Math.min(c + PAGE_INC, detail.messages.length));
      }
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [detail, renderCount]);

  if (loading) {
    return <div className="p-4 text-[13px] text-slate-500">Loading…</div>;
  }
  if (error) {
    return <div className="p-4 text-[13px] text-rose-600">{error}</div>;
  }
  if (!detail) {
    return (
      <div className="p-4 text-[13px] text-slate-500">
        Pick a session from the list.
      </div>
    );
  }

  const visible = detail.messages.slice(0, renderCount);
  const tokens = totalTokens(detail);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-3">
        <div className="truncate text-[14px] font-semibold text-slate-900">
          {detail.messages.find((m) => m.role === "user" && m.content.trim())?.content
            ?.split("\n")[0]
            ?.slice(0, 100) ?? "(no prompt)"}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">
          {new Date(detail.start_time).toLocaleString()}
          {detail.model ? ` · ${detail.model}` : ""}
          {detail.cwd ? ` · ${detail.cwd}` : ""}
          {` · ${detail.messages.length} msg`}
          {` · ${tokens.toLocaleString()} tok`}
          {detail.estimated_cost_usd != null && detail.estimated_cost_usd > 0 && (
            ` · $${detail.estimated_cost_usd.toFixed(detail.estimated_cost_usd < 0.01 ? 4 : 2)}`
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            Copy link
          </button>
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={showToolDetails}
              onChange={(e) => setShowToolDetails(e.target.checked)}
            />
            Show tool details
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {visible.map((m, i) => (
            <MessageBubble
              key={`${detail.id}-${i}`}
              message={m}
              forceToolDetails={showToolDetails}
            />
          ))}
        </div>
        {renderCount < detail.messages.length && (
          <div ref={sentinelRef} className="py-4 text-center text-[11px] text-slate-400">
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/sessions/session-detail.tsx
git commit -m "feat(web/sessions): detail pane with header, message stream, lazy paging"
```

---

## Task 15: Frontend — page shell with URL state

**Files:**
- Create: `web/src/pages/sessions.tsx`

- [ ] **Step 1: Implement**

Create `web/src/pages/sessions.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import type { SessionDetail, SessionListItem } from "@/types/sessions";
import { fetchSessionDetail, fetchSessionList } from "@/lib/sessions-api";
import { ProjectNav } from "@/components/sessions/project-nav";
import { SessionList } from "@/components/sessions/session-list";
import { SessionDetail as SessionDetailPane } from "@/components/sessions/session-detail";

export default function SessionsPage() {
  const [params, setParams] = useSearchParams();
  const project = params.get("project");
  const tool = params.get("tool") ?? "all";
  const q = params.get("q") ?? "";
  const id = params.get("id");

  const [items, setItems] = useState<SessionListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [allForNav, setAllForNav] = useState<SessionListItem[]>([]);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "" || v === "all") next.delete(k);
          else next.set(k, v);
        }
        return next;
      });
    },
    [setParams],
  );

  // List for current filters
  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    fetchSessionList({ project, tool, q })
      .then((r) => {
        if (!cancelled) setItems(r.sessions);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, tool, q]);

  // Independent fetch for the nav counts (no filters)
  useEffect(() => {
    let cancelled = false;
    fetchSessionList({ limit: 2000 })
      .then((r) => {
        if (!cancelled) setAllForNav(r.sessions);
      })
      .catch(() => {
        if (!cancelled) setAllForNav([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Detail
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    fetchSessionDetail(id)
      .then((d) => {
        if (cancelled) return;
        if (d == null) {
          setDetail(null);
          setDetailError("Session not found");
          // clear stale id
          update({ id: null });
        } else {
          setDetail(d);
        }
      })
      .catch((e) => {
        if (!cancelled) setDetailError(String(e));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, update]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link to="/" className="text-[13px] text-slate-600 hover:text-slate-900">
          ← Dashboard
        </Link>
        <h1 className="text-[14px] font-semibold text-slate-900">Sessions</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[220px] flex-none border-r border-slate-200 bg-white">
          <ProjectNav
            items={allForNav}
            selected={project}
            onSelect={(p) => update({ project: p, id: null })}
          />
        </aside>
        <section className="flex w-[360px] flex-none flex-col border-r border-slate-200 bg-white">
          <SessionList
            items={items}
            selectedId={id}
            q={q}
            tool={tool}
            loading={listLoading}
            onQuery={(v) => update({ q: v })}
            onTool={(v) => update({ tool: v })}
            onSelect={(sid) => update({ id: sid })}
          />
        </section>
        <main className="flex-1 overflow-hidden bg-white">
          <SessionDetailPane
            detail={detail}
            loading={detailLoading}
            error={detailError}
          />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && bun run build && cd ..`

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/sessions.tsx
git commit -m "feat(web/sessions): page shell with URL-synced filters"
```

---

## Task 16: Frontend — register route and nav link

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/dashboard-shell.tsx`

- [ ] **Step 1: Register the route**

Replace `web/src/App.tsx` with:

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "@/pages/dashboard";
import ProjectorPage from "@/pages/projector";
import BashHistoryPage from "@/pages/bash-history";
import SessionsPage from "@/pages/sessions";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projector" element={<ProjectorPage />} />
        <Route path="/bash-history" element={<BashHistoryPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Add nav link**

Open `web/src/components/dashboard-shell.tsx`. Find the existing nav link block (around lines 205-216 containing `to="/projector"` and `to="/bash-history"`). Add a third link in the same style between them or after:

```tsx
                  <Link
                    to="/sessions"
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    Sessions →
                  </Link>
```

- [ ] **Step 3: Build and run**

```bash
cd web && bun run build && cd ..
cargo run --release -- serve --no-browser
```

Open the printed URL, click the **Sessions** link from the dashboard header. Manually verify:

- Left pane lists projects with counts; clicking one filters the middle.
- Middle search box narrows the list and shows previews.
- Tool chips filter to one tool.
- Clicking a session loads the detail pane.
- Tool-call rows expand on click; the "Show tool details" toggle opens all.
- Scrolling past message 50 loads more.
- Refreshing the URL keeps the same selection.

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/components/dashboard-shell.tsx
git commit -m "feat(web): wire /sessions route and dashboard nav link"
```

---

## Task 17: Final verification

- [ ] **Step 1: Full test suite**

Run: `cargo test`

Expected: all tests pass (including existing ones).

- [ ] **Step 2: Web build**

Run: `cd web && bun run build && cd ..`

Expected: clean build.

- [ ] **Step 3: Manual smoke**

Run `cargo run --release -- serve --no-browser` and exercise once more:

- `/sessions` opens without console errors.
- `/sessions?project=__none__` opens with the no-project filter pre-applied.
- `/sessions?id=<known-id>` opens with the detail loaded.
- `/sessions?id=__bogus__` shows "Session not found" and clears `?id` from the URL.

- [ ] **Step 4: Done**

No new commit needed; all changes were committed task-by-task.
