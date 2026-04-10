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
    fn name(&self) -> &str;
    fn is_available(&self) -> bool;
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

    pub async fn run(&self, prompt: &str) -> Result<RunOutput> {
        let agent = create_agent(&self.agent_name)?;
        let config = self.build_config(prompt);
        agent.run(&config).await
    }
}

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
}
