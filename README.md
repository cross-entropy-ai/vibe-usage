<h1>
  <img src="./docs/pics/logo.png" alt="Organization Logo" width="28" style="vertical-align: middle;" />
  vibe-usage
</h1>

[![Release](https://img.shields.io/github/v/release/cross-entropy-ai/vibe-usage?color=8b5cf6)](https://github.com/cross-entropy-ai/vibe-usage/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/cross-entropy-ai/vibe-usage/release.yml?label=build&color=22c55e)](https://github.com/cross-entropy-ai/vibe-usage/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/cross-entropy-ai/vibe-usage/total?color=0ea5e9)](https://github.com/cross-entropy-ai/vibe-usage/releases)

**Local-first** usage analytics for AI coding tools.

Single binary, written in **Rust**.

Sync local raw data, then explore **rich stats** in the dashboard (**usage**, **cost**, **projects**, **activity**, and more).

Supports Gemini CLI, Claude Code, OpenAI Codex, and Kimi Code.

## Screenshots

![Dashboard](./docs/pics/dashboard.png)

<p align="center">
  <img src="./docs/pics/usage-snapshot.png" alt="Usage Snapshot" width="48%" />
  <img src="./docs/pics/cost.png" alt="Cost Pressure and Savings" width="48%" />
</p>
<p align="center">
  <img src="./docs/pics/projects.png" alt="Projects and Host Coverage" width="48%" />
  <img src="./docs/pics/activity.png" alt="Activity and Conversation Insights" width="48%" />
</p>

## Install

```bash
brew tap cross-entropy-ai/tap
brew install vibe-usage
```

Or download pre-built binaries from [GitHub Releases](https://github.com/cross-entropy-ai/vibe-usage/releases).

Need to build from source? See [`docs/build-from-source.md`](docs/build-from-source.md).

## Usage

After install, use **`sync`** to collect local data and **`serve`** to view local-first stats in the dashboard.

```bash
vibe-usage sync                        # copy raw files to ~/.vibe-usage/raw/<hostname>/
vibe-usage serve                       # start web dashboard on :3000
vibe-usage serve -p 8080               # custom port
```

By default, `vibe-usage` is **local-first** and reads/writes only your local data directory.

For `analyze`, `push`, `pull`, and other **advanced setup**, see [`docs/advanced-usage.md`](docs/advanced-usage.md).

## Others

- [`docs/web-dashboard.md`](docs/web-dashboard.md)
- [`docs/release.md`](docs/release.md)
- [`docs/architecture.md`](docs/architecture.md)
