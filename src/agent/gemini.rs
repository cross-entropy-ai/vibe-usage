use anyhow::Result;
use async_trait::async_trait;
use tokio::process::Command;

use super::{Agent, RunConfig, RunOutput};

pub struct GeminiAgent;

impl GeminiAgent {
    pub fn build_command(&self, config: &RunConfig) -> Command {
        let mut cmd = Command::new("gemini");

        if let Some(ref model) = config.model {
            cmd.arg("--model").arg(model);
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

        // Gemini has no --system-prompt flag; prepend to prompt instead.
        let prompt = match config.system_prompt {
            Some(ref sp) => format!("{}\n\n{}", sp, config.prompt),
            None => config.prompt.clone(),
        };

        cmd.arg("-p").arg(&prompt);

        if let Some(ref cwd) = config.cwd {
            cmd.current_dir(cwd);
        }

        cmd
    }
}

#[async_trait]
impl Agent for GeminiAgent {
    fn name(&self) -> &str {
        "gemini"
    }

    fn is_available(&self) -> bool {
        super::binary_exists("gemini")
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
