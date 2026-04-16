# Agent Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `agent` module with a builder API to invoke Claude Code, Codex, and Gemini CLIs from Rust.

**Architecture:** `Agent` trait defines the contract. `AgentRunner` builder resolves agent by name, builds `RunConfig`, delegates to the trait impl. Each agent struct translates config into CLI args and spawns a subprocess via `tokio::process::Command`.

**Tech Stack:** Rust, tokio (already in project), async-trait (new dep)

**Spec:** `docs/superpowers/specs/2026-04-10-agent-module-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `Cargo.toml` | Modify | Add `async-trait` dependency |
| `src/main.rs` | Modify | Add `mod agent;` declaration |
| `src/agent/mod.rs` | Create | `Agent` trait, `RunConfig`, `RunOutput`, `AgentRunner` builder, `create_agent` registry, `spawn_and_collect` helper |
| `src/agent/claude.rs` | Create | `ClaudeAgent` — translates config to `claude` CLI args |
| `src/agent/codex.rs` | Create | `CodexAgent` — translates config to `codex exec` CLI args |
| `src/agent/gemini.rs` | Create | `GeminiAgent` — translates config to `gemini` CLI args |

---

### Task 1: Add async-trait dependency

**Files:**
- Modify: `Cargo.toml`

- [ ] **Step 1: Add async-trait to Cargo.toml**

Add under `[dependencies]`:

```toml
async-trait = "0.1"
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check`
Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add Cargo.toml Cargo.lock
git commit -m "deps: add async-trait for agent module"
```

---

### Task 2: Create agent module with core types and spawn helper

**Files:**
- Create: `src/agent/mod.rs`
- Modify: `src/main.rs:1` (add `mod agent;`)

- [ ] **Step 1: Write test for spawn_and_collect**

