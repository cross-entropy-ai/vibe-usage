use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::schema::Session;

use super::local_date;

// ── Result structs ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ProjectStats {
    pub name: String,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub duration_ms: u64,
    pub tools: HashMap<String, usize>,
    pub first_seen: String,
    pub last_seen: String,
}

#[derive(Debug, Serialize)]
pub struct DirectoryStats {
    pub directory: String,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub tools: HashMap<String, usize>,
}

#[derive(Debug, Serialize)]
pub struct HostStats {
    pub hostname: String,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub tools: HashMap<String, usize>,
}

#[derive(Debug, Serialize)]
pub struct GitRepoStats {
    pub repo: String,
    pub branches: Vec<String>,
    pub sessions: usize,
    pub messages: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub last_seen: String,
}

#[derive(Debug, Serialize)]
pub struct ProjectLifecycleEntry {
    pub project: String,
    pub total_sessions: usize,
    pub timeline: Vec<WeekCount>,
}

#[derive(Debug, Serialize)]
pub struct WeekCount {
    pub week: String,
    pub sessions: usize,
}

// ── Public functions ───────────────────────────────────────────────

/// Per-project aggregation.
pub fn projects(sessions: &[Session]) -> Vec<ProjectStats> {
    let mut project_map: HashMap<String, ProjectStats> = HashMap::new();
    for s in sessions {
        let key = s.project.as_deref().unwrap_or("(unknown)").to_string();
        let day = local_date(&s.start_time);
        let entry = project_map
            .entry(key.clone())
            .or_insert_with(|| ProjectStats {
                name: key,
                sessions: 0,
                messages: 0,
                input_tokens: 0,
                output_tokens: 0,
                duration_ms: 0,
                tools: HashMap::new(),
                first_seen: day.clone(),
                last_seen: day.clone(),
            });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        entry.duration_ms += s.duration_ms.unwrap_or(0);
        *entry.tools.entry(s.tool.to_string()).or_default() += 1;
        if day < entry.first_seen {
            entry.first_seen = day.clone();
        }
        if day > entry.last_seen {
            entry.last_seen = day;
        }
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }

    let mut result: Vec<ProjectStats> = project_map.into_values().collect();
    result.sort_by(|a, b| b.sessions.cmp(&a.sessions));
    result
}

/// Per-cwd aggregation.
pub fn directories(sessions: &[Session]) -> Vec<DirectoryStats> {
    let home = dirs::home_dir().unwrap_or_default();
    let home_str = home.to_string_lossy();

    let mut dir_map: HashMap<String, DirectoryStats> = HashMap::new();
    for s in sessions {
        let cwd = match &s.cwd {
            Some(c) => {
                if c.starts_with(home_str.as_ref()) {
                    format!("~{}", &c[home_str.len()..])
                } else {
                    c.clone()
                }
            }
            None => continue,
        };

        let entry = dir_map
            .entry(cwd.clone())
            .or_insert_with(|| DirectoryStats {
                directory: cwd,
                sessions: 0,
                messages: 0,
                input_tokens: 0,
                output_tokens: 0,
                tools: HashMap::new(),
            });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        *entry.tools.entry(s.tool.to_string()).or_default() += 1;
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }

    let mut result: Vec<DirectoryStats> = dir_map.into_values().collect();
    result.sort_by(|a, b| b.sessions.cmp(&a.sessions));
    result
}

pub fn hosts_summary(sessions: &[Session]) -> Vec<HostStats> {
    let mut host_map: HashMap<String, HostStats> = HashMap::new();
    for s in sessions {
        let name = s.hostname.as_deref().unwrap_or("unknown");
        let entry = host_map
            .entry(name.to_string())
            .or_insert_with(|| HostStats {
                hostname: name.to_string(),
                sessions: 0,
                messages: 0,
                input_tokens: 0,
                output_tokens: 0,
                tools: HashMap::new(),
            });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        *entry.tools.entry(s.tool.to_string()).or_default() += 1;
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }
    let mut result: Vec<HostStats> = host_map.into_values().collect();
    result.sort_by(|a, b| b.sessions.cmp(&a.sessions));
    result
}

/// Per-repo aggregation from git context.
pub fn git_activity(sessions: &[Session]) -> Vec<GitRepoStats> {
    let mut repos: HashMap<String, GitRepoStats> = HashMap::new();
    for s in sessions {
        let git = match &s.git {
            Some(g) => g,
            None => continue,
        };
        let repo_key = match git.repo_url.as_deref().or(git.branch.as_deref()) {
            Some(k) => k.to_string(),
            None => continue,
        };

        let day = local_date(&s.start_time);
        let entry = repos
            .entry(repo_key.clone())
            .or_insert_with(|| GitRepoStats {
                repo: repo_key,
                branches: Vec::new(),
                sessions: 0,
                messages: 0,
                input_tokens: 0,
                output_tokens: 0,
                last_seen: day.clone(),
            });
        entry.sessions += 1;
        entry.messages += s.messages.len();
        if day > entry.last_seen {
            entry.last_seen = day;
        }
        if let Some(ref branch) = git.branch {
            if !entry.branches.contains(branch) {
                entry.branches.push(branch.clone());
            }
        }
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                entry.input_tokens += t.input.unwrap_or(0);
                entry.output_tokens += t.output.unwrap_or(0);
            }
        }
    }

    let mut result: Vec<GitRepoStats> = repos.into_values().collect();
    result.sort_by(|a, b| b.sessions.cmp(&a.sessions));
    result
}

/// Per-project weekly activity timeline.
pub fn project_lifecycle(sessions: &[Session]) -> Vec<ProjectLifecycleEntry> {
    let mut lifecycle: HashMap<String, BTreeMap<String, usize>> = HashMap::new();
    for s in sessions {
        let project = s.project.as_deref().unwrap_or("(unknown)").to_string();
        let week = s.start_time.format("%G-W%V").to_string();
        *lifecycle
            .entry(project)
            .or_default()
            .entry(week)
            .or_default() += 1;
    }

    let mut projects_vec: Vec<_> = lifecycle.into_iter().collect();
    projects_vec.sort_by(|a, b| {
        let ta: usize = a.1.values().sum();
        let tb: usize = b.1.values().sum();
        tb.cmp(&ta)
    });

    projects_vec
        .into_iter()
        .take(20)
        .map(|(name, weeks)| {
            let total: usize = weeks.values().sum();
            let timeline: Vec<WeekCount> = weeks
                .into_iter()
                .map(|(week, sessions)| WeekCount { week, sessions })
                .collect();
            ProjectLifecycleEntry {
                project: name,
                total_sessions: total,
                timeline,
            }
        })
        .collect()
}
