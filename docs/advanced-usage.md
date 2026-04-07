# Advanced Usage

Use this guide if you want to sync data across machines through a central server.

By default, `vibe-usage` is local-first and reads/writes only your local data directory.

## Prerequisite

Prepare a reachable server path, for example:

- `user@host:~/.vibe-usage`

`vibe-usage` uses this path through `rsync` for both upload and download.

## Step 1: configure `remote`

Create or edit `~/.vibe-usage/config.toml` and set `remote`:

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

`remote` is the single source of truth for sync destination.

## Step 2: run first sync

From your machine:

```bash
vibe-usage push
```

This uploads your local data directory to `remote`.

## Step 3: pull on another machine (or same machine)

On another machine with the same `remote` configured:

```bash
vibe-usage pull
```

This downloads data from `remote` into local `~/.vibe-usage`.

## Command reference

- `vibe-usage push`: local `~/.vibe-usage` -> `remote`
- `vibe-usage pull`: `remote` -> local `~/.vibe-usage`
- Global flags:
  - `-t, --tools <gemini,claude,codex,kimi>`: filter tools (default: all)
  - `-d, --data-dir <path>`: data directory (default: `~/.vibe-usage`)

If `remote` is missing, `push`/`pull` cannot determine where to sync.

## Daily workflow

```bash
# after collecting new local data
vibe-usage push

# before reviewing data from all machines
vibe-usage pull
```

## Analyze commands

Use these when you need exports or filtered analysis:

```bash
vibe-usage analyze --summary           # parse from local copy, print stats
vibe-usage analyze -o all.json         # export full JSON
vibe-usage analyze -t claude --summary # specific tools only
```

## Data layout

```text
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
