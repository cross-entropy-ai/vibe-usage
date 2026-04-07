# Architecture

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
