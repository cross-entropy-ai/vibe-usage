// src/litellm.rs
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

static RAW_JSON: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/model_prices.json"));

#[derive(Debug, Deserialize)]
struct RawEntry {
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    litellm_provider: Option<String>,
    #[serde(default)]
    input_cost_per_token: Option<f64>,
    #[serde(default)]
    output_cost_per_token: Option<f64>,
    #[serde(default)]
    cache_read_input_token_cost: Option<f64>,
    #[serde(default)]
    cache_creation_input_token_cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LitellmModel {
    pub name: String,
    pub provider: String,
    pub input_cost_per_token: f64,
    pub output_cost_per_token: f64,
    pub cache_read_input_token_cost: f64,
    pub cache_creation_input_token_cost: f64,
}

const DIRECT_PROVIDERS: &[&str] = &[
    "openai",
    "anthropic",
    "gemini",
    "deepseek",
    "mistral",
    "cohere",
    "fireworks_ai",
    "together_ai",
];

const ROUTING_PREFIXES: &[&str] = &[
    "azure/",
    "azure_ai/",
    "bedrock/",
    "bedrock_converse/",
    "vertex_ai/",
    "vertex_ai_beta/",
    "sagemaker/",
    "openrouter/",
];

fn strip_routing_prefix(name: &str) -> &str {
    for prefix in ROUTING_PREFIXES {
        if let Some(rest) = name.strip_prefix(prefix) {
            return rest;
        }
    }
    name
}

fn is_direct_provider(provider: &str) -> bool {
    DIRECT_PROVIDERS.iter().any(|p| *p == provider)
}

pub fn load_litellm_models() -> Vec<LitellmModel> {
    let raw: HashMap<String, RawEntry> = match serde_json::from_str(RAW_JSON) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut by_base_name: HashMap<String, LitellmModel> = HashMap::new();
    let mut is_direct: HashMap<String, bool> = HashMap::new();

    for (key, entry) in &raw {
        let mode = entry.mode.as_deref().unwrap_or("");
        if mode != "chat" {
            continue;
        }
        let input_cost = match entry.input_cost_per_token {
            Some(c) if c > 0.0 => c,
            _ => continue,
        };
        let output_cost = entry.output_cost_per_token.unwrap_or(0.0);
        let provider = entry.litellm_provider.as_deref().unwrap_or("unknown");
        let base_name = strip_routing_prefix(key).to_string();

        let model = LitellmModel {
            name: base_name.clone(),
            provider: provider.to_string(),
            input_cost_per_token: input_cost,
            output_cost_per_token: output_cost,
            cache_read_input_token_cost: entry.cache_read_input_token_cost.unwrap_or(0.0),
            cache_creation_input_token_cost: entry.cache_creation_input_token_cost.unwrap_or(0.0),
        };

        let direct = is_direct_provider(provider);

        match by_base_name.get(&base_name) {
            None => {
                by_base_name.insert(base_name.clone(), model);
                is_direct.insert(base_name, direct);
            }
            Some(_) => {
                let existing_direct = *is_direct.get(&base_name).unwrap_or(&false);
                if direct && !existing_direct {
                    by_base_name.insert(base_name.clone(), model);
                    is_direct.insert(base_name, true);
                }
            }
        }
    }

    let mut models: Vec<LitellmModel> = by_base_name.into_values().collect();
    models.sort_by(|a, b| a.name.cmp(&b.name));
    models
}
