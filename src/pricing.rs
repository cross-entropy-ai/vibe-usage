use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// A model entry exposed to the projector endpoint.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectorModel {
    pub name: String,
    pub provider: String,
    pub input_cost_per_token: f64,
    pub output_cost_per_token: f64,
    pub cache_read_input_token_cost: f64,
    pub cache_creation_input_token_cost: f64,
}

/// Per-token pricing (USD), aligned with LiteLLM field names.
#[derive(Debug, Clone, Deserialize)]
pub struct ModelPrice {
    pub input_cost_per_token: f64,
    pub output_cost_per_token: f64,
    pub cache_read_input_token_cost: f64,
    pub cache_creation_input_token_cost: f64,
}

/// A subscription-based tool (flat monthly rate, no per-token cost).
#[derive(Debug, Clone, Deserialize)]
pub struct Subscription {
    pub tool: String,
    pub plan: String,
    pub monthly_usd: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConfigModelPrice {
    pub match_pattern: String,
    pub price: ModelPrice,
}

pub trait PricingProvider: Send + Sync {
    fn price_for(&self, model: &str) -> Option<ModelPrice>;
    fn all_models(&self) -> Vec<ProjectorModel>;
    fn is_subscription(&self, tool: &str) -> bool;
    fn subscription_for(&self, tool: &str) -> Option<&Subscription>;
    fn subscription_months(&self, tool: &str, first_date: &str, last_date: &str) -> f64;
}

/// Loaded pricing config: which tools are subscription-based, and model prices.
#[derive(Clone)]
pub struct PricingConfig {
    /// tool name -> Subscription
    pub subscriptions: HashMap<String, Subscription>,
    pub models: Vec<ConfigModelPrice>,
    pub litellm_models: Vec<crate::litellm::LitellmModel>,
}

impl PricingConfig {
    pub fn load(data_dir: &Path) -> Self {
        let path = data_dir.join("config.toml");

        let mut subs = HashMap::new();
        let mut custom_models = Vec::new();

        if let Ok(text) = std::fs::read_to_string(&path) {
            #[derive(Deserialize)]
            struct RawConfig {
                #[serde(default)]
                subscriptions: Vec<Subscription>,
                #[serde(default)]
                models: Vec<ConfigModelPrice>,
            }
            if let Ok(c) = toml::from_str::<RawConfig>(&text) {
                subs = c
                    .subscriptions
                    .into_iter()
                    .map(|s| (s.tool.clone(), s))
                    .collect();
                custom_models = c.models;
            }
        }

        let mut models = Self::default_models();
        models.extend(custom_models);

        let litellm_models = crate::litellm::load_litellm_models();

        PricingConfig {
            subscriptions: subs,
            models,
            litellm_models,
        }
    }

    fn default_models() -> Vec<ConfigModelPrice> {
        vec![
            ConfigModelPrice {
                match_pattern: "gpt-5.4".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 2.50e-6,
                    output_cost_per_token: 15.00e-6,
                    cache_read_input_token_cost: 0.25e-6,
                    cache_creation_input_token_cost: 2.50e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5.3-codex".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 1.75e-6,
                    output_cost_per_token: 14.00e-6,
                    cache_read_input_token_cost: 0.175e-6,
                    cache_creation_input_token_cost: 1.75e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5.1-codex".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 1.25e-6,
                    output_cost_per_token: 10.00e-6,
                    cache_read_input_token_cost: 0.125e-6,
                    cache_creation_input_token_cost: 1.25e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5-codex".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 1.25e-6,
                    output_cost_per_token: 10.00e-6,
                    cache_read_input_token_cost: 0.125e-6,
                    cache_creation_input_token_cost: 1.25e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 1.25e-6,
                    output_cost_per_token: 10.00e-6,
                    cache_read_input_token_cost: 0.125e-6,
                    cache_creation_input_token_cost: 1.25e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-3.1-pro".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 2.00e-6,
                    output_cost_per_token: 12.00e-6,
                    cache_read_input_token_cost: 0.20e-6,
                    cache_creation_input_token_cost: 2.00e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-3-pro".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 2.00e-6,
                    output_cost_per_token: 12.00e-6,
                    cache_read_input_token_cost: 0.20e-6,
                    cache_creation_input_token_cost: 2.00e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-3-flash".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 0.50e-6,
                    output_cost_per_token: 3.00e-6,
                    cache_read_input_token_cost: 0.05e-6,
                    cache_creation_input_token_cost: 0.50e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-2.5-pro".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 1.25e-6,
                    output_cost_per_token: 10.00e-6,
                    cache_read_input_token_cost: 0.125e-6,
                    cache_creation_input_token_cost: 1.25e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 1.25e-6,
                    output_cost_per_token: 10.00e-6,
                    cache_read_input_token_cost: 0.125e-6,
                    cache_creation_input_token_cost: 1.25e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "opus".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 5.00e-6,
                    output_cost_per_token: 25.00e-6,
                    cache_read_input_token_cost: 0.50e-6,
                    cache_creation_input_token_cost: 10.00e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "sonnet".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 3.00e-6,
                    output_cost_per_token: 15.00e-6,
                    cache_read_input_token_cost: 0.30e-6,
                    cache_creation_input_token_cost: 6.00e-6,
                },
            },
            ConfigModelPrice {
                match_pattern: "haiku".to_string(),
                price: ModelPrice {
                    input_cost_per_token: 1.00e-6,
                    output_cost_per_token: 5.00e-6,
                    cache_read_input_token_cost: 0.10e-6,
                    cache_creation_input_token_cost: 2.00e-6,
                },
            },
        ]
    }
}

