use std::collections::{BTreeMap, HashMap};

use chrono::{Datelike, Local, Timelike};
use serde::Serialize;

use crate::schema::{Role, Session};

use super::{BucketCount, local_date, percentile_u64};

// ── Result structs ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DurationStats {
    pub daily: Vec<DailyDuration>,
    pub by_project: Vec<ProjectDuration>,
}

#[derive(Debug, Serialize)]
pub struct DailyDuration {
    pub date: String,
    pub duration_ms: u64,
    pub duration_min: f64,
}

#[derive(Debug, Serialize)]
pub struct ProjectDuration {
    pub project: String,
    pub duration_ms: u64,
    pub duration_min: f64,
}

#[derive(Debug, Serialize)]
pub struct HeatmapCell {
    pub day: &'static str,
    pub day_index: usize,
    pub hour: usize,
    pub count: u64,
}

#[derive(Debug, Serialize)]
pub struct LatencyStats {
    pub overall: PercentileStats,
    pub by_model: Vec<ModelLatency>,
    pub histogram: Vec<BucketCount>,
}

#[derive(Debug, Serialize)]
pub struct PercentileStats {
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub avg: f64,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ModelLatency {
    pub model: String,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub avg: f64,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct HourlyComplexity {
    pub hour: usize,
    pub sessions: usize,
    pub total_messages: usize,
    pub avg_messages_per_session: f64,
    pub avg_tokens_per_session: u64,
}

// ── Public functions ───────────────────────────────────────────────

/// Per-day and per-project duration aggregation.
pub fn duration(sessions: &[Session]) -> DurationStats {
    let mut daily: BTreeMap<String, u64> = BTreeMap::new();
    let mut by_project: HashMap<String, u64> = HashMap::new();

    for s in sessions {
        let dur = s.duration_ms.unwrap_or(0);
        if dur == 0 {
            continue;
        }
        let day = local_date(&s.start_time);
        *daily.entry(day).or_default() += dur;
        let proj = s.project.as_deref().unwrap_or("(unknown)").to_string();
        *by_project.entry(proj).or_default() += dur;
    }

    let daily_result: Vec<DailyDuration> = daily
        .into_iter()
        .map(|(date, ms)| DailyDuration {
            date,
            duration_ms: ms,
            duration_min: ms as f64 / 60000.0,
        })
        .collect();

    let mut project_result: Vec<ProjectDuration> = by_project
        .into_iter()
        .map(|(project, ms)| ProjectDuration {
            project,
            duration_ms: ms,
            duration_min: ms as f64 / 60000.0,
        })
        .collect();
    project_result.sort_by(|a, b| b.duration_ms.cmp(&a.duration_ms));

    DurationStats {
        daily: daily_result,
        by_project: project_result,
    }
}

/// Hour x weekday session count.
pub fn activity_heatmap(sessions: &[Session]) -> Vec<HeatmapCell> {
    let mut grid = [[0u64; 24]; 7];

    for s in sessions {
        let local = s.start_time.with_timezone(&Local);
        let weekday = local.weekday().num_days_from_monday() as usize;
        let hour = local.hour() as usize;
        grid[weekday][hour] += 1;
    }

    let days: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let mut result: Vec<HeatmapCell> = Vec::new();
    for (d, day_name) in days.iter().enumerate() {
        for h in 0..24 {
            if grid[d][h] > 0 {
                result.push(HeatmapCell {
                    day: day_name,
                    day_index: d,
                    hour: h,
                    count: grid[d][h],
                });
            }
        }
    }
    result
}

/// Percentile latency stats for assistant messages.
pub fn messages_latency(sessions: &[Session]) -> LatencyStats {
    let mut all_durations: Vec<u64> = Vec::new();
    let mut by_model: HashMap<String, Vec<u64>> = HashMap::new();

    for s in sessions {
        for m in &s.messages {
            if m.role != Role::Assistant {
                continue;
            }
            if let Some(dur) = m.duration_ms {
                all_durations.push(dur);
                let model = m
                    .model
                    .as_deref()
                    .or(s.model.as_deref())
                    .unwrap_or("unknown")
                    .to_string();
                by_model.entry(model).or_default().push(dur);
            }
        }
    }

    fn compute_percentile_stats(durations: &mut Vec<u64>) -> PercentileStats {
        durations.sort();
        let count = durations.len();
        let avg_val = if count > 0 {
            durations.iter().sum::<u64>() as f64 / count as f64
        } else {
            0.0
        };
        PercentileStats {
            p50: percentile_u64(durations, 50.0),
            p95: percentile_u64(durations, 95.0),
            p99: percentile_u64(durations, 99.0),
            avg: (avg_val * 100.0).round() / 100.0,
            count,
        }
    }

    let overall = compute_percentile_stats(&mut all_durations);

    let mut model_stats: Vec<ModelLatency> = by_model
        .into_iter()
        .map(|(model, mut durs)| {
            let stats = compute_percentile_stats(&mut durs);
            ModelLatency {
                model,
                p50: stats.p50,
                p95: stats.p95,
                p99: stats.p99,
                avg: stats.avg,
                count: stats.count,
            }
        })
        .collect();
    model_stats.sort_by(|a, b| b.count.cmp(&a.count));

    // Histogram buckets (in ms)
    let buckets: &[(&str, u64, u64)] = &[
        ("0-1s", 0, 1000),
        ("1-3s", 1000, 3000),
        ("3-5s", 3000, 5000),
        ("5-10s", 5000, 10000),
        ("10-30s", 10000, 30000),
        ("30s+", 30000, u64::MAX),
    ];
    let histogram: Vec<BucketCount> = buckets
        .iter()
        .map(|(label, lo, hi)| {
            let count = all_durations
                .iter()
                .filter(|d| **d >= *lo && **d < *hi)
                .count();
            BucketCount {
                bucket: label,
                count,
            }
        })
        .collect();

    LatencyStats {
        overall,
        by_model: model_stats,
        histogram,
    }
}

/// Session complexity by hour of day.
pub fn session_complexity(sessions: &[Session]) -> Vec<HourlyComplexity> {
    let mut by_hour: [(usize, usize, u64); 24] = [(0, 0, 0); 24];
    for s in sessions {
        let hour = s.start_time.with_timezone(&chrono::Local).hour() as usize;
        by_hour[hour].0 += 1;
        by_hour[hour].1 += s.messages.len();
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                by_hour[hour].2 += t.input.unwrap_or(0) + t.output.unwrap_or(0);
            }
        }
    }

    (0..24)
        .map(|h| {
            let (sess, msgs, tokens) = by_hour[h];
            let avg_msgs = if sess > 0 {
                msgs as f64 / sess as f64
            } else {
                0.0
            };
            let avg_tokens = if sess > 0 {
                tokens as f64 / sess as f64
            } else {
                0.0
            };
            HourlyComplexity {
                hour: h,
                sessions: sess,
                total_messages: msgs,
                avg_messages_per_session: (avg_msgs * 10.0).round() / 10.0,
                avg_tokens_per_session: avg_tokens.round() as u64,
            }
        })
        .collect()
}
