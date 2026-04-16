# Agent Module Design

## Goal

Add an `agent` module to vibe-usage that lets Rust code invoke coding agents (Claude Code, Codex, Gemini) through a unified builder API. Each agent is a CLI subprocess; the module translates a common configuration into agent-specific command-line arguments.

Start as an internal module with clean boundaries so it can be extracted into a standalone crate later.

## Scope

- Single-shot invocation only (`--print` / `exec` mode). No streaming, no multi-turn.
- Return the final text output + exit code.
- Configuration passed per-call via builder. No config file integration yet.
- Three agents: Claude Code, Codex, Gemini.

## Module Structure

```
src/agent/
  mod.rs          Agent trait, RunConfig, RunOutput, AgentRunner, spawn helper, registry
  claude.rs       ClaudeAgent
  codex.rs        CodexAgent
  gemini.rs       GeminiAgent
```

`main.rs` adds `mod agent;`. No subcommand wired up yet.

## Core Types

### Agent trait

```rust
#[async_trait]
pub trait Agent: Send + Sync {
    fn name(&self) -> &str;
    fn is_available(&self) -> bool;
    async fn run(&self, config: &RunConfig) -> Result<RunOutput>;
}
```

- `is_available()` checks if the CLI binary exists on PATH.
- `run()` builds a `Command`, spawns it, collects output.

### RunConfig

```rust
pub struct RunConfig {
    pub prompt: String,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub allowed_tools: Option<Vec<String>>,
    pub cwd: Option<PathBuf>,
    pub extra_args: Vec<String>,
}
```

Only fields that map to concepts all three agents share. `extra_args` is the escape hatch for agent-specific flags.

### RunOutput

```rust
pub struct RunOutput {
    pub text: String,
    pub exit_code: i32,
}
```

Minimal. Can be extended with `stderr`, `duration`, etc. later.

## Builder: AgentRunner

```rust
let output = AgentRunner::new("claude")
    .model("opus")
    .system_prompt("你是代码审查专家")
    .cwd("/path/to/project")
    .extra_args(vec!["--max-budget-usd".into(), "1".into()])
    .run("帮我检查 src/main.rs")
    .await?;
```

- `new(name)` takes an agent name string, does not resolve the agent yet.
- Builder methods take `&mut self` and return `&mut Self` for conditional chaining.
- `run(prompt)` resolves the agent via the internal registry, builds `RunConfig`, calls `agent.run()`.
- Callers never import agent structs directly.

### Registry

```rust
fn create_agent(name: &str) -> Result<Box<dyn Agent>> {
    match name {
        "claude" => Ok(Box::new(ClaudeAgent)),
        "codex"  => Ok(Box::new(CodexAgent)),
        "gemini" => Ok(Box::new(GeminiAgent)),
        _ => bail!("unknown agent: {name}"),
    }
}
```

## CLI Mapping Per Agent

### ClaudeAgent

```
claude -p --output-format text \
  [--model <model>] \
  [--system-prompt <prompt>] \
  [--allowedTools <tools...>] \
  [extra_args...] \
  <prompt>
```

- cwd via `Command::current_dir()`
- `--output-format text` for plain text output

### CodexAgent

```
codex exec \
  [-m <model>] \
  [-C <cwd>] \
  [extra_args...] \
  <prompt>
```

- No `--system-prompt` flag. If `system_prompt` is set, prepend to prompt: `"{system_prompt}\n\n{prompt}"`.
- `allowed_tools` has no direct equivalent; ignored (use `extra_args` for sandbox policy).
- Codex has its own `-C` flag for working directory, used instead of `Command::current_dir()`.

### GeminiAgent

```
gemini -p <prompt> \
  [--model <model>] \
  [-o text] \
  [extra_args...]
```

- No `--system-prompt` flag. Same prepend strategy as Codex.
- `allowed_tools` via `--allowed-tools` (deprecated but functional).
- cwd via `Command::current_dir()`.

## Shared Helper

```rust
async fn spawn_and_collect(cmd: &mut Command) -> Result<RunOutput> {
    let output = cmd.output().await?;
    Ok(RunOutput {
        text: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}
```

Each agent's `run()` only builds a `Command` and delegates to this function.

## Dependencies

Add `async-trait` to `Cargo.toml`. Everything else (`tokio`, `anyhow`) is already present.

## Testing

- Unit tests per agent: verify `Command` argument construction without spawning.
- `is_available()` test: just assert it returns a bool and doesn't panic.
- No real CLI invocation in CI (external dependency).

## Future Extensions

- Streaming output (swap `spawn_and_collect` for a line-by-line reader).
- Bidirectional `stream-json` communication for multi-turn.
- Config file integration (read defaults from `config.toml`).
- Extract into standalone crate.
- Add more agents.