In `src/agent/mod.rs`, add a `#[cfg(test)]` module that tests the spawn helper with a known command (`echo`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_spawn_and_collect_success() {
        let mut cmd = tokio::process::Command::new("echo");
        cmd.arg("hello world");
        let output = spawn_and_collect(&mut cmd).await.unwrap();
        assert_eq!(output.text, "hello world");
        assert_eq!(output.exit_code, 0);
    }

    #[tokio::test]
    async fn test_spawn_and_collect_failure() {
        let mut cmd = tokio::process::Command::new("false");
        let output = spawn_and_collect(&mut cmd).await.unwrap();
        assert_eq!(output.exit_code, 1);
    }

    #[tokio::test]
    async fn test_spawn_and_collect_not_found() {
        let mut cmd = tokio::process::Command::new("nonexistent-binary-xyz");
        let result = spawn_and_collect(&mut cmd).await;
        assert!(result.is_err());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p vibe-usage agent::tests`
Expected: compilation error — `spawn_and_collect` does not exist yet

- [ ] **Step 3: Implement core types and spawn helper**

Write `src/agent/mod.rs`:

```rust
pub mod claude;
pub mod codex;
pub mod gemini;

use std::path::PathBuf;

use anyhow::{Result, bail};
use async_trait::async_trait;
use tokio::process::Command;

/// Unified configuration for invoking a coding agent.
pub struct RunConfig {
    pub prompt: String,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub allowed_tools: Option<Vec<String>>,
    pub cwd: Option<PathBuf>,
    pub extra_args: Vec<String>,
}

/// Result of a single agent invocation.
pub struct RunOutput {
    pub text: String,
    pub exit_code: i32,
}

/// Trait abstracting a coding agent CLI.
#[async_trait]
pub trait Agent: Send + Sync {
    /// Agent name, used for registry lookup.
    fn name(&self) -> &str;

    /// Whether the CLI binary is available on PATH.
    fn is_available(&self) -> bool;

    /// Invoke the agent with the given configuration.
    async fn run(&self, config: &RunConfig) -> Result<RunOutput>;
}

/// Spawn a command and collect its stdout and exit code.
async fn spawn_and_collect(cmd: &mut Command) -> Result<RunOutput> {
    let output = cmd.output().await?;
    Ok(RunOutput {
        text: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

/// Check if a binary exists on PATH.
fn binary_exists(name: &str) -> bool {
    which::which(name).is_ok()
}

// Tests at the bottom of the file (written in Step 1).
```

Note: `binary_exists` uses the `which` crate. We need to add it as a dependency. Add to `Cargo.toml`:

```toml
which = "7"
```

Also add `mod agent;` as the first line in `src/main.rs` (after existing `mod` declarations).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p vibe-usage agent::tests`
Expected: all 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/agent/mod.rs src/main.rs Cargo.toml Cargo.lock
git commit -m "feat(agent): add core types, Agent trait, and spawn helper"
```

---

### Task 3: Implement AgentRunner builder and registry

**Files:**
- Modify: `src/agent/mod.rs`

- [ ] **Step 1: Write tests for AgentRunner**

Append to the `tests` module in `src/agent/mod.rs`:

```rust
    #[test]
    fn test_create_agent_known() {
        assert!(create_agent("claude").is_ok());
        assert!(create_agent("codex").is_ok());
        assert!(create_agent("gemini").is_ok());
    }

    #[test]
    fn test_create_agent_unknown() {
        assert!(create_agent("unknown-agent").is_err());
    }

    #[test]
    fn test_runner_builds_config() {
        let mut runner = AgentRunner::new("claude");
        runner
            .model("opus")
            .system_prompt("test prompt")
            .cwd("/tmp")
            .extra_args(vec!["--verbose".into()]);

        let config = runner.build_config("hello");
        assert_eq!(config.prompt, "hello");
        assert_eq!(config.model.as_deref(), Some("opus"));
        assert_eq!(config.system_prompt.as_deref(), Some("test prompt"));
        assert_eq!(config.cwd, Some(PathBuf::from("/tmp")));
        assert_eq!(config.extra_args, vec!["--verbose".to_string()]);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p vibe-usage agent::tests`
Expected: compilation error — `AgentRunner`, `create_agent` do not exist

- [ ] **Step 3: Implement AgentRunner and registry**

Add to `src/agent/mod.rs` (after the existing code, before `#[cfg(test)]`):

```rust
/// Create an agent by name.
pub fn create_agent(name: &str) -> Result<Box<dyn Agent>> {
    match name {
        "claude" => Ok(Box::new(claude::ClaudeAgent)),
        "codex" => Ok(Box::new(codex::CodexAgent)),
        "gemini" => Ok(Box::new(gemini::GeminiAgent)),
        _ => bail!("unknown agent: {name}"),
    }
}

/// Builder for invoking a coding agent.
pub struct AgentRunner {
    agent_name: String,
    model: Option<String>,
    system_prompt: Option<String>,
    allowed_tools: Option<Vec<String>>,
    cwd: Option<PathBuf>,
    extra_args: Vec<String>,
}

impl AgentRunner {
    pub fn new(agent_name: &str) -> Self {
        Self {
            agent_name: agent_name.to_string(),
            model: None,
            system_prompt: None,
            allowed_tools: None,
            cwd: None,
            extra_args: Vec::new(),
        }
    }

    pub fn model(&mut self, model: &str) -> &mut Self {
        self.model = Some(model.to_string());
        self
    }

    pub fn system_prompt(&mut self, prompt: &str) -> &mut Self {
        self.system_prompt = Some(prompt.to_string());
        self
    }

    pub fn allowed_tools(&mut self, tools: Vec<String>) -> &mut Self {
        self.allowed_tools = Some(tools);
        self
    }

    pub fn cwd(&mut self, path: impl Into<PathBuf>) -> &mut Self {
        self.cwd = Some(path.into());
        self
    }

    pub fn extra_args(&mut self, args: Vec<String>) -> &mut Self {
        self.extra_args = args;
        self
    }

    /// Build a RunConfig from current builder state and the given prompt.
    pub fn build_config(&self, prompt: &str) -> RunConfig {
        RunConfig {
            prompt: prompt.to_string(),
            model: self.model.clone(),
            system_prompt: self.system_prompt.clone(),
            allowed_tools: self.allowed_tools.clone(),
            cwd: self.cwd.clone(),
            extra_args: self.extra_args.clone(),
        }
    }

    /// Resolve the agent, build config, and run.
    pub async fn run(&self, prompt: &str) -> Result<RunOutput> {
        let agent = create_agent(&self.agent_name)?;
        let config = self.build_config(prompt);
        agent.run(&config).await
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p vibe-usage agent::tests`
Expected: all 6 tests pass (3 from Task 2 + 3 new)

Note: `create_agent` tests require that `ClaudeAgent`, `CodexAgent`, `GeminiAgent` exist. They will be created as stubs in the next tasks. If running tests before Task 4-6, create minimal stubs first:

For `src/agent/claude.rs`, `src/agent/codex.rs`, `src/agent/gemini.rs` — create empty stub files that compile:

```rust
// src/agent/claude.rs
use anyhow::Result;
use async_trait::async_trait;
use super::{Agent, RunConfig, RunOutput};

pub struct ClaudeAgent;

#[async_trait]
impl Agent for ClaudeAgent {
    fn name(&self) -> &str { "claude" }
    fn is_available(&self) -> bool { super::binary_exists("claude") }
    async fn run(&self, _config: &RunConfig) -> Result<RunOutput> {
        anyhow::bail!("not implemented")
    }
}
```

```rust
// src/agent/codex.rs
use anyhow::Result;
use async_trait::async_trait;
use super::{Agent, RunConfig, RunOutput};

pub struct CodexAgent;

#[async_trait]
impl Agent for CodexAgent {
    fn name(&self) -> &str { "codex" }
    fn is_available(&self) -> bool { super::binary_exists("codex") }
    async fn run(&self, _config: &RunConfig) -> Result<RunOutput> {
        anyhow::bail!("not implemented")
    }
}
```

```rust
// src/agent/gemini.rs
use anyhow::Result;
use async_trait::async_trait;
use super::{Agent, RunConfig, RunOutput};

pub struct GeminiAgent;

#[async_trait]
impl Agent for GeminiAgent {
    fn name(&self) -> &str { "gemini" }
    fn is_available(&self) -> bool { super::binary_exists("gemini") }
    async fn run(&self, _config: &RunConfig) -> Result<RunOutput> {
        anyhow::bail!("not implemented")
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/agent/
git commit -m "feat(agent): add AgentRunner builder, registry, and agent stubs"
```

---

### Task 4: Implement ClaudeAgent

**Files:**
- Modify: `src/agent/claude.rs`

- [ ] **Step 1: Write test for Claude command building**

Replace the stub in `src/agent/claude.rs` with the full implementation including tests. Add a helper method `build_command` that returns a `Command` without executing it, so tests can inspect arguments:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_config(prompt: &str) -> RunConfig {
        RunConfig {
            prompt: prompt.to_string(),
            model: None,
            system_prompt: None,
            allowed_tools: None,
            cwd: None,
            extra_args: Vec::new(),
        }
    }

    #[test]
    fn test_build_command_minimal() {
        let agent = ClaudeAgent;
        let config = make_config("hello");
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"--output-format".to_string()));
        assert!(args.contains(&"text".to_string()));
        assert!(args.contains(&"hello".to_string()));
    }

    #[test]
    fn test_build_command_with_model() {
        let agent = ClaudeAgent;
        let mut config = make_config("hello");
        config.model = Some("opus".to_string());
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"opus".to_string()));
    }

    #[test]
    fn test_build_command_with_system_prompt() {
        let agent = ClaudeAgent;
        let mut config = make_config("hello");
        config.system_prompt = Some("you are helpful".to_string());
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--system-prompt".to_string()));
        assert!(args.contains(&"you are helpful".to_string()));
    }

    #[test]
    fn test_build_command_with_allowed_tools() {
        let agent = ClaudeAgent;
        let mut config = make_config("hello");
        config.allowed_tools = Some(vec!["Bash".to_string(), "Read".to_string()]);
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--allowedTools".to_string()));
        assert!(args.contains(&"Bash".to_string()));
        assert!(args.contains(&"Read".to_string()));
    }

    #[test]
    fn test_build_command_with_cwd() {
        let agent = ClaudeAgent;
        let mut config = make_config("hello");
        config.cwd = Some(PathBuf::from("/tmp/project"));
        let cmd = agent.build_command(&config);
        let dir = cmd.as_std().get_current_dir();
        assert_eq!(dir, Some(Path::new("/tmp/project")));
    }

    #[test]
    fn test_build_command_with_extra_args() {
        let agent = ClaudeAgent;
        let mut config = make_config("hello");
        config.extra_args = vec!["--max-budget-usd".to_string(), "1".to_string()];
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--max-budget-usd".to_string()));
        assert!(args.contains(&"1".to_string()));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p vibe-usage agent::claude::tests`
Expected: compilation error — `build_command` does not exist

- [ ] **Step 3: Implement ClaudeAgent**

Replace `src/agent/claude.rs`:

```rust
use std::path::Path;

use anyhow::Result;
use async_trait::async_trait;
use tokio::process::Command;

use super::{Agent, RunConfig, RunOutput, binary_exists, spawn_and_collect};

pub struct ClaudeAgent;

impl ClaudeAgent {
    /// Build the CLI command without executing it.
    pub fn build_command(&self, config: &RunConfig) -> Command {
        let mut cmd = Command::new("claude");
        cmd.arg("-p");
        cmd.args(["--output-format", "text"]);

        if let Some(ref model) = config.model {
            cmd.args(["--model", model]);
        }
        if let Some(ref system_prompt) = config.system_prompt {
            cmd.args(["--system-prompt", system_prompt]);
        }
        if let Some(ref tools) = config.allowed_tools {
            cmd.arg("--allowedTools");
            for tool in tools {
                cmd.arg(tool);
            }
        }
        for arg in &config.extra_args {
            cmd.arg(arg);
        }
        if let Some(ref cwd) = config.cwd {
            cmd.current_dir(cwd);
        }
        cmd.arg(&config.prompt);
        cmd
    }
}

#[async_trait]
impl Agent for ClaudeAgent {
    fn name(&self) -> &str {
        "claude"
    }

    fn is_available(&self) -> bool {
        binary_exists("claude")
    }

    async fn run(&self, config: &RunConfig) -> Result<RunOutput> {
        let mut cmd = self.build_command(config);
        spawn_and_collect(&mut cmd).await
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p vibe-usage agent::claude::tests`
Expected: all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/agent/claude.rs
git commit -m "feat(agent): implement ClaudeAgent CLI mapping"
```

---

### Task 5: Implement CodexAgent

**Files:**
- Modify: `src/agent/codex.rs`

- [ ] **Step 1: Write test for Codex command building**

Replace `src/agent/codex.rs` with full implementation including tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_config(prompt: &str) -> RunConfig {
        RunConfig {
            prompt: prompt.to_string(),
            model: None,
            system_prompt: None,
            allowed_tools: None,
            cwd: None,
            extra_args: Vec::new(),
        }
    }

    #[test]
    fn test_build_command_minimal() {
        let agent = CodexAgent;
        let config = make_config("hello");
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(cmd.as_std().get_program().to_string_lossy(), "codex");
        assert_eq!(args[0], "exec");
        assert!(args.contains(&"hello".to_string()));
    }

    #[test]
    fn test_build_command_with_model() {
        let agent = CodexAgent;
        let mut config = make_config("hello");
        config.model = Some("o3".to_string());
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"-m".to_string()));
        assert!(args.contains(&"o3".to_string()));
    }

    #[test]
    fn test_build_command_with_system_prompt_prepends() {
        let agent = CodexAgent;
        let mut config = make_config("do the thing");
        config.system_prompt = Some("you are helpful".to_string());
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        let prompt_arg = args.last().unwrap();
        assert!(prompt_arg.starts_with("you are helpful"));
        assert!(prompt_arg.contains("do the thing"));
    }

    #[test]
    fn test_build_command_with_cwd() {
        let agent = CodexAgent;
        let mut config = make_config("hello");
        config.cwd = Some(PathBuf::from("/tmp/project"));
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"-C".to_string()));
        assert!(args.contains(&"/tmp/project".to_string()));
    }

    #[test]
    fn test_build_command_with_extra_args() {
        let agent = CodexAgent;
        let mut config = make_config("hello");
        config.extra_args = vec!["--full-auto".to_string()];
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--full-auto".to_string()));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p vibe-usage agent::codex::tests`
Expected: compilation error — `build_command` does not exist

- [ ] **Step 3: Implement CodexAgent**

Replace `src/agent/codex.rs`:

```rust
use anyhow::Result;
use async_trait::async_trait;
use tokio::process::Command;

use super::{Agent, RunConfig, RunOutput, binary_exists, spawn_and_collect};

pub struct CodexAgent;

impl CodexAgent {
    /// Build the CLI command without executing it.
    pub fn build_command(&self, config: &RunConfig) -> Command {
        let mut cmd = Command::new("codex");
        cmd.arg("exec");

        if let Some(ref model) = config.model {
            cmd.args(["-m", model]);
        }
        if let Some(ref cwd) = config.cwd {
            cmd.args(["-C", &cwd.to_string_lossy()]);
        }
        for arg in &config.extra_args {
            cmd.arg(arg);
        }

        // Codex has no --system-prompt; prepend to prompt if set.
        let prompt = match config.system_prompt {
            Some(ref sp) => format!("{sp}\n\n{}", config.prompt),
            None => config.prompt.clone(),
        };
        cmd.arg(&prompt);
        cmd
    }
}

#[async_trait]
impl Agent for CodexAgent {
    fn name(&self) -> &str {
        "codex"
    }

    fn is_available(&self) -> bool {
        binary_exists("codex")
    }

    async fn run(&self, config: &RunConfig) -> Result<RunOutput> {
        let mut cmd = self.build_command(config);
        spawn_and_collect(&mut cmd).await
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p vibe-usage agent::codex::tests`
Expected: all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/agent/codex.rs
git commit -m "feat(agent): implement CodexAgent CLI mapping"
```

---

### Task 6: Implement GeminiAgent

**Files:**
- Modify: `src/agent/gemini.rs`

- [ ] **Step 1: Write test for Gemini command building**

Replace `src/agent/gemini.rs` with full implementation including tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_config(prompt: &str) -> RunConfig {
        RunConfig {
            prompt: prompt.to_string(),
            model: None,
            system_prompt: None,
            allowed_tools: None,
            cwd: None,
            extra_args: Vec::new(),
        }
    }

    #[test]
    fn test_build_command_minimal() {
        let agent = GeminiAgent;
        let config = make_config("hello");
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(cmd.as_std().get_program().to_string_lossy(), "gemini");
        assert!(args.contains(&"-p".to_string()));
        assert!(args.contains(&"hello".to_string()));
    }

    #[test]
    fn test_build_command_with_model() {
        let agent = GeminiAgent;
        let mut config = make_config("hello");
        config.model = Some("gemini-2.5-pro".to_string());
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"gemini-2.5-pro".to_string()));
    }

    #[test]
    fn test_build_command_with_system_prompt_prepends() {
        let agent = GeminiAgent;
        let mut config = make_config("do the thing");
        config.system_prompt = Some("you are helpful".to_string());
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        // -p flag should be followed by the combined prompt
        let p_idx = args.iter().position(|a| a == "-p").unwrap();
        let prompt_arg = &args[p_idx + 1];
        assert!(prompt_arg.starts_with("you are helpful"));
        assert!(prompt_arg.contains("do the thing"));
    }

    #[test]
    fn test_build_command_with_cwd() {
        let agent = GeminiAgent;
        let mut config = make_config("hello");
        config.cwd = Some(PathBuf::from("/tmp/project"));
        let cmd = agent.build_command(&config);
        let dir = cmd.as_std().get_current_dir();
        assert_eq!(dir, Some(std::path::Path::new("/tmp/project")));
    }

    #[test]
    fn test_build_command_with_allowed_tools() {
        let agent = GeminiAgent;
        let mut config = make_config("hello");
        config.allowed_tools = Some(vec!["shell".to_string(), "edit".to_string()]);
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--allowed-tools".to_string()));
        assert!(args.contains(&"shell".to_string()));
        assert!(args.contains(&"edit".to_string()));
    }

    #[test]
    fn test_build_command_with_extra_args() {
        let agent = GeminiAgent;
        let mut config = make_config("hello");
        config.extra_args = vec!["--yolo".to_string()];
        let cmd = agent.build_command(&config);
        let args: Vec<_> = cmd.as_std().get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args.contains(&"--yolo".to_string()));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p vibe-usage agent::gemini::tests`
Expected: compilation error — `build_command` does not exist

- [ ] **Step 3: Implement GeminiAgent**

Replace `src/agent/gemini.rs`:

```rust
use std::path::Path;

use anyhow::Result;
use async_trait::async_trait;
use tokio::process::Command;

use super::{Agent, RunConfig, RunOutput, binary_exists, spawn_and_collect};

pub struct GeminiAgent;

impl GeminiAgent {
    /// Build the CLI command without executing it.
    pub fn build_command(&self, config: &RunConfig) -> Command {
        let mut cmd = Command::new("gemini");

        if let Some(ref model) = config.model {
            cmd.args(["--model", model]);
        }
        if let Some(ref tools) = config.allowed_tools {
            cmd.arg("--allowed-tools");
            for tool in tools {
                cmd.arg(tool);
            }
        }
        for arg in &config.extra_args {
            cmd.arg(arg);
        }
        if let Some(ref cwd) = config.cwd {
            cmd.current_dir(cwd);
        }

        // Gemini has no --system-prompt; prepend to prompt if set.
        let prompt = match config.system_prompt {
            Some(ref sp) => format!("{sp}\n\n{}", config.prompt),
            None => config.prompt.clone(),
        };
        cmd.args(["-p", &prompt]);
        cmd
    }
}

#[async_trait]
impl Agent for GeminiAgent {
    fn name(&self) -> &str {
        "gemini"
    }

    fn is_available(&self) -> bool {
        binary_exists("gemini")
    }

    async fn run(&self, config: &RunConfig) -> Result<RunOutput> {
        let mut cmd = self.build_command(config);
        spawn_and_collect(&mut cmd).await
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p vibe-usage agent::gemini::tests`
Expected: all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/agent/gemini.rs
git commit -m "feat(agent): implement GeminiAgent CLI mapping"
```

---

### Task 7: Full integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cargo test`
Expected: all tests pass (3 spawn tests + 3 registry tests + 1 builder test + 6 claude + 5 codex + 6 gemini = 24 tests)

- [ ] **Step 2: Verify build with no warnings**

Run: `cargo check 2>&1`
Expected: no errors, no warnings

- [ ] **Step 3: Commit any final cleanup**

If any warnings needed fixing, commit them:

```bash
git add -A
git commit -m "chore(agent): cleanup warnings"
```
