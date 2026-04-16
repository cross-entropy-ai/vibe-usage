use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::schema::Session;

use super::local_date;

// ── Result structs ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TokenTotals {
    pub input: u64,
    pub output: u64,
    pub thinking: u64,
    pub cache_read: u64,
    pub cache_write: u64,
}

#[derive(Debug, Serialize)]
pub struct TokenBreakdown {
    pub input: u64,
    pub output: u64,
    pub thinking: u64,
}

#[derive(Debug, Serialize)]
pub struct DailyTokensByTool {
    pub date: String,
    pub by_tool: HashMap<String, TokenBreakdown>,
}

#[derive(Debug, Serialize)]
pub struct ModelTokenStats {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub messages: usize,
}

#[derive(Debug, Serialize)]
pub struct ToolUsageCount {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ToolStatusStats {
    pub name: String,
    pub total: usize,
    pub success: usize,
    pub error: usize,
}

// ── Public functions ───────────────────────────────────────────────

/// Aggregate all token counts across sessions.
pub fn sum_tokens(sessions: &[Session]) -> TokenTotals {
    let mut inp = 0u64;
    let mut out = 0u64;
    let mut think = 0u64;
    let mut cr = 0u64;
    let mut cw = 0u64;
    for s in sessions {
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                inp += t.input.unwrap_or(0);
                out += t.output.unwrap_or(0);
                think += t.thinking.unwrap_or(0);
                cr += t.cache_read.unwrap_or(0);
                cw += t.cache_write.unwrap_or(0);
            }
        }
    }
    TokenTotals {
        input: inp,
        output: out,
        thinking: think,
        cache_read: cr,
        cache_write: cw,
    }
}

/// Per-day token breakdown by tool.
pub fn daily_tokens(sessions: &[Session]) -> Vec<DailyTokensByTool> {
    let mut daily: BTreeMap<String, HashMap<String, (u64, u64, u64)>> = BTreeMap::new();
    for s in sessions {
        let day = local_date(&s.start_time);
        let tool = s.tool.to_string();
        let entry = daily.entry(day).or_default().entry(tool).or_default();
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.0 += t.input.unwrap_or(0);
                entry.1 += t.output.unwrap_or(0);
                entry.2 += t.thinking.unwrap_or(0);
            }
        }
    }

    daily
        .into_iter()
        .map(|(date, tools)| {
            let by_tool: HashMap<String, TokenBreakdown> = tools
                .into_iter()
                .map(|(tool, (inp, out, think))| {
                    (
                        tool,
                        TokenBreakdown {
                            input: inp,
                            output: out,
                            thinking: think,
                        },
                    )
                })
                .collect();
            DailyTokensByTool { date, by_tool }
        })
        .collect()
}

/// Aggregate tokens per model.
pub fn tokens_by_model(sessions: &[Session]) -> Vec<ModelTokenStats> {
    let mut models: HashMap<String, (u64, u64, u64, usize)> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            let model = m
                .model
                .as_deref()
                .or(s.model.as_deref())
                .unwrap_or("unknown");
            let entry = models.entry(model.to_string()).or_default();
            if let Some(t) = &m.tokens {
                entry.0 += t.input.unwrap_or(0);
                entry.1 += t.output.unwrap_or(0);
                entry.2 += t.thinking.unwrap_or(0);
            }
            entry.3 += 1;
        }
    }

    let mut result: Vec<ModelTokenStats> = models
        .into_iter()
        .map(|(model, (inp, out, think, msgs))| ModelTokenStats {
            model,
            input_tokens: inp,
            output_tokens: out,
            thinking_tokens: think,
            messages: msgs,
        })
        .collect();
    result.sort_by(|a, b| {
        let total_b = b.input_tokens + b.output_tokens + b.thinking_tokens;
        let total_a = a.input_tokens + a.output_tokens + a.thinking_tokens;
        total_b.cmp(&total_a)
    });
    result
}

/// Tool call name frequency.
pub fn tools_usage(sessions: &[Session]) -> Vec<ToolUsageCount> {
    let mut tool_counts: HashMap<String, usize> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            for tc in &m.tool_calls {
                *tool_counts.entry(tc.name.clone()).or_default() += 1;
            }
        }
    }

    let mut result: Vec<ToolUsageCount> = tool_counts
        .into_iter()
        .map(|(name, count)| ToolUsageCount { name, count })
        .collect();
    result.sort_by(|a, b| b.count.cmp(&a.count));
    result
}

/// Tool call success/failure counts.
pub fn tools_status(sessions: &[Session]) -> Vec<ToolStatusStats> {
    let mut tool_map: HashMap<String, (usize, usize, usize)> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            for tc in &m.tool_calls {
                let entry = tool_map.entry(tc.name.clone()).or_default();
                entry.0 += 1;
                match tc.status.as_deref() {
                    Some(status) if is_explicit_success_status(status) => entry.1 += 1,
                    Some(status) if is_explicit_error_status(status) => entry.2 += 1,
                    _ => {}
                }
            }
        }
    }

    let mut result: Vec<ToolStatusStats> = tool_map
        .into_iter()
        .map(|(name, (total, success, error))| ToolStatusStats {
            name,
            total,
            success,
            error,
        })
        .collect();
    result.sort_by(|a, b| b.total.cmp(&a.total));
    result
}

fn is_explicit_success_status(status: &str) -> bool {
    matches!(status, "success")
}

fn is_explicit_error_status(status: &str) -> bool {
    matches!(status, "error")
}
