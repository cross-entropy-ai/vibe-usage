use std::collections::HashMap;

use serde::Serialize;

use crate::schema::{Role, Session};

use super::{avg, median, BucketCount};

// ── Private helpers ────────────────────────────────────────────────

fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF |
        0x20000..=0x2A6DF | 0x2A700..=0x2B73F | 0x2B740..=0x2B81F |
        0x3000..=0x303F | 0xFF00..=0xFFEF
    )
}

fn classify_task(text: &str) -> &'static str {
    let rules: &[(&[&str], &str)] = &[
        (&["fix", "bug", "error", "issue", "broken", "wrong", "fail", "crash"], "Bug Fix"),
        (&["refactor", "clean", "simplify", "reorganize", "restructure"], "Refactor"),
        (&["test", "spec", "assert", "coverage"], "Testing"),
        (&["explain", "what is", "how does", "why", "understand", "tell me"], "Explanation"),
        (&["review", "check", "look at", "audit"], "Code Review"),
        (&["add", "implement", "create", "build", "make", "write", "new feature"], "New Feature"),
        (&["update", "change", "modify", "adjust", "tweak"], "Modification"),
        (&["deploy", "release", "publish", "ship"], "Deployment"),
        (&["config", "setup", "install", "init", "configure"], "Configuration"),
        (&["read", "show", "list", "find", "search", "look up", "fetch"], "Exploration"),
        (&["修", "改", "错", "问题"], "Bug Fix"),
        (&["重构", "优化", "清理"], "Refactor"),
        (&["测试"], "Testing"),
        (&["解释", "什么", "为什么", "怎么", "帮我看"], "Explanation"),
        (&["添加", "实现", "创建", "写", "新增", "做"], "New Feature"),
        (&["更新", "修改", "调整"], "Modification"),
        (&["部署", "发布"], "Deployment"),
        (&["配置", "安装", "设置"], "Configuration"),
        (&["读", "查", "找", "搜索", "列出", "看看"], "Exploration"),
        (&["commit", "push", "pr", "merge"], "Git Operations"),
    ];
    for (keywords, category) in rules {
        if keywords.iter().any(|k| text.contains(k)) {
            return category;
        }
    }
    "Other"
}

fn extract_extensions(args: &serde_json::Value) -> Vec<String> {
    let mut exts = Vec::new();
    for key in &["file_path", "path", "pattern", "file", "glob"] {
        if let Some(v) = args.get(key).and_then(|v| v.as_str()) {
            if let Some(ext) = std::path::Path::new(v).extension() {
                exts.push(ext.to_string_lossy().to_lowercase());
            }
        }
    }
    if let Some(cmd) = args.get("command").and_then(|v| v.as_str()) {
        for token in cmd.split_whitespace() {
            if token.contains('.') && !token.starts_with('-') && !token.starts_with("http") {
                if let Some(ext) = std::path::Path::new(token).extension() {
                    let e = ext.to_string_lossy().to_lowercase();
                    if matches!(
                        e.as_str(),
                        "rs" | "py" | "js" | "ts" | "tsx" | "jsx" | "go" | "java"
                            | "rb" | "c" | "cpp" | "h" | "hpp" | "css" | "html"
                            | "json" | "yaml" | "yml" | "toml" | "md" | "sh"
                            | "sql" | "proto" | "swift" | "kt" | "vue" | "svelte"
                    ) {
                        exts.push(e);
                    }
                }
            }
        }
    }
    exts
}

// ── Result structs ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConversationInsights {
    pub depth: DepthStats,
    pub prompt_length: LengthStats,
    pub response_length: LengthStats,
}

#[derive(Debug, Serialize)]
pub struct DepthStats {
    pub histogram: Vec<BucketCount>,
    pub avg: f64,
    pub median: f64,
    pub total_sessions: usize,
}

