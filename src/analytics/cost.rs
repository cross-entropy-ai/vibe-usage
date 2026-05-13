use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::pricing::{self, PricingProvider};
use crate::schema::Session;

use super::{local_date, round2};

// ── Result structs ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CostBreakdown {
    pub equivalent_api_cost_usd: f64,
    pub actual_cost_usd: f64,
    pub saved_usd: f64,
    pub by_model: Vec<ModelCost>,
    pub by_tool: HashMap<String, ToolCost>,
    pub daily: Vec<DailyCost>,
}

#[derive(Debug, Serialize)]
pub struct ModelCost {
    pub date: String,
    pub model: String,
    pub tool: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub equivalent_api_cost_usd: f64,
    pub is_subscription: bool,
}

#[derive(Debug, Serialize)]
pub struct ToolCost {
    pub equivalent_api_cost_usd: f64,
    pub actual_cost_usd: f64,
    pub saved_usd: f64,
    pub subscription: Option<SubscriptionInfo>,
}

#[derive(Debug, Serialize)]
pub struct SubscriptionInfo {
    pub plan: String,
    pub monthly_usd: f64,
    pub months: f64,
}

#[derive(Debug, Serialize)]
pub struct DailyCost {
    pub date: String,
    pub equivalent_api_cost_usd: f64,
    pub by_tool: HashMap<String, f64>,
}

// ── Public functions ───────────────────────────────────────────────

