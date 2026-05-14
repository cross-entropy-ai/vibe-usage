# Session Viewer — Design Spec

## Overview

A new top-level page (`/sessions`) that lists every recorded session across all
tools (Claude, Codex, Gemini, Kimi) and renders the full conversation history
for a selected session. Two primary use cases:

1. **Recall** — find a past conversation by project or keyword and re-read what
   happened.
2. **Audit** — review one's own prompting style by reading the dialogue end to
   end.

The page sits beside the existing Dashboard, Projector, and Bash History pages
in the navigation shell.

## Scope

In scope:

- A three-pane viewer page at `/sessions` covering all four collectors.
- Project-grouped navigation, session list with search and tool filter, and a
  detail pane that renders the full conversation.
- Two new HTTP endpoints (`/api/sessions/list`, `/api/sessions/:id`) backed by
  the existing in-memory session cache.
- URL state for shareable links (`/sessions?id=…&project=…&tool=…&q=…`).

Out of scope:

- Editing or annotating sessions.
- Server-side persistence of view state.
- Re-running or "replaying" a session.
- Computed prompting-quality metrics (length, specificity, etc.) — leave that
  to a future feature.

## Layout

Three-pane layout, top-aligned with the dashboard shell:

```
┌─ left (220px) ──┬─ middle (~360px) ───┬─ right (flex) ─────────┐
│ Projects        │ [search] [tool ▾]   │  Session header        │
│                 │                     │   title · model · cost │
│ All projects 67 │ ●──────────────     │  ──────────────────    │
│ ▸ vibe-usage 42 │ │ 添加 viewer       │  👤 user msg            │
│ ▸ claude-vibe 18│ │ 2h · 42 · 48k     │  🤖 assistant msg       │
│ ▸ ljg-skills  7 │ ●──────────────     │   ▸ Read foo.rs        │
│ (no project)  3 │ │ 修 bash bug       │   ▸ Edit foo.rs        │
│                 │ │ 1d · 18 · 22k     │  👤 user msg            │
│                 │ ●──────────────     │  ...                   │
└─────────────────┴─────────────────────┴────────────────────────┘
```

### Left pane — Projects (220px)

- Pseudo entry **All projects** with total session count, selected by default.
- One entry per distinct `Session.project`, sorted by session count descending.
- Pseudo entry **(no project)** at the bottom for sessions with no project.
- Each entry shows `name · count`. Click selects the project filter.
- Selected entry is highlighted (background + left color bar).

### Middle pane — Session list (~360px)

Fixed header:

- Search input (`q`) — debounced, full-text match over `Message.content` for
  `user` and `assistant` roles.
- Tool filter as a small dropdown / chip group (Claude, Codex, Gemini, Kimi,
  All).

List body (virtualized when item count > 100):

- Each card shows:
  - **Title** — the server-provided `title` (see API), shown single-line and
    CSS-truncated to one line in the card.
  - **Meta** — relative time (`2h ago`), tool name, message count, token total
    (compact, e.g. `48k`).
- Selected card: highlighted background + left color bar.
- Empty state when filters return zero matches.

### Right pane — Detail (flex)

Header bar (sticky):

- Title (same first-message truncation).
- Secondary line: full start timestamp, model, cwd (truncated, hover for full),
  total messages, total tokens, estimated cost (from existing pricing).
- Actions: **Copy link** (copies the current URL with `?id=…`), **Show tool
  details** toggle (expand-all / collapse-all override).

