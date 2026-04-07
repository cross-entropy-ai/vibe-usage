use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;

/// Pricing per 1M tokens (USD).
#[derive(Debug, Clone, Deserialize)]
pub struct ModelPrice {
    pub input: f64,
    pub output: f64,
    pub cached_input: f64,
    pub cache_write: f64,
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

        PricingConfig {
            subscriptions: subs,
            models,
        }
    }

    fn default_models() -> Vec<ConfigModelPrice> {
        vec![
            ConfigModelPrice {
                match_pattern: "gpt-5.4".to_string(),
                price: ModelPrice {
                    input: 2.50,
                    output: 15.00,
                    cached_input: 0.25,
                    cache_write: 2.50,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5.3-codex".to_string(),
                price: ModelPrice {
                    input: 1.75,
                    output: 14.00,
                    cached_input: 0.175,
                    cache_write: 1.75,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5.1-codex".to_string(),
                price: ModelPrice {
                    input: 1.25,
                    output: 10.00,
                    cached_input: 0.125,
                    cache_write: 1.25,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5-codex".to_string(),
                price: ModelPrice {
                    input: 1.25,
                    output: 10.00,
                    cached_input: 0.125,
                    cache_write: 1.25,
                },
            },
            ConfigModelPrice {
                match_pattern: "gpt-5".to_string(),
                price: ModelPrice {
                    input: 1.25,
                    output: 10.00,
                    cached_input: 0.125,
                    cache_write: 1.25,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-3.1-pro".to_string(),
                price: ModelPrice {
                    input: 2.00,
                    output: 12.00,
                    cached_input: 0.20,
                    cache_write: 2.00,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-3-pro".to_string(),
                price: ModelPrice {
                    input: 2.00,
                    output: 12.00,
                    cached_input: 0.20,
                    cache_write: 2.00,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-3-flash".to_string(),
                price: ModelPrice {
                    input: 0.50,
                    output: 3.00,
                    cached_input: 0.05,
                    cache_write: 0.50,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini-2.5-pro".to_string(),
                price: ModelPrice {
                    input: 1.25,
                    output: 10.00,
                    cached_input: 0.125,
                    cache_write: 1.25,
                },
            },
            ConfigModelPrice {
                match_pattern: "gemini".to_string(),
                price: ModelPrice {
                    input: 1.25,
                    output: 10.00,
                    cached_input: 0.125,
                    cache_write: 1.25,
                },
            },
            ConfigModelPrice {
                match_pattern: "opus".to_string(),
                price: ModelPrice {
                    input: 5.00,
                    output: 25.00,
                    cached_input: 0.50,
                    cache_write: 10.00,
                },
            },
            ConfigModelPrice {
                match_pattern: "sonnet".to_string(),
                price: ModelPrice {
                    input: 3.00,
                    output: 15.00,
                    cached_input: 0.30,
                    cache_write: 6.00,
                },
            },
            ConfigModelPrice {
                match_pattern: "haiku".to_string(),
                price: ModelPrice {
                    input: 1.00,
                    output: 5.00,
                    cached_input: 0.10,
                    cache_write: 2.00,
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
        for config_model in &self.models {
            if m.contains(&config_model.match_pattern) || m.starts_with(&config_model.match_pattern)
            {
                return Some(config_model.price.clone());
            }
        }
        None
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
    let m = 1_000_000.0;
    (input as f64 / m) * price.input
        + ((output + thinking) as f64 / m) * price.output
        + (cache_read as f64 / m) * price.cached_input
        + (cache_write as f64 / m) * price.cache_write
}
