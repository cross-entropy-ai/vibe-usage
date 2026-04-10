use anyhow::Result;
use async_trait::async_trait;
use tokio::process::Command;

use super::{Agent, RunConfig, RunOutput};

pub struct ClaudeAgent;

impl ClaudeAgent {
    pub fn build_command(&self, config: &RunConfig) -> Command {
        let mut cmd = Command::new("claude");
        cmd.arg("-p");
        cmd.arg("--output-format").arg("text");

        if let Some(ref model) = config.model {
            cmd.arg("--model").arg(model);
        }

        if let Some(ref system_prompt) = config.system_prompt {
            cmd.arg("--system-prompt").arg(system_prompt);
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

        cmd.arg(&config.prompt);

        if let Some(ref cwd) = config.cwd {
            cmd.current_dir(cwd);
        }

        cmd
    }
}

#[async_trait]
impl Agent for ClaudeAgent {
    fn name(&self) -> &str {
        "claude"
    }

    fn is_available(&self) -> bool {
        super::binary_exists("claude")
    }

    async fn run(&self, config: &RunConfig) -> Result<RunOutput> {
        let mut cmd = self.build_command(config);
        super::spawn_and_collect(&mut cmd).await
    }
}

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
        assert_eq!(dir, Some(std::path::Path::new("/tmp/project")));
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
