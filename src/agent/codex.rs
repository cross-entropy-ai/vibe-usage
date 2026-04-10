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