Message stream — see [Rendering](#rendering).

## Rendering

Medium-density rendering. Tool calls compress to one line by default and
expand on click.

### user messages

- Light blue background.
- Body rendered as markdown (paragraphs, lists, inline code, code blocks).
- Code blocks use syntax highlighting.

### assistant messages

- Light gray background.
- Body rendered as markdown identically to user messages.
- After the body, render each item of `Message.tool_calls` as a single
  monospace row:
  ```
  ▸ <ToolName>  <primary-arg-preview>
  ```
  - `primary-arg-preview` is a short string extracted from `args` (e.g., file
    path for `Read`/`Edit`, command for `Bash`, pattern for `Grep`). For other
    tools, fall back to compact JSON truncated to ~60 chars.
  - Status coloring:
    - `status == "success"` (or absent) — neutral / blue accent
    - `status == "error"` — red accent
- Clicking a tool-call row expands an inline panel with full `args` (JSON,
  pretty-printed) and result/output if present, truncated at ~2000 chars with
  "show more" affordance.

### thinking blocks (Claude only)

- The unified `Message.tokens.thinking` field signals presence. If thinking
  content is available in the message body (separated by collector parsing),
  collapse it into a single row `▸ thinking (N tokens)` that expands on click.
- If thinking content is not separately exposed by the collector, just show
  the token count in the header line.

### Pagination of messages

- Render the first 50 messages on mount.
- Sentinel at the bottom triggers loading the next 50 on scroll.
- Search inside a session (`Cmd-F`) is delegated to the browser native find;
  if the requested match is past the rendered window, load all and scroll.

## API

Two new endpoints. The existing `/api/sessions` is unchanged.

### `GET /api/sessions/list`

Lightweight list, no `messages` payload.

Query parameters:

| name | type | meaning |
|---|---|---|
| `project` | string | exact match on `Session.project`; pseudo value `__none__` matches null project |
| `tool` | string | `claude` \| `codex` \| `gemini` \| `kimi` |
| `q` | string | full-text query (see below) |
| `from`, `to` | string | ISO date range (same convention as other endpoints) |
| `limit`, `offset` | int | pagination, defaults `limit=200`, `offset=0`, max `limit=2000` |

Response:

```json
{
  "total": 1234,
  "offset": 0,
  "count": 200,
  "sessions": [
    {
      "id": "…",
      "tool": "claude",
      "project": "vibe-usage",
      "model": "claude-opus-4-7",
      "start_time": "2026-05-13T14:23:00Z",
      "message_count": 42,
      "token_total": 48213,
      "title": "添加 session viewer 功能…",
      "match_preview": "…and showing the <em>cache</em> hits per…",
      "match_count": 3
    }
  ]
}
```

- `title` = first non-empty user message, single-line, truncated to 80 chars
  (server-side so client doesn't need messages).
- `token_total` = sum of `input + output + thinking` over all messages (cache
  read/write excluded, consistent with existing analytics).
- `match_preview` and `match_count` are present only when `q` is non-empty.

### `GET /api/sessions/:id`

Returns one full `Session` (existing schema, unchanged shape), or 404.

### Search semantics

- Case-insensitive substring match over the concatenation of `Message.content`
  for `user` and `assistant` roles within each session.
- Multiple whitespace-separated terms are AND-combined.
- No regex, no fielded search — keep it simple.
- Implementation: scan the existing in-memory session cache; current cache
  warm time is acceptable.

### `Title` extraction rule

- The first message with `role == "user"` and non-empty trimmed content, with
  newlines collapsed to single spaces, truncated to 80 chars.
- If no such message exists, fall back to `"(no prompt)"`.

## Frontend

New file `web/src/pages/sessions.tsx`. Registered in the same router/shell as
`bash-history.tsx` and `projector.tsx`.

### Components

Split into small files under `web/src/components/sessions/`:

- `project-nav.tsx` — left pane list
- `session-list.tsx` — middle pane with search + tool filter + virtualized list
- `session-detail.tsx` — right pane header + message stream
- `message-bubble.tsx` — single user / assistant message renderer
- `tool-call-row.tsx` — collapsible tool call row
- `markdown.tsx` — thin wrapper around `react-markdown` + syntax highlighter

### Dependencies

- `react-markdown` — markdown rendering (add if missing)
- A syntax highlighter — prefer the existing dep if any; otherwise add
  `react-syntax-highlighter` with a single light theme to keep bundle small
- A virtualization helper — prefer `@tanstack/react-virtual` if already in
  tree; otherwise skip virtualization at first and only add if the list
  becomes janky

(Confirm during implementation by reading `web/package.json` before adding
anything new.)

### URL state

Query params on `/sessions`:

- `id` — selected session id (drives the right pane)
- `project` — selected project filter (drives left + middle pane)
- `tool` — tool filter
- `q` — search query

All four are reflected to and read from the URL so the page is reloadable and
linkable.

## Error handling

- `/api/sessions/list` and `/api/sessions/:id` return JSON error objects with
  HTTP status on failure (same convention as other endpoints).
- Frontend shows an inline error state in the affected pane (left/middle/right
  independently — failure to load one session does not blank out the list).
- 404 on `/api/sessions/:id` shows `"Session not found"` in the right pane and
  clears `?id` from the URL.

## Testing

- A Rust integration test for `/api/sessions/list` covering: empty filters,
  project filter (including `__none__`), tool filter, `q` AND-matching,
  pagination, `title` extraction with a multiline first prompt.
- A Rust test for `/api/sessions/:id` happy path and 404.
- Frontend: no formal test infra exists in `web/`; manual verification by
  running `vibe-usage serve` and exercising the page is acceptable for this
  iteration.

## Performance notes

- Session cache is already warmed on server start (`server.rs:283-293`); both
  new endpoints reuse it.
- `match_preview` extraction runs O(messages) per matched session. For 1000+
  sessions with long messages this is the hot path; cap preview generation to
  the first match and truncate to 200 chars.
- The detail endpoint returns whatever the collector parsed — no extra cost.

## Open implementation choices (pick during planning)

- Whether to add `react-virtual` immediately or defer until measured janky.
- Single light theme vs respecting an existing dark/light toggle if one exists
  in the dashboard shell.
- Whether `match_preview` should highlight terms with `<em>` on the server or
  return raw and let the client highlight.
