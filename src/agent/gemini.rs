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
