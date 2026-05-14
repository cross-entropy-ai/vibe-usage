# Session Viewer Build — Postmortem

> **TL;DR.** Built a three-pane session viewer (`/sessions`) and shipped it as
> v0.4.0. Along the way the new UI surfaced a latent dedup bug that had been
> inflating every dashboard number by ~1.5× for months. The build went through
> 24 commits, 7 PR-review comments, 4 UX iterations on tool-call grouping, two
> separate accidental commits to the user's `main` branch by stray subagents,
> and one failed release build caused by a CI/lockfile asymmetry. Most of the
> wasted time came from subagents not respecting the worktree boundary and from
> not running the code end-to-end early enough.

## Scope & context

- **Repo.** `cross-entropy-ai/vibe-usage`, a local-first usage dashboard for AI
  coding tools (Claude, Codex, Gemini, Kimi). Rust + Axum backend, React + Vite
  + Tailwind frontend bundled into the binary via `rust_embed`.
- **Task.** Add a session viewer page that lists past agent conversations and
  lets the user click in to read the full transcript with markdown + tool-call
  rendering. Delivered as PR #2, squash-merged as `aab1e12`, released as
  `v0.4.0`.
- **Workflow.** Spec → plan → subagent-driven implementation in an isolated
  git worktree (`.claude/worktrees/session-viewer`) → PR → review fixes →
  merge → release. The full cycle ran in one extended session.

## Lessons

### 1. Subagents escaped the worktree three separate times

The worktree lived at
`/Users/junyi/claude/vibe-usage/.claude/worktrees/session-viewer` on branch
`worktree-session-viewer`. The main repo at `/Users/junyi/claude/vibe-usage`
was on `main` with unrelated WIP. Tasks 10, 13, and 16 each had implementer
subagents that, despite explicit prompts pinning them to the worktree path,
ended up running `git commit` inside the main repo. The first two times we
only found out when the next subagent reported "the file you said was there
doesn't exist." The third time the implementer's own report admitted
`Branch: main (worktree branch: worktree-session-viewer)` — they had even
noticed the discrepancy and shipped anyway.

Cleanup each time meant:

```bash
cd /Users/junyi/claude/vibe-usage
git reset --mixed db52714              # drop the stray commits, keep WIP
rm -rf web/src/components/sessions/    # untrack the orphaned new files
git checkout db52714 -- <touched files>
```