impl PricingProvider for PricingConfig {
    fn is_subscription(&self, tool: &str) -> bool {
        self.subscriptions.contains_key(tool)
    }

    fn subscription_for(&self, tool: &str) -> Option<&Subscription> {
        self.subscriptions.get(tool)
    }

    fn subscription_months(&self, tool: &str, first_date: &str, last_date: &str) -> f64 {
        if !self.is_subscription(tool) {
            return 0.0;
        }
        let start = parse_ym(first_date);
        let end = parse_ym(last_date);
        if let (Some((sy, sm)), Some((ey, em))) = (start, end) {
            let months = (ey as i32 - sy as i32) * 12 + (em as i32 - sm as i32) + 1;
            months.max(1) as f64
        } else {
            1.0
        }
    }

    fn price_for(&self, model: &str) -> Option<ModelPrice> {
        let m = model.to_lowercase();
        // 1. Check user config + built-in patterns
        for config_model in &self.models {
            if m.contains(&config_model.match_pattern) || m.starts_with(&config_model.match_pattern)
            {
                return Some(config_model.price.clone());
            }
        }
        // 2. Fall back to LiteLLM data
        for lm in &self.litellm_models {
            if m.contains(&lm.name) || lm.name.contains(&m) {
                return Some(ModelPrice {
                    input_cost_per_token: lm.input_cost_per_token,
                    output_cost_per_token: lm.output_cost_per_token,
                    cache_read_input_token_cost: lm.cache_read_input_token_cost,
                    cache_creation_input_token_cost: lm.cache_creation_input_token_cost,
                });
            }
        }
        None
    }

    fn all_models(&self) -> Vec<ProjectorModel> {
        let mut result: Vec<ProjectorModel> = self
            .litellm_models
            .iter()
            .map(|lm| ProjectorModel {
                name: lm.name.clone(),
                provider: lm.provider.clone(),
                input_cost_per_token: lm.input_cost_per_token,
                output_cost_per_token: lm.output_cost_per_token,
                cache_read_input_token_cost: lm.cache_read_input_token_cost,
                cache_creation_input_token_cost: lm.cache_creation_input_token_cost,
            })
            .collect();

        // Apply config overrides
        for cm in &self.models {
            if let Some(existing) = result.iter_mut().find(|m| m.name.contains(&cm.match_pattern)) {
                existing.input_cost_per_token = cm.price.input_cost_per_token;
                existing.output_cost_per_token = cm.price.output_cost_per_token;
                existing.cache_read_input_token_cost = cm.price.cache_read_input_token_cost;
                existing.cache_creation_input_token_cost =
                    cm.price.cache_creation_input_token_cost;
            }
        }

        result
    }
}

fn parse_ym(date: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() >= 2 {
        let y = parts[0].parse().ok()?;
        let m = parts[1].parse().ok()?;
        Some((y, m))
    } else {
        None
    }
}

/// Calculate cost in USD given token counts and a price table.
/// Thinking tokens are billed at the output rate (all providers).
pub fn calculate_cost(
    price: &ModelPrice,
    input: u64,
    output: u64,
    thinking: u64,
    cache_read: u64,
    cache_write: u64,
) -> f64 {
    input as f64 * price.input_cost_per_token
        + (output + thinking) as f64 * price.output_cost_per_token
        + cache_read as f64 * price.cache_read_input_token_cost
        + cache_write as f64 * price.cache_creation_input_token_cost
}
