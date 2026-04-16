use std::collections::HashMap;

use serde::Serialize;

use crate::pricing::{self, PricingProvider};
use crate::schema::Session;

use super::{local_date, round2};

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    pub period: PeriodRange,
    pub by_model: Vec<ModelUsage>,
    pub totals: UsageTotals,
}

#[derive(Debug, Serialize)]
pub struct PeriodRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModelUsage {
    pub model: String,
    pub tool: String,
    pub sessions: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub actual_cost: f64,
    pub equivalent_api_cost: f64,
}

#[derive(Debug, Serialize)]
pub struct UsageTotals {
    pub with_cache: TokenBreakdown,
    pub without_cache: TokenBreakdownSimple,
}

#[derive(Debug, Serialize)]
pub struct TokenBreakdown {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
}

#[derive(Debug, Serialize)]
pub struct TokenBreakdownSimple {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

pub fn usage_summary(sessions: &[Session], pricing: &dyn PricingProvider) -> UsageSummary {
    struct Accum {
        sessions: std::collections::HashSet<String>,
        input: u64,
        output: u64,
        thinking: u64,
        cache_read: u64,
        cache_write: u64,
    }

    let mut by_model: HashMap<(String, String), Accum> = HashMap::new();

    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m
                .model
                .as_deref()
                .or(s.model.as_deref())
                .unwrap_or("unknown")
                .to_string();
            let acc = by_model
                .entry((model, tool.clone()))
                .or_insert_with(|| Accum {
                    sessions: std::collections::HashSet::new(),
                    input: 0,
                    output: 0,
                    thinking: 0,
                    cache_read: 0,
                    cache_write: 0,
                });
            acc.sessions.insert(s.id.clone());
            if let Some(t) = &m.tokens {
                acc.input += t.input.unwrap_or(0);
                acc.output += t.output.unwrap_or(0);
                acc.thinking += t.thinking.unwrap_or(0);
                acc.cache_read += t.cache_read.unwrap_or(0);
                acc.cache_write += t.cache_write.unwrap_or(0);
            }
        }
    }

    let mut models: Vec<ModelUsage> = Vec::new();
    let mut total_input = 0u64;
    let mut total_output = 0u64;
    let mut total_thinking = 0u64;
    let mut total_cache_read = 0u64;
    let mut total_cache_write = 0u64;

    for ((model, tool), acc) in by_model {
        let equiv = pricing
            .price_for(&model)
            .map(|p| {
                pricing::calculate_cost(
                    &p,
                    acc.input,
                    acc.output,
                    acc.thinking,
                    acc.cache_read,
                    acc.cache_write,
                )
            })
            .unwrap_or(0.0);

        let actual = if let Some(sub) = pricing.subscription_for(&tool) {
            sub.monthly_usd
        } else {
            equiv
        };

        total_input += acc.input;
        total_output += acc.output;
        total_thinking += acc.thinking;
        total_cache_read += acc.cache_read;
        total_cache_write += acc.cache_write;

        models.push(ModelUsage {
            model,
            tool,
            sessions: acc.sessions.len(),
            input_tokens: acc.input,
            output_tokens: acc.output,
            thinking_tokens: acc.thinking,
            cache_read_tokens: acc.cache_read,
            cache_write_tokens: acc.cache_write,
            actual_cost: round2(actual),
            equivalent_api_cost: round2(equiv),
        });
    }

    models.sort_by(|a, b| {
        b.equivalent_api_cost
            .partial_cmp(&a.equivalent_api_cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let dates: Vec<String> = sessions.iter().map(|s| local_date(&s.start_time)).collect();
    let from = dates.iter().min().cloned();
    let to = dates.iter().max().cloned();

    UsageSummary {
        period: PeriodRange { from, to },
        by_model: models,
        totals: UsageTotals {
            with_cache: TokenBreakdown {
                input_tokens: total_input,
                output_tokens: total_output,
                thinking_tokens: total_thinking,
                cache_read_tokens: total_cache_read,
                cache_write_tokens: total_cache_write,
            },
            without_cache: TokenBreakdownSimple {
                input_tokens: total_input + total_cache_read + total_cache_write,
                output_tokens: total_output + total_thinking,
            },
        },
    }
}