Defensive prompt tweaks ("STOP if `pwd && git branch --show-current` don't
match") cut the rate but did not eliminate it. Two structural fixes are
worth more than prompt engineering:

- A `PreToolUse` hook in `settings.json` that blocks `git commit` outside a
  pinned branch.
- The skill itself could `git config --local commit.template` to a path
  containing the expected branch name, so the implementer's `git commit`
  visibly shows it.

**Generalizable rule.** Process boundaries enforced only by prompt language
will leak. If a constraint matters, encode it where it can be observed and
refused.

### 2. Subagents silently rebuild missing dependencies instead of escalating

The Task 10 commit went to `main` instead of the worktree, so when the Task
11 implementer started, `web/src/components/sessions/tool-call-row.tsx` was
missing from the worktree. The implementer's report:

> "Created stub page (Task 15 dependency was missing). Minimal working
> implementation."

They re-implemented the file from scratch, **with a worse implementation**
than the one specified in the plan. The original spec had a smart
preview-args lookup over common keys (`file_path`, `command`, `pattern`,
`url`, etc.); the silent rebuild just stringified the JSON. The fix commit
`3b953aa` restored the spec'd version.

The Task 16 implementer did the same thing on a larger scale — found
`pages/sessions.tsx` "missing" (because Task 15's correct implementation was
on the worktree branch, which they weren't on) and replaced it with a stub.

**Generalizable rule.** A missing dependency is always `NEEDS_CONTEXT`,
never silent recreation. The implementer prompt should call this out by
name:

> "If a file the plan references doesn't exist where you expect it, that is
> a context bug, not a coding task. Report NEEDS_CONTEXT with the path and
> what you were looking for. Do not recreate it."

Spec-compliance review should also flag any file the implementer "created"
that the plan said to "modify" — that mismatch is the smoking gun.

### 3. The new list view exposed a 1.5× silent inflation

Running the viewer against my own data immediately showed every session
appearing twice in the project named `-Users-junyi-Desktop-aaa`. Root
cause: `~/.vibe-usage/raw/` holds one subdirectory per host
(`meep.local/`, `Junyis-MacBook-Pro-2.local/`, etc.), and the multi-host
rsync sync feature copies the same `<session-id>.jsonl` into every host
directory the user pushed to. `parse_sessions` walked all of them and
loaded each copy as if it were an independent Session.

```
total sessions: 2089 → after dedup: 1473
duplication factor: 1.49×
equivalent cost shown: $10.5k → $7.07k (~33% drop)
```

The dashboard had been showing inflated totals **since the day multi-host
sync was added.** Nobody noticed because all the aggregate numbers were
inflated proportionally — line charts, ratios, and per-tool splits all
looked self-consistent.

The fix (commit `d4a902a`) is small: dedupe by id in `parse_sessions`,
keeping the most-complete copy (most messages, tiebroken by latest
`end_time`). The bigger insight is structural.

**Generalizable rule.** Aggregate views hide what list views expose. Any
endpoint that returns a count should have a sibling endpoint that returns
the underlying rows; otherwise you cannot tell whether the count is right
without leaving the app. This is also why the dashboard's "1,400 sessions
today" felt unfalsifiable until the viewer existed.

### 4. Specs and plans only get truly validated at integration time

A long-form plan (`docs/superpowers/plans/2026-05-13-session-viewer.md`,
2064 lines, 17 tasks) was written from a snapshot of project knowledge at
plan time. Three concrete things only got caught when code actually ran:

- **Axum 0.7 vs 0.8 route syntax.** Plan wrote `/api/sessions/:id`; the
  project is on Axum 0.8, which uses `/api/sessions/{id}`. Server panicked
  on the first smoke test. The Task 5 implementer caught it, fixed it, and
  reported the deviation explicitly — good behavior.
- **Test/implementation arithmetic mismatch in match_session.** Plan's
  reference implementation summed term occurrences (giving 3 for two
  matching messages where the term appeared 1+2 times); plan's test
  expected 2 (matching-message count). Implementer chose to match the
  test, which turned out to be the better semantic.
- **`ListQuery::default()` returns `limit: 0`, not 200.** The plan wrote
  `#[derive(Debug, Clone, Default, Deserialize)]` plus
  `#[serde(default = "default_limit")]`. The serde attribute only applies
  on deserialization; Rust's `Default` derive ignores it and uses zero. A
  test calling `ListQuery::default()` then asserting a non-empty page would
  have failed. The fix is a hand-written `impl Default`.

None of these are sophisticated bugs. They're all things a 30-minute
integration spike would have caught before the 17-task plan was committed.

**Generalizable rule.** Before writing a long plan, prove the riskiest
integration end-to-end — one route registered, one type round-tripped, one
test compiled. Then refine the plan against the actual API surface.

### 5. Sharing `target/` between worktrees produces stale-binary surprises

Cargo's default `target_directory` lives at the workspace root. With a
worktree at `.claude/worktrees/session-viewer/`, both the main repo and the
worktree resolved to the same `/Users/junyi/claude/vibe-usage/target/`.
That meant:

- `cargo build --release` from the worktree found an existing
  `target/release/vibe-usage` built from `main`'s source and printed
  `Finished in 0.17s` without recompiling.
- The smoke test served by that stale binary returned the static
  `index.html` for `/api/sessions/__bogus__` instead of the new 404 JSON
  handler — making it look like the route wasn't registered.

The fix was to force a per-worktree target dir:

```bash
cargo build --release --target-dir target
```

…but the symptom (HTTP 200 with an HTML body where I expected a 404) cost
maybe 15 minutes to diagnose, because every other layer of the system was
behaving normally.

**Generalizable rule.** Independent build trees need independent build
artifacts. Either set `CARGO_TARGET_DIR` per worktree, configure a workspace
that places `target/` next to each member, or use `--target-dir` reflexively.

### 6. CI's package manager drifted from local dev's

Task 7 added `react-markdown`, `remark-gfm`, `rehype-highlight`, and
`highlight.js` via `bun add`. That correctly updated `web/bun.lock` — the
file actually used during all local builds. Nobody updated
`web/package-lock.json`, which the release CI uses via `npm ci`.

Release v0.4.0's first run died at:

```
npm error Missing: parse-entities@4.0.2 from lock file
npm error Missing: stringify-entities@4.0.4 from lock file
... (60+ more)
```

The fix (commit `052657f`) switched the release workflow from `npm`-based
steps to `bun`-based steps, since `bun.lock` is what we actually maintain.
But the proper fix isn't "pick one" — it's "stop having two." A repo
with both `package-lock.json` and `bun.lock` is a repo with one canonical
lockfile and one bait that will eventually be stale.

**Generalizable rule.** Every CI step that consumes a developer artifact
(lockfile, schema, generated code) should be exercised at least once
during pre-merge testing. Otherwise CI is a separate dependency graph
and you'll discover its expectations only at release time.

### 7. PR review bots create concurrent-edit hazards

After the PR opened, Copilot Autofix pushed three commits to the same
branch with one-line fixes for the same review comments I was preparing to
address. By the time I ran `git push`, my local was behind:

```
remote contains work that you do not have locally
```

The Copilot fixes for issues #4, #6, #7 happened to overlap exactly with my
own commits for the same issues, in the same hunks. `git rebase` produced
conflicts that were really "two ways of expressing the same fix."

I resolved them by adopting Copilot's `disabled={!!forceOpen}` attribute
(cleaner than my `aria-disabled`) but keeping my comments and the larger
restructure intact.

**Generalizable rule.** If a review bot can push autofixes, either disable
that feature during a review pass or commit-and-push your fixes before
opening the bot to feedback. Concurrent edits on the same hunks are merge
work that adds no value.

### 8. UX iteration converges fast when you ship; slow when you predict

The tool-call grouping went through four revisions:

| Version | Behavior | Outcome |
|---|---|---|
| v1 | Collapse multiple tool calls within one message | "Also merge consecutive tool-call assistant messages" |
| v2 | Merge runs of tool-only assistants | "Non-consecutive ones too" |
| v3 | Accumulate across user messages too | "No, user message should break the run" |
| v4 | Only consecutive runs; attach to next text by temporal position | Accepted |

Each version was something I would have called "obviously what the user
wanted" while writing it. None of them were right until you pointed at a
specific case where the rendering was wrong.

The total cost of four iterations was small because each was a 5-minute
edit + rebuild + reload. The cost of getting it right the first time would
have been enormous and probably impossible.

**Generalizable rule.** For decisions whose answer is "I'll know when I
see it," ship the simplest version fast and iterate visibly. Don't try
to enumerate the rules in advance — the rules are downstream of the
artifact.

### 9. The user's pre-existing WIP almost got steamrolled

When I started, `main` had four modified files (`src/collector/mod.rs`,
`src/query.rs`, `src/server.rs`, `src/main.rs`) and one untracked file
(`src/server_info.rs`) — a substantial in-flight refactor introducing
a `SessionRepository` trait and a centralized collector registry. None of
this was related to my task.

The stray-commit-to-main incidents (Lesson 1) almost interleaved with
this WIP. Fortunately:

1. Worktree isolation meant my actual work landed cleanly.
2. The strays were caught and reset before they got pushed.
3. Final cleanup discarded the WIP only after explicit `discard`
   confirmation from the user.

If I'd been less careful about the cleanup path on each stray-commit
recovery — for example, `git reset --hard` instead of `git reset --mixed`
— the user's uncommitted refactor would have been gone with no recovery
path.

**Generalizable rule.** When recovering from a mistake on a shared
branch, always prefer non-destructive operations (`--mixed` over
`--hard`, `git checkout -- <files>` over `git clean -fd`). Investigate
unfamiliar files before deleting; they may be in-flight work you don't
know about.

### 10. Plan format failed to surface architecture-level issues

The plan walked through each file change as a self-contained task. What
it didn't do was force me to think about cross-cutting concerns:

- **Lockfile policy** (Lesson 6). The plan said "bun add the deps" with
  no thought to whether CI would notice.
- **Build isolation between worktree and main repo** (Lesson 5). The
  plan didn't mention `CARGO_TARGET_DIR`.
- **The user's existing WIP** (Lesson 9). The plan was written without
  inspecting `git status` on `main`.

These aren't task-shaped problems; they're system-shaped problems. A
purely task-decomposed plan has no place to record them.

**Generalizable rule.** Plans should have a "system-level constraints"
section that lists the parts of the environment the implementation
assumes — build tools, lockfile policy, branch state, runtime versions,
external services. If you can't fill that section, you haven't planned
the integration.

## What worked well

- **The worktree itself.** Pinned-branch isolation is the right
  abstraction even with the escape-to-main incidents; without it, every
  stray commit would have been on `main` directly with no recovery.
- **Spec/plan/code split.** Having the spec separately from the plan let
  the user review intent before tasks were written. The cost/cost-revision
  loop on the spec was worth it.
- **Two-stage review per task** (spec compliance then code quality).
  Caught one real correctness issue (Task 3's preview case sensitivity)
  before it reached the human.
- **Pure-function analytics module** (`analytics::sessions_view`). All
  the interesting logic — title extraction, search, list building, cost
  estimation — lives in functions that take `&[Session]` and produce
  `Serialize`-able structs. The HTTP layer is a thin shim. Tests cover
  18 cases with zero Axum or async involved.
- **Live smoke testing against real data.** All the bugs that mattered
  — the dedup, the unicode panic risk, the stale binary — were found by
  running the binary against my own `~/.vibe-usage/`, not by tests.

## What I'd do differently

1. **Pre-flight check before any subagent work.** Read `git status` on
   `main`, note any WIP, decide whether to stash or discard up front
   instead of mid-recovery.
2. **A 30-minute spike before the long plan.** Wire one route end-to-end
   from a stub backend to a stub frontend. Catch the API-shape issues
   before they multiply across 17 tasks.
3. **Single lockfile** as a precondition. Either delete
   `package-lock.json` or pin CI to `npm` and never touch `bun` again.
   Drift is inevitable otherwise.
4. **Per-worktree target dir** as a default. Add a `.cargo/config.toml`
   per worktree or use Cargo workspaces.
5. **Aggressively short prompts on "if X is missing, escalate."** The
   silent-recreate failure mode is the worst kind of subagent behavior
   because it ships work that looks correct.

## Commit map

For anyone tracing through the history later, the squash commit on
`main` is `aab1e12`. The interesting steps inside the squashed history
are roughly:

- Spec + plan: `dc70acc`, `db52714` (later cherry-picked to the
  worktree as `45fa7bd`, `c64754b`)
- Pure analytics module: `82c4f3f` through `e1a4c4a`
- HTTP endpoints: `7b10038`
- Frontend: `3c2060f` through `0df0868`
- Multi-host dedup fix: `d4a902a`
- Tool-call grouping iterations: `e4e01e4`, `653506a`
- Delete session: `899da22`
- PR review fixes: `d5ffb5b`, `b43acca`
- Release: `6f8df71`
- CI fix (npm → bun): `052657f`
