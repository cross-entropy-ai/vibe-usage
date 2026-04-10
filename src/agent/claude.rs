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