/// Full cost analysis.
pub fn cost_breakdown(sessions: &[Session], pricing: &dyn PricingProvider) -> CostBreakdown {
    // Per (date, model, tool): all costs calculated at API rate.
    // Include tool in the key so rows stay distinct when multiple tools share a model on one day.
    let mut by_model_map: HashMap<(String, String, String), (u64, u64, u64, u64, u64)> =
        HashMap::new();
    for s in sessions {
        let tool = s.tool.to_string();
        let day = local_date(&s.start_time);
        for m in &s.messages {
            let model = m
                .model
                .as_deref()
                .or(s.model.as_deref())
                .unwrap_or("unknown")
                .to_string();
            let entry = by_model_map
                .entry((day.clone(), model, tool.clone()))
                .or_insert_with(|| (0, 0, 0, 0, 0));
            if let Some(t) = &m.tokens {
                entry.0 += t.input.unwrap_or(0);
                entry.1 += t.output.unwrap_or(0);
                entry.2 += t.thinking.unwrap_or(0);
                entry.3 += t.cache_read.unwrap_or(0);
                entry.4 += t.cache_write.unwrap_or(0);
            }
        }
    }

    let mut total_equiv = 0.0f64;
    let mut model_costs: Vec<ModelCost> = Vec::new();
    for ((date, model, tool), (inp, out, think, cr, cw)) in &by_model_map {
        let equiv = pricing
            .price_for(model)
            .map(|p| pricing::calculate_cost(&p, *inp, *out, *think, *cr, *cw))
            .unwrap_or(0.0);
        total_equiv += equiv;
        model_costs.push(ModelCost {
            date: date.clone(),
            model: model.clone(),
            tool: tool.clone(),
            input_tokens: *inp,
            output_tokens: *out,
            thinking_tokens: *think,
            cache_read_tokens: *cr,
            cache_write_tokens: *cw,
            equivalent_api_cost_usd: round2(equiv),
            is_subscription: pricing.is_subscription(tool),
        });
    }
    model_costs.sort_by(|a, b| {
        b.equivalent_api_cost_usd
            .partial_cmp(&a.equivalent_api_cost_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Per-tool: equiv API cost + subscription info
    let mut tool_equiv: HashMap<String, f64> = HashMap::new();
    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m
                .model
                .as_deref()
                .or(s.model.as_deref())
                .unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing
                    .price_for(model)
                    .map(|p| {
                        pricing::calculate_cost(
                            &p,
                            t.input.unwrap_or(0),
                            t.output.unwrap_or(0),
                            t.thinking.unwrap_or(0),
                            t.cache_read.unwrap_or(0),
                            t.cache_write.unwrap_or(0),
                        )
                    })
                    .unwrap_or(0.0);
                *tool_equiv.entry(tool.clone()).or_default() += cost;
            }
        }
    }

    // Per-tool date ranges
    let mut tool_first: HashMap<String, String> = HashMap::new();
    let mut tool_last: HashMap<String, String> = HashMap::new();
    for s in sessions {
        let tool = s.tool.to_string();
        let day = local_date(&s.start_time);
        tool_first
            .entry(tool.clone())
            .or_insert_with(|| day.clone());
        tool_last.insert(tool.clone(), day);
        tool_equiv.entry(tool).or_insert(0.0);
    }

    let mut total_actual = 0.0f64;
    let mut total_saved = 0.0f64;
    let by_tool: HashMap<String, ToolCost> = tool_equiv
        .into_iter()
        .map(|(tool, equiv)| {
            let (actual, sub_info) = if let Some(sub) = pricing.subscription_for(&tool) {
                let first = tool_first.get(&tool).cloned().unwrap_or_default();
                let last = tool_last.get(&tool).cloned().unwrap_or_default();
                let months = pricing.subscription_months(&tool, &first, &last);
                let sub_cost = months * sub.monthly_usd;
                (
                    sub_cost,
                    Some(SubscriptionInfo {
                        plan: sub.plan.clone(),
                        monthly_usd: sub.monthly_usd,
                        months,
                    }),
                )
            } else {
                (equiv, None)
            };
            total_actual += actual;
            let saved = equiv - actual;
            if saved > 0.0 {
                total_saved += saved;
            }
            (
                tool,
                ToolCost {
                    equivalent_api_cost_usd: round2(equiv),
                    actual_cost_usd: round2(actual),
                    saved_usd: round2(saved),
                    subscription: sub_info,
                },
            )
        })
        .collect();

    // Daily cost (at API rate), broken down per tool
    let mut daily_map: BTreeMap<String, (f64, HashMap<String, f64>)> = BTreeMap::new();
    for s in sessions {
        let day = local_date(&s.start_time);
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m
                .model
                .as_deref()
                .or(s.model.as_deref())
                .unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing
                    .price_for(model)
                    .map(|p| {
                        pricing::calculate_cost(
                            &p,
                            t.input.unwrap_or(0),
                            t.output.unwrap_or(0),
                            t.thinking.unwrap_or(0),
                            t.cache_read.unwrap_or(0),
                            t.cache_write.unwrap_or(0),
                        )
                    })
                    .unwrap_or(0.0);
                let entry = daily_map.entry(day.clone()).or_default();
                entry.0 += cost;
                *entry.1.entry(tool.clone()).or_default() += cost;
            }
        }
    }
    let daily: Vec<DailyCost> = daily_map
        .into_iter()
        .map(|(date, (cost, by_tool))| DailyCost {
            date,
            equivalent_api_cost_usd: round2(cost),
            by_tool: by_tool
                .into_iter()
                .map(|(tool, c)| (tool, round2(c)))
                .collect(),
        })
        .collect();

    CostBreakdown {
        equivalent_api_cost_usd: round2(total_equiv),
        actual_cost_usd: round2(total_actual),
        saved_usd: round2(total_saved),
        by_model: model_costs,
        by_tool,
        daily,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::schema::{Message, Role, Session, TokenUsage, Tool};
    use chrono::{TimeZone, Utc};

    struct MockPricing;

    impl PricingProvider for MockPricing {
        fn price_for(&self, model: &str) -> Option<crate::pricing::ModelPrice> {
            if model == "shared-model" {
                Some(crate::pricing::ModelPrice {
                    input_cost_per_token: 1.0e-6,
                    output_cost_per_token: 2.0e-6,
                    cache_read_input_token_cost: 0.5e-6,
                    cache_creation_input_token_cost: 3.0e-6,
                })
            } else {
                None
            }
        }

        fn all_models(&self) -> Vec<crate::pricing::ProjectorModel> {
            vec![]
        }

        fn is_subscription(&self, _tool: &str) -> bool {
            false
        }

        fn subscription_for(&self, _tool: &str) -> Option<&crate::pricing::Subscription> {
            None
        }

        fn subscription_months(&self, _tool: &str, _first_date: &str, _last_date: &str) -> f64 {
            0.0
        }
    }

    fn message(model: Option<&str>, input: u64) -> Message {
        Message {
            role: Role::Assistant,
            content: String::new(),
            timestamp: Utc.with_ymd_and_hms(2026, 4, 15, 12, 0, 0).unwrap(),
            model: model.map(|m| m.to_string()),
            tokens: Some(TokenUsage {
                input: Some(input),
                output: Some(0),
                thinking: Some(0),
                cache_read: Some(0),
                cache_write: Some(0),
            }),
            duration_ms: None,
            tool_calls: vec![],
        }
    }

    fn session(id: &str, tool: Tool, input: u64) -> Session {
        Session {
            id: id.to_string(),
            tool,
            hostname: None,
            project: None,
            model: Some("shared-model".to_string()),
            start_time: Utc.with_ymd_and_hms(2026, 4, 15, 10, 0, 0).unwrap(),
            end_time: None,
            duration_ms: None,
            cwd: None,
            git: None,
            messages: vec![message(None, input)],
        }
    }

    #[test]
    fn by_model_rows_stay_separate_per_tool() {
        let sessions = vec![
            session("claude-1", Tool::Claude, 10),
            session("codex-1", Tool::Codex, 20),
        ];

        let breakdown = cost_breakdown(&sessions, &MockPricing);

        assert_eq!(breakdown.by_model.len(), 2);

        let mut rows = breakdown.by_model;
        rows.sort_by(|a, b| a.tool.cmp(&b.tool));

        assert_eq!(rows[0].tool, "claude");
        assert_eq!(rows[0].model, "shared-model");
        assert_eq!(rows[0].input_tokens, 10);
        assert_eq!(rows[1].tool, "codex");
        assert_eq!(rows[1].model, "shared-model");
        assert_eq!(rows[1].input_tokens, 20);
    }
}
