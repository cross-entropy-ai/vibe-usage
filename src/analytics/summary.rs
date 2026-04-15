use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::schema::{Role, Session};

use super::local_date;
use super::tokens::{TokenTotals, sum_tokens};

// ── Result structs ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SummaryStats {
    pub total_sessions: usize,
    pub by_tool: HashMap<String, usize>,
    pub messages: MessageCounts,
    pub tokens: TokenTotals,
    pub daily: Vec<DailyStats>,
    pub top_projects: Vec<NameCount>,
    pub period: PeriodRange,
}

#[derive(Debug, Serialize)]
pub struct MessageCounts {
    pub total: usize,
    pub user: usize,
    pub assistant: usize,
}

#[derive(Debug, Serialize)]
pub struct PeriodRange {
    pub start: Option<String>,
    pub end: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DailyStats {
    pub date: String,
    pub sessions: u64,
    pub messages: u64,
    pub user_messages: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Serialize)]
pub struct NameCount {
    pub name: String,
    pub sessions: usize,
}

// ── Public functions ───────────────────────────────────────────────

/// Full summary: by_tool, messages, tokens, daily, top_projects, period.
pub fn summary(sessions: &[Session]) -> SummaryStats {
    let total = sessions.len();

    let mut tool_counts: HashMap<String, usize> = HashMap::new();
    for s in sessions {
        *tool_counts.entry(s.tool.to_string()).or_default() += 1;
    }

    let total_msgs: usize = sessions.iter().map(|s| s.messages.len()).sum();
    let user_msgs: usize = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::User)
        .count();
    let assistant_msgs: usize = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::Assistant)
        .count();

    let tokens = sum_tokens(sessions);

    // Daily stats
    let mut daily_map: BTreeMap<String, DailyStats> = BTreeMap::new();
    for s in sessions {
        let day = local_date(&s.start_time);
        let entry = daily_map.entry(day.clone()).or_insert_with(|| DailyStats {
            date: day,
            sessions: 0,
            messages: 0,
            user_messages: 0,
            input_tokens: 0,
            output_tokens: 0,
        });
        entry.sessions += 1;
        entry.messages += s.messages.len() as u64;
        entry.user_messages += s.messages.iter().filter(|m| m.role == Role::User).count() as u64;
        let inp: u64 = s
            .messages
            .iter()
            .filter_map(|m| m.tokens.as_ref())
            .filter_map(|t| t.input)
            .sum();
        let out: u64 = s
            .messages
            .iter()
            .filter_map(|m| m.tokens.as_ref())
            .filter_map(|t| t.output)
            .sum();
        entry.input_tokens += inp;
        entry.output_tokens += out;
    }
    let daily: Vec<DailyStats> = daily_map.into_values().collect();

    // Top projects
    let mut projects: HashMap<String, usize> = HashMap::new();
    for s in sessions {
        let key = format!(
            "[{}] {}",
            s.tool,
            s.project.as_deref().unwrap_or("(unknown)")
        );
        *projects.entry(key).or_default() += 1;
    }
    let mut projects: Vec<_> = projects.into_iter().collect();
    projects.sort_by(|a, b| b.1.cmp(&a.1));
    let top_projects: Vec<NameCount> = projects
        .into_iter()
        .take(20)
        .map(|(name, sessions)| NameCount { name, sessions })
        .collect();

    let period = PeriodRange {
        start: sessions
            .first()
            .map(|s| local_date(&s.start_time)),
        end: sessions
            .last()
            .map(|s| local_date(&s.start_time)),
    };

    SummaryStats {
        total_sessions: total,
        by_tool: tool_counts,
        messages: MessageCounts {
            total: total_msgs,
            user: user_msgs,
            assistant: assistant_msgs,
        },
        tokens,
        daily,
        top_projects,
        period,
    }
}
