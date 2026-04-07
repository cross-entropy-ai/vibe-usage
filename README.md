# vibe-usage

Collects conversation data from multiple AI coding tools, maps them to a unified schema, and serves a web dashboard for analysis.

## Supported Tools

| Tool | Data Location | Format |
|------|--------------|--------|
| Gemini CLI | `~/.gemini/tmp/<project>/chats/*.json` | JSON |
| Claude Code | `~/.claude/projects/<project>/*.jsonl` | JSONL |
| OpenAI Codex | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | JSONL |
| Kimi Code | `~/.kimi/sessions/<hash>/<uuid>/context.jsonl` | JSONL |

## Install

```bash
brew tap cross-entropy-ai/tap
brew install vibe-usage
```

Or download pre-built binaries from [GitHub Releases](https://github.com/cross-entropy-ai/vibe-usage/releases).

## Build from Source

Requires Rust 1.80+ and Node.js 18+.

```bash
# Build frontend
cd web && npm install && npx vite build && cd ..

# Build backend (embeds frontend dist into the binary)
cargo build --release
```

The resulting binary at `target/release/vibe-usage` is self-contained — frontend assets are embedded, no extra files needed.

## Usage

```bash
# Default: sync local data + print summary
vibe-usage

# Subcommands
vibe-usage sync                        # copy raw files to ~/.vibe-usage/raw/<hostname>/
vibe-usage analyze --summary           # parse from local copy, print stats
vibe-usage analyze -o all.json         # export full JSON
vibe-usage analyze -t claude --summary # specific tools only
vibe-usage serve                       # start web dashboard on :3000
vibe-usage serve -p 8080               # custom port
vibe-usage push                        # rsync local data to remote server
vibe-usage pull                        # rsync all data from remote server

# Global flags
-t, --tools <gemini,claude,codex,kimi> # filter tools (default: all)
-d, --data-dir <path>                  # data directory (default: ~/.vibe-usage)
```

## Configuration

`~/.vibe-usage/config.toml`:

```toml
remote = "user@host:~/.vibe-usage"

# Subscription-based tools (flat monthly, not per-token)
[[subscriptions]]
tool = "claude"
plan = "Team"
monthly_usd = 30.0

[[subscriptions]]
tool = "codex"
plan = "Plus"
monthly_usd = 20.0
```

## Data Layout

```
~/.vibe-usage/
├── config.toml
└── raw/
    └── <hostname>/        # one dir per machine
        ├── gemini/        # raw copies from each tool
        ├── claude/
        ├── codex/
        └── kimi/
```

Raw files are copied incrementally (mtime-based skip). Multiple machines can push to the same remote, each under their own hostname directory.

## Web Dashboard

`vibe-usage serve` starts an HTTP server with:

- Summary cards (sessions, messages, tokens, cost)
- Activity heatmap + punchcard
- Cost breakdown (API equivalent vs subscription, savings)
- Token trends by tool/model/day
- Tool call chains and file type distribution
- Cache efficiency and thinking ratio
- Language detection and task classification
- Project lifecycle timelines
- And more (20+ chart components)

### API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/summary` | Overview stats |
| `GET /api/sessions?tool=&from=&to=&project=&limit=&offset=` | Filtered session list |
| `GET /api/tokens/daily` | Daily tokens by tool |
| `GET /api/tokens/by-model` | Tokens per model |
| `GET /api/tools/usage` | Tool call frequency |
| `GET /api/tools/status` | Tool call success/error rates |
| `GET /api/projects` | Per-project aggregation |
| `GET /api/hosts` | Per-hostname aggregation |
| `GET /api/duration` | Time spent (daily + by project) |
| `GET /api/activity/heatmap` | Hour x weekday session counts |
| `GET /api/cost` | Cost analysis with subscription support |
| `GET /api/messages/latency` | Response latency percentiles |
| `GET /api/git/activity` | Sessions by git repo/branch |
| `GET /api/directories` | Sessions by working directory |
| `GET /api/insights/conversations` | Depth, prompt/response lengths |
| `GET /api/insights/cache-efficiency` | Cache hit rates |
| `GET /api/insights/thinking` | Thinking token ratios |
| `GET /api/insights/toolchains` | Tool call sequences + file types |
| `GET /api/insights/project-lifecycle` | Weekly project activity |
| `GET /api/insights/model-switches` | Mid-session model changes |
| `GET /api/insights/languages` | Language + task classification |
| `GET /api/insights/session-complexity` | Complexity by hour of day |

## Release

1. Update version in `Cargo.toml`
2. Commit and tag:

```bash
git tag v0.x.0
git push origin v0.x.0
```

GitHub Actions will automatically build all platforms, create a GitHub Release, and update the [Homebrew formula](https://github.com/cross-entropy-ai/homebrew-tap).

## Architecture

```
src/
├── main.rs              # CLI (clap subcommands)
├── schema.rs            # Unified types: Session, Message, TokenUsage, GitContext
├── pricing.rs           # Per-model API pricing + subscription config
├── remote.rs            # Push/pull via rsync
├── server.rs            # Axum HTTP server + API endpoints
├── insights.rs          # Deep analysis endpoints
├── analytics/
│   ├── mod.rs            # Shared helpers + re-exports
│   ├── tokens.rs         # Token aggregation
│   ├── summary.rs        # Overview stats
│   ├── cost.rs           # Cost breakdown
│   ├── activity.rs       # Duration, heatmap, latency, complexity
│   ├── projects.rs       # Projects, directories, hosts, git, lifecycle
│   └── insights.rs       # Cache, thinking, toolchains, languages, switches
└── collector/
    ├── mod.rs            # Collector trait + incremental sync
    ├── gemini.rs         # Gemini JSON → Session
    ├── claude.rs         # Claude JSONL → Session
    ├── codex.rs          # Codex JSONL → Session
    └── kimi.rs           # Kimi JSONL → Session

web/                     # React + Vite + shadcn/ui + Recharts
├── src/
│   ├── App.tsx
│   ├── types.ts
│   └── components/      # 20+ chart/table components
└── vite.config.ts
```

Adding a new tool: implement the `Collector` trait (`name`, `source_dir`, `glob_patterns`, `parse`) and register it in `main.rs`.
