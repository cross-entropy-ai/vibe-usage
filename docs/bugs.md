# Bugs

This document records currently known correctness bugs found during code review.

## 1. Kimi sessions use sync-time timestamps instead of conversation timestamps

- Severity: High
- Affected files:
  - `src/collector/kimi.rs`
  - `src/collector/mod.rs`

### What happens

Kimi sessions and messages are timestamped from the copied file's modified time:

- `parse_kimi_session()` reads `context.jsonl` metadata and converts `modified()` into `mtime`
- that single `mtime` value is written into every `Message.timestamp`
- the same `mtime` is also used as `Session.start_time`

At sync time, raw files are copied into the local store with `fs::copy()`. The destination file's modified time reflects the copy operation, not the original conversation time.

### Why this is a bug

All downstream analytics assume `start_time` and `timestamp` represent when the session actually happened. For Kimi data they instead represent when `vibe-usage sync` last copied the raw file.

That breaks:

- date filtering
- daily summaries
- activity heatmaps
- cost timelines
- host/project activity trends

### Concrete impact

If a user had a Kimi session on April 1 but ran `vibe-usage sync` on April 16, that session can appear as April 16 activity.

### Fix direction

Parse real timestamps from Kimi raw data if available. If the format does not contain per-message timestamps, at minimum avoid using copied-file `mtime` as authoritative session time.

## 2. Cost breakdown merges different tools when they share the same model on the same day

- Severity: High
- Affected file:
  - `src/analytics/cost.rs`

### What happens

`cost_breakdown()` aggregates `by_model` rows in a map keyed only by:

- `date`
- `model`

The stored value also carries a single `tool` string, but the tool is not part of the key.

### Why this is a bug

If two tools use the same model on the same date, their tokens are merged into one `ModelCost` row. The resulting row is then labeled with whichever tool happened to be inserted first.

That makes the output internally inconsistent:

- token totals are combined across tools
- `tool` is only one tool
- `is_subscription` is computed from that one tool

### Concrete impact

If Claude and Codex both use `gpt-5` on the same day:

- `by_model` will show one combined row instead of one row per tool
- filtering dashboard data by tool can show incorrect token totals
- subscription labeling can be wrong for part of the merged usage

### Fix direction

Key the aggregation by `(date, model, tool)` instead of `(date, model)`.

## 3. Codex token usage is attached only once, to the last assistant message

- Severity: High
- Affected file:
  - `src/collector/codex.rs`

### What happens

The Codex collector:

- watches `event_msg` entries for `token_count`
- stores only the latest cumulative token snapshot in `last_token_snapshot`
- after the whole file is parsed, attaches that final snapshot to the last assistant message only

### Why this is a bug

Codex token snapshots are cumulative across the session. Attaching only the final cumulative snapshot to the final assistant message loses per-turn attribution and misstates totals for message-level analytics.

This is especially wrong when:

- the session has multiple assistant turns
- the session changes models midstream
- the final assistant item is a tool call shell rather than the text turn that incurred the tokens

### Concrete impact

Dashboard views built on per-message tokens can attribute an entire session's cost/tokens to a single late message and a single model.

### Fix direction

Track token snapshots incrementally and assign per-turn deltas to the corresponding assistant turn, or store session-level token totals separately instead of pretending they belong to one message.

## 4. Git activity merges unrelated repositories that share a branch name

- Severity: Medium
- Affected file:
  - `src/analytics/projects.rs`

### What happens

`git_activity()` chooses the repository key using:

- `git.repo_url`
- otherwise `git.branch`

### Why this is a bug

Branch name is not a repository identifier. Many unrelated repositories use the same branch names such as `main`, `master`, or `develop`.

When `repo_url` is missing, multiple unrelated repos collapse into a single `GitRepoStats` entry.

### Concrete impact

Claude sessions that only record branch names can produce fake repo rows like `main` with aggregated data from many separate projects.

### Fix direction

Do not use branch alone as a repo identity. Prefer a stronger key such as repo URL or working directory. If no stable repo identifier exists, treat the repo as unknown rather than merging by branch.

## 5. CLI `analyze` output drops hostname information

- Severity: Medium
- Affected files:
  - `src/main.rs`
  - `src/query.rs`

### What happens

The server path injects hostnames during parsing:

- `parse_sessions()` in `src/query.rs` derives hostname from `raw/<hostname>/<tool>/`
- it writes that value into each parsed session

The CLI `analyze` path does not do that. `do_parse()` in `src/main.rs` extends `all_sessions` directly from collector output without attaching hostname.

### Why this is a bug

The raw data layout is explicitly multi-host, but exported session JSON and CLI summaries omit which host produced each session.

### Concrete impact

After `pull` from multiple machines:

- the dashboard API can distinguish hosts
- `vibe-usage analyze -o all.json` cannot

The same underlying dataset therefore yields different information depending on the code path.

### Fix direction

Apply the same hostname injection logic in `do_parse()` that the server path already uses.

## 6. Tool success metrics count unknown status as success

- Severity: Medium
- Affected file:
  - `src/analytics/tokens.rs`

### What happens

`tools_status()` treats every tool call status other than `"error"` as success.

That includes:

- `None`
- unrecognized strings
- partial or cancelled states

### Why this is a bug

Missing status is not evidence of success. This inflates success counts and can make tool reliability dashboards look healthier than the source data supports.

### Concrete impact

Collectors that do not populate `status` will report 100% success for all tool calls.

### Fix direction

Track unknown status separately, or only count explicit success values as success.

## 7. Home-directory shortening can rewrite unrelated paths incorrectly

- Severity: Low
- Affected file:
  - `src/analytics/projects.rs`

### What happens

`directories()` shortens paths by checking string prefix match against the home directory and rewriting the prefix to `~`.

### Why this is a bug

String prefix matching is not path-boundary aware. A path like:

- `/Users/junyi2/project`

starts with:

- `/Users/junyi`

so it would be rewritten to:

- `~2/project`

which is not a valid home-relative path.

### Fix direction

Only shorten when the path is exactly the home directory or starts with the home directory plus a path separator.

## 8. Codex developer messages are counted as user messages

- Severity: Low
- Affected file:
  - `src/collector/codex.rs`

### What happens

The Codex collector maps both:

- `"user"`
- `"developer"`

to `Role::User`.

### Why this is a bug

Developer messages are system/developer instructions, not user-authored prompts. Treating them as user messages distorts user-message counts and any analytics derived from user content.

### Concrete impact

These dashboards become inaccurate for Codex sessions:

- prompt-length distributions
- task classification
- user vs assistant message split

### Fix direction

Represent developer messages separately, or map them to `Role::System` if the unified schema must stay limited.

## Validation notes

- `cargo test` passed during review.
- The existing tests cover agent command building, not collector correctness or analytics correctness.
- Frontend build verification was not completed in this environment because `npm` was not installed.
