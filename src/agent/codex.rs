use anyhow::Result;
use async_trait::async_trait;
use tokio::process::Command;

use super::{Agent, RunConfig, RunOutput};

pub struct CodexAgent;

impl CodexAgent {
    pub fn build_command(&self, config: &RunConfig) -> Command {
        let mut cmd = Command::new("codex");
        cmd.arg("exec");

        if let Some(ref model) = config.model {
            cmd.arg("-m").arg(model);
        }

        if let Some(ref cwd) = config.cwd {
            cmd.arg("-C").arg(cwd);
        }

        for arg in &config.extra_args {
            cmd.arg(arg);
        }

        // Codex has no --system-prompt flag; prepend to prompt instead.
        let prompt = match config.system_prompt {
            Some(ref sp) => format!("{sp}\n\n{}", config.prompt),
            None => config.prompt.clone(),
        };
        cmd.arg(prompt);

        cmd
    }
}

#[async_trait]
impl Agent for CodexAgent {
    fn name(&self) -> &str {
        "codex"
    }

    fn is_available(&self) -> bool {
        super::binary_exists("codex")
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