#[derive(Debug, Serialize)]
pub struct LengthStats {
    pub avg_chars: u64,
    pub median_chars: u64,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct CacheEntry {
    pub name: String,
    pub input_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub hit_rate_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct CacheEfficiency {
    pub by_tool: Vec<CacheEntry>,
    pub by_model: Vec<CacheEntry>,
}

#[derive(Debug, Serialize)]
pub struct ThinkingEntry {
    pub model: String,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub thinking_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct ToolchainInsights {
    pub top_chains: Vec<ChainCount>,
    pub file_types: Vec<ExtCount>,
}

#[derive(Debug, Serialize)]
pub struct ChainCount {
    pub chain: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ExtCount {
    pub extension: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct ModelSwitchInsights {
    pub total_sessions: usize,
    pub sessions_with_switch: usize,
    pub switch_rate_pct: f64,
    pub top_switches: Vec<SwitchCount>,
}

#[derive(Debug, Serialize)]
pub struct SwitchCount {
    #[serde(rename = "switch")]
    pub switch_pair: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct LanguageInsights {
    pub languages: Vec<LangCount>,
    pub task_types: Vec<TaskCount>,
}

#[derive(Debug, Serialize)]
pub struct LangCount {
    pub language: String,
    pub sessions: usize,
}

#[derive(Debug, Serialize)]
pub struct TaskCount {
    pub task: String,
    pub sessions: usize,
}

// ── Public functions ───────────────────────────────────────────────

/// Depth histogram, prompt/response length stats.
pub fn conversation_insights(sessions: &[Session]) -> ConversationInsights {
    let mut depths: Vec<usize> = sessions.iter().map(|s| s.messages.len()).collect();
    depths.sort();

    let buckets = [
        ("1-5", 1, 6),
        ("6-10", 6, 11),
        ("11-20", 11, 21),
        ("21-50", 21, 51),
        ("51-100", 51, 101),
        ("101-200", 101, 201),
        ("200+", 201, usize::MAX),
    ];
    let depth_histogram: Vec<BucketCount> = buckets
        .iter()
        .map(|(label, lo, hi)| BucketCount {
            bucket: label,
            count: depths.iter().filter(|d| **d >= *lo && **d < *hi).count(),
        })
        .collect();

    let mut prompt_lens: Vec<usize> = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::User)
        .map(|m| m.content.len())
        .collect();
    prompt_lens.sort();

    let mut response_lens: Vec<usize> = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == Role::Assistant)
        .map(|m| m.content.len())
        .collect();
    response_lens.sort();

    ConversationInsights {
        depth: DepthStats {
            histogram: depth_histogram,
            avg: avg(&depths),
            median: median(&depths),
            total_sessions: depths.len(),
        },
        prompt_length: LengthStats {
            avg_chars: avg(&prompt_lens) as u64,
            median_chars: median(&prompt_lens) as u64,
            total: prompt_lens.len(),
        },
        response_length: LengthStats {
            avg_chars: avg(&response_lens) as u64,
            median_chars: median(&response_lens) as u64,
            total: response_lens.len(),
        },
    }
}

/// Cache hit rates by tool and model.
pub fn cache_efficiency(sessions: &[Session]) -> CacheEfficiency {
    let mut by_tool: HashMap<String, (u64, u64, u64)> = HashMap::new();
    let mut by_model: HashMap<String, (u64, u64, u64)> = HashMap::new();

    for s in sessions {
        let tool = s.tool.to_string();
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                let inp = t.input.unwrap_or(0);
                let cr = t.cache_read.unwrap_or(0);
                let cw = t.cache_write.unwrap_or(0);
                if inp + cr == 0 {
                    continue;
                }
                let model = m
                    .model
                    .as_deref()
                    .or(s.model.as_deref())
                    .unwrap_or("unknown")
                    .to_string();
                let te = by_tool.entry(tool.clone()).or_default();
                te.0 += inp;
                te.1 += cr;
                te.2 += cw;
                let me = by_model.entry(model).or_default();
                me.0 += inp;
                me.1 += cr;
                me.2 += cw;
            }
        }
    }

    fn to_entries(stats: HashMap<String, (u64, u64, u64)>) -> Vec<CacheEntry> {
        let mut r: Vec<CacheEntry> = stats
            .into_iter()
            .map(|(name, (inp, cr, cw))| {
                let total = inp + cr;
                let hit_rate = if total > 0 {
                    cr as f64 / total as f64 * 100.0
                } else {
                    0.0
                };
                CacheEntry {
                    name,
                    input_tokens: inp,
                    cache_read_tokens: cr,
                    cache_write_tokens: cw,
                    hit_rate_pct: (hit_rate * 10.0).round() / 10.0,
                }
            })
            .collect();
        r.sort_by(|a, b| b.cache_read_tokens.cmp(&a.cache_read_tokens));
        r
    }

    CacheEfficiency {
        by_tool: to_entries(by_tool),
        by_model: to_entries(by_model),
    }
}

/// Thinking token ratio by model.
pub fn thinking_ratio(sessions: &[Session]) -> Vec<ThinkingEntry> {
    let mut by_model: HashMap<String, (u64, u64)> = HashMap::new();
    for s in sessions {
        for m in &s.messages {
            if let Some(t) = &m.tokens {
                let out = t.output.unwrap_or(0);
                let think = t.thinking.unwrap_or(0);
                if out + think == 0 {
                    continue;
                }
                let model = m
                    .model
                    .as_deref()
                    .or(s.model.as_deref())
                    .unwrap_or("unknown")
                    .to_string();
                let e = by_model.entry(model).or_default();
                e.0 += out;
                e.1 += think;
            }
        }
    }

    let mut result: Vec<ThinkingEntry> = by_model
        .into_iter()
        .filter(|(_, (_, think))| *think > 0)
        .map(|(model, (out, think))| {
            let ratio = think as f64 / (out + think) as f64 * 100.0;
            ThinkingEntry {
                model,
                output_tokens: out,
                thinking_tokens: think,
                thinking_pct: (ratio * 10.0).round() / 10.0,
            }
        })
        .collect();
    result.sort_by(|a, b| b.thinking_tokens.cmp(&a.thinking_tokens));
    result
}

/// Common tool call sequences + file type distribution.
pub fn toolchain_insights(sessions: &[Session]) -> ToolchainInsights {
    let mut bigrams: HashMap<String, usize> = HashMap::new();
    let mut file_exts: HashMap<String, usize> = HashMap::new();

    for s in sessions {
        let names: Vec<&str> = s
            .messages
            .iter()
            .flat_map(|m| m.tool_calls.iter())
            .map(|tc| tc.name.as_str())
            .collect();
        for pair in names.windows(2) {
            *bigrams
                .entry(format!("{} -> {}", pair[0], pair[1]))
                .or_default() += 1;
        }
        for m in &s.messages {
            for tc in &m.tool_calls {
                if let Some(ref args) = tc.args {
                    for ext in extract_extensions(args) {
                        *file_exts.entry(ext).or_default() += 1;
                    }
                }
            }
        }
    }

    let mut chains: Vec<ChainCount> = bigrams
        .into_iter()
        .map(|(chain, count)| ChainCount { chain, count })
        .collect();
    chains.sort_by(|a, b| b.count.cmp(&a.count));

    let mut exts: Vec<ExtCount> = file_exts
        .into_iter()
        .map(|(extension, count)| ExtCount { extension, count })
        .collect();
    exts.sort_by(|a, b| b.count.cmp(&a.count));

    ToolchainInsights {
        top_chains: chains.into_iter().take(30).collect(),
        file_types: exts.into_iter().take(30).collect(),
    }
}

/// Sessions where model changed mid-conversation.
pub fn model_switches(sessions: &[Session]) -> ModelSwitchInsights {
    let mut switched = 0usize;
    let total = sessions.len();
    let mut switch_pairs: HashMap<String, usize> = HashMap::new();

    for s in sessions {
        let models: Vec<&str> = s
            .messages
            .iter()
            .filter(|m| m.role == Role::Assistant)
            .filter_map(|m| m.model.as_deref())
            .collect();
        let mut prev: Option<&str> = None;
        let mut did_switch = false;
        for model in &models {
            if let Some(p) = prev {
                if p != *model {
                    did_switch = true;
                    *switch_pairs
                        .entry(format!("{} -> {}", p, model))
                        .or_default() += 1;
                }
            }
            prev = Some(model);
        }
        if did_switch {
            switched += 1;
        }
    }

    let mut pairs: Vec<SwitchCount> = switch_pairs
        .into_iter()
        .map(|(switch_pair, count)| SwitchCount { switch_pair, count })
        .collect();
    pairs.sort_by(|a, b| b.count.cmp(&a.count));

    ModelSwitchInsights {
        total_sessions: total,
        sessions_with_switch: switched,
        switch_rate_pct: if total > 0 {
            (switched as f64 / total as f64 * 1000.0).round() / 10.0
        } else {
            0.0
        },
        top_switches: pairs.into_iter().take(15).collect(),
    }
}

/// Language detection + task classification.
pub fn language_insights(sessions: &[Session]) -> LanguageInsights {
    let mut lang_counts: HashMap<String, usize> = HashMap::new();
    let mut task_counts: HashMap<String, usize> = HashMap::new();

    for s in sessions {
        if let Some(msg) = s.messages.iter().find(|m| m.role == Role::User) {
            let text = &msg.content;
            let cjk = text.chars().filter(|c| is_cjk(*c)).count();
            let latin = text.chars().filter(|c| c.is_ascii_alphabetic()).count();
            let lang = if cjk > latin / 3 && cjk > 3 {
                "Chinese"
            } else {
                "English"
            };
            *lang_counts.entry(lang.to_string()).or_default() += 1;
            *task_counts
                .entry(classify_task(&text.to_lowercase()).to_string())
                .or_default() += 1;
        }
    }

    let mut langs: Vec<LangCount> = lang_counts
        .into_iter()
        .map(|(language, sessions)| LangCount { language, sessions })
        .collect();
    langs.sort_by(|a, b| b.sessions.cmp(&a.sessions));

    let mut tasks: Vec<TaskCount> = task_counts
        .into_iter()
        .map(|(task, sessions)| TaskCount { task, sessions })
        .collect();
    tasks.sort_by(|a, b| b.sessions.cmp(&a.sessions));

    LanguageInsights {
        languages: langs,
        task_types: tasks,
    }
}
