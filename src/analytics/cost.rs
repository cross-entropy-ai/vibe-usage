use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::pricing::{self, PricingProvider};
use crate::schema::Session;

use super::round2;

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
}

// ── Public functions ───────────────────────────────────────────────

/// Full cost analysis.
pub fn cost_breakdown(sessions: &[Session], pricing: &dyn PricingProvider) -> CostBreakdown {
    // Per-model: all costs calculated at API rate
    let mut by_model_map: HashMap<String, (u64, u64, u64, u64, u64, String)> = HashMap::new();
    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown").to_string();
            let entry = by_model_map.entry(model).or_insert_with(|| (0, 0, 0, 0, 0, tool.clone()));
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
    for (model, (inp, out, think, cr, cw, tool)) in &by_model_map {
        let equiv = pricing.price_for(model)
            .map(|p| pricing::calculate_cost(&p, *inp, *out, *think, *cr, *cw))
            .unwrap_or(0.0);
        total_equiv += equiv;
        model_costs.push(ModelCost {
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
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing.price_for(model)
                    .map(|p| pricing::calculate_cost(
                        &p,
                        t.input.unwrap_or(0),
                        t.output.unwrap_or(0),
                        t.thinking.unwrap_or(0),
                        t.cache_read.unwrap_or(0),
                        t.cache_write.unwrap_or(0),
                    ))
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
        let day = s.start_time.format("%Y-%m-%d").to_string();
        tool_first.entry(tool.clone()).or_insert_with(|| day.clone());
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

    // Daily cost (at API rate)
    let mut daily_map: BTreeMap<String, f64> = BTreeMap::new();
    for s in sessions {
        let day = s.start_time.format("%Y-%m-%d").to_string();
        for m in &s.messages {
            let model = m.model.as_deref().or(s.model.as_deref()).unwrap_or("unknown");
            if let Some(t) = &m.tokens {
                let cost = pricing.price_for(model)
                    .map(|p| pricing::calculate_cost(
                        &p,
                        t.input.unwrap_or(0),
                        t.output.unwrap_or(0),
                        t.thinking.unwrap_or(0),
                        t.cache_read.unwrap_or(0),
                        t.cache_write.unwrap_or(0),
                    ))
                    .unwrap_or(0.0);
                *daily_map.entry(day.clone()).or_default() += cost;
            }
        }
    }
    let daily: Vec<DailyCost> = daily_map
        .into_iter()
        .map(|(date, cost)| DailyCost {
            date,
            equivalent_api_cost_usd: round2(cost),
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
