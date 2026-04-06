use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;

/// Pricing per 1M tokens (USD).
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

/// Loaded pricing config: which tools are subscription-based.
pub struct PricingConfig {
    /// tool name -> Subscription
    pub subscriptions: HashMap<String, Subscription>,
}

impl PricingConfig {
    pub fn load(data_dir: &Path) -> Self {
        let path = data_dir.join("config.toml");
        let subs = if let Ok(text) = std::fs::read_to_string(&path) {
            #[derive(Deserialize)]
            struct RawConfig {
                #[serde(default)]
                subscriptions: Vec<Subscription>,
            }
            match toml::from_str::<RawConfig>(&text) {
                Ok(c) => c
                    .subscriptions
                    .into_iter()
                    .map(|s| (s.tool.clone(), s))
                    .collect(),
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };
        PricingConfig {
            subscriptions: subs,
        }
    }

    /// Returns true if this tool is subscription-based (no per-token cost).
    pub fn is_subscription(&self, tool: &str) -> bool {
        self.subscriptions.contains_key(tool)
    }

    /// Calculate monthly subscription months between two dates.
    pub fn subscription_months(&self, tool: &str, first_date: &str, last_date: &str) -> f64 {
        if !self.is_subscription(tool) {
            return 0.0;
        }
        // Parse YYYY-MM-DD, count distinct months
        let start = parse_ym(first_date);
        let end = parse_ym(last_date);
        if let (Some((sy, sm)), Some((ey, em))) = (start, end) {
            let months = (ey as i32 - sy as i32) * 12 + (em as i32 - sm as i32) + 1;
            months.max(1) as f64
        } else {
            1.0
        }
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

/// Look up API pricing for a model name. Returns None for unknown models.
pub fn price_for(model: &str) -> Option<ModelPrice> {
    let m = model.to_lowercase();

    // ── OpenAI ──────────────────────────────────────────────────
    if m.starts_with("gpt-5.4") {
        return Some(ModelPrice {
            input: 2.50,
            output: 15.00,
            cached_input: 0.25,
            cache_write: 2.50,
        });
    }
    if m.starts_with("gpt-5.3-codex") {
        return Some(ModelPrice {
            input: 1.75,
            output: 14.00,
            cached_input: 0.175,
            cache_write: 1.75,
        });
    }
    if m.starts_with("gpt-5.1-codex") {
        return Some(ModelPrice {
            input: 1.25,
            output: 10.00,
            cached_input: 0.125,
            cache_write: 1.25,
        });
    }
    if m.starts_with("gpt-5-codex") {
        return Some(ModelPrice {
            input: 1.25,
            output: 10.00,
            cached_input: 0.125,
            cache_write: 1.25,
        });
    }
    if m.starts_with("gpt-5") {
        return Some(ModelPrice {
            input: 1.25,
            output: 10.00,
            cached_input: 0.125,
            cache_write: 1.25,
        });
    }

    // ── Google Gemini (<=200K context pricing) ──────────────────
    if m.contains("gemini-3.1-pro") || m.contains("gemini-3-pro") {
        return Some(ModelPrice {
            input: 2.00,
            output: 12.00,
            cached_input: 0.20,
            cache_write: 2.00,
        });
    }
    if m.contains("gemini-3") && m.contains("flash") {
        return Some(ModelPrice {
            input: 0.50,
            output: 3.00,
            cached_input: 0.05,
            cache_write: 0.50,
        });
    }
    if m.contains("gemini-2.5-pro") {
        return Some(ModelPrice {
            input: 1.25,
            output: 10.00,
            cached_input: 0.125,
            cache_write: 1.25,
        });
    }
    if m.contains("gemini") {
        return Some(ModelPrice {
            input: 1.25,
            output: 10.00,
            cached_input: 0.125,
            cache_write: 1.25,
        });
    }

    // ── Anthropic Claude ────────────────────────────────────────
    if m.contains("opus") {
        return Some(ModelPrice {
            input: 5.00,
            output: 25.00,
            cached_input: 0.50,
            cache_write: 10.00,
        });
    }
    if m.contains("sonnet") {
        return Some(ModelPrice {
            input: 3.00,
            output: 15.00,
            cached_input: 0.30,
            cache_write: 6.00,
        });
    }
    if m.contains("haiku") {
        return Some(ModelPrice {
            input: 1.00,
            output: 5.00,
            cached_input: 0.10,
            cache_write: 2.00,
        });
    }

    None
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
