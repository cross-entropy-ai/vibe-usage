use std::collections::{BTreeMap, BTreeSet, HashMap};

use chrono::{Local, Timelike};
use serde::Serialize;
use serde_json::Value;

use crate::schema::{Session, ToolCall};

const BASH_TOOL_NAMES: &[&str] = &[
    "Bash",
    "bash",
    "Shell",
    "shell",
    "shell_command",
    "exec_command",
    "run_shell_command",
];

#[derive(Debug, Serialize)]
pub struct BashEntry {
    pub timestamp: String,
    pub tool: String,
    pub session_id: String,
    pub project: Option<String>,
    pub cwd: Option<String>,
    pub command: String,
    pub description: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BashHistory {
    pub total: usize,
    pub offset: usize,
    pub count: usize,
    pub entries: Vec<BashEntry>,
}

fn is_bash_tool(name: &str) -> bool {
    BASH_TOOL_NAMES.iter().any(|n| n.eq_ignore_ascii_case(name))
}

/// Extract the shell command from a ToolCall's args.
/// Handles three common shapes:
///   - `command: "git status"` (Claude, Gemini)
///   - `command: ["bash", "-lc", "git status"]` (Codex, when actually running bash)
///   - `command: ["apply_patch", "..."]` (Codex non-shell invocations -- still surfaced)
fn extract_command(args: Option<&Value>) -> Option<String> {
    let args = args?;
    let cmd = args
        .get("command")
        .or_else(|| args.get("cmd"))
        .or_else(|| args.get("script"))?;

    match cmd {
        Value::String(s) => Some(s.clone()),
        Value::Array(arr) => {
            let strs: Vec<String> = arr
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            if strs.is_empty() {
                return None;
            }
            // Codex shell pattern: ["bash"|"sh"|"zsh", "-c"|"-lc", actual]
            let head = strs[0].as_str();
            if matches!(head, "bash" | "sh" | "zsh")
                && strs.len() >= 3
                && (strs[1] == "-c" || strs[1] == "-lc")
            {
                return Some(strs[2..].join(" "));
            }
            Some(strs.join(" "))
        }
        _ => None,
    }
}

fn extract_description(args: Option<&Value>) -> Option<String> {
    let v = args?.get("description")?;
    v.as_str().map(|s| s.to_string())
}

fn entry_from_call(
    session: &Session,
    timestamp: String,
    call: &ToolCall,
) -> Option<BashEntry> {
    if !is_bash_tool(&call.name) {
        return None;
    }
    let command = extract_command(call.args.as_ref())?;
    if command.trim().is_empty() {
        return None;
    }
    Some(BashEntry {
        timestamp,
        tool: session.tool.to_string(),
        session_id: session.id.clone(),
        project: session.project.clone(),
        cwd: session.cwd.clone(),
        command,
        description: extract_description(call.args.as_ref()),
        status: call.status.clone(),
    })
}

// ── Shell command analysis ─────────────────────────────────────────

#[derive(Debug, Default)]
struct CommandAnalysis {
    features: BTreeSet<&'static str>,
    programs: Vec<String>,
    categories: BTreeSet<&'static str>,
}

/// Classify a program/subcommand pair into a behavior category.
/// Categories: "read", "mutate", "exec", "network", "other".
fn classify(prog: &str, subcmd: Option<&str>) -> &'static str {
    // Strip an absolute path so `/usr/bin/ssh` matches `ssh`.
    let prog = prog.rsplit('/').next().unwrap_or(prog);
    if prog == "git" {
        const GIT_MUTATE: &[&str] = &[
            "commit", "push", "pull", "merge", "rebase", "checkout", "switch",
            "add", "reset", "restore", "stash", "cherry-pick", "rm", "mv",
            "clean", "clone", "init", "apply", "am", "submodule", "worktree",
            "gc", "prune", "filter-branch", "filter-repo", "revert",
        ];
        return match subcmd {
            Some(s) if GIT_MUTATE.contains(&s) => "mutate",
            _ => "read",
        };
    }
    if matches!(prog, "kubectl" | "k") {
        const K8S_READ: &[&str] = &[
            "get", "describe", "logs", "top", "version", "explain",
            "api-resources", "api-versions", "auth", "cluster-info",
            "diff", "events",
        ];
        return match subcmd {
            Some(s) if K8S_READ.contains(&s) => "read",
            _ => "exec",
        };
    }
    if matches!(prog, "docker" | "podman") {
        const CONTAINER_READ: &[&str] = &[
            "ps", "images", "logs", "inspect", "history", "info", "version",
            "stats", "top", "diff", "search",
        ];
        return match subcmd {
            Some(s) if CONTAINER_READ.contains(&s) => "read",
            _ => "exec",
        };
    }
    if matches!(prog, "gh") {
        const GH_READ: &[&str] = &[
            "pr", "issue", "repo", "api", "browse", "search", "release",
            "run", "workflow", "auth", "status", "label",
        ];
        // Most gh subcommands have read-only and mutate variants; default to read
        // since `view`/`list` are far more common in our data than `create`.
        return match subcmd {
            Some("create") | Some("delete") | Some("edit") | Some("close") | Some("reopen") | Some("merge") | Some("ready") => "mutate",
            Some(s) if GH_READ.contains(&s) => "read",
            _ => "read",
        };
    }

    // Pure read-only inspection / filters
    const READ: &[&str] = &[
        "ls", "dir", "tree", "exa",
        "cat", "head", "tail", "less", "more", "bat", "view",
        "grep", "rg", "ack", "ag", "egrep", "fgrep",
        "find", "fd", "locate",
        "ps", "top", "htop", "btop", "free", "df", "du", "uptime", "lsof",
        "wc", "sort", "uniq", "cut", "awk", "tr", "tee",
        "echo", "printf", "yes",
        "pwd", "hostname", "whoami", "id", "date", "uname", "uptime",
        "which", "type", "command", "whereis", "where",
        "file", "stat", "readlink", "realpath", "basename", "dirname",
        "env", "printenv", "set",
        "diff", "cmp", "comm",
        "jq", "yq", "xq",
        "xxd", "od", "hexdump", "strings",
        "man", "info", "help", "tldr", "history",
        "true", "false", "test", "[",
        "column", "fold", "expand", "unexpand", "rev",
        "nl", "paste", "join", "split",
        "tput", "stty",
        "cd", "pushd", "popd", "dirs",
        "sed", "gsed", // mostly used as filter; -i would mutate but we default to read
        "ssh-add", "ssh-keyscan",
    ];
    if READ.contains(&prog) {
        return "read";
    }

    // Direct filesystem / system mutations
    const MUTATE: &[&str] = &[
        "rm", "rmdir", "unlink",
        "mv", "cp", "rename",
        "mkdir", "touch", "truncate",
        "chmod", "chown", "chgrp", "setfacl",
        "ln", "link",
        "tar", "zip", "unzip", "gzip", "gunzip", "xz", "bzip2", "7z",
        "dd", "shred",
        "patch",
        "kill", "killall", "pkill", "xargs",
        "mount", "umount",
        "useradd", "userdel", "usermod", "groupadd", "groupdel", "passwd",
        "iptables", "ufw", "firewall-cmd",
        "crontab",
        "systemctl", "service", "launchctl", "supervisorctl",
        "ssh-keygen",
        "fdisk", "mkfs", "fsck", "parted",
    ];
    if MUTATE.contains(&prog) {
        return "mutate";
    }

    // Build / install tooling — mutates project state
    const BUILD: &[&str] = &[
        "make", "cmake", "ninja", "meson", "bazel",
        "cargo", "rustup", "rustc",
        "go", "gofmt",
        "npm", "yarn", "pnpm", "bun", "npx", "pnpx",
        "pip", "pip3", "pipx", "poetry", "uv", "conda",
        "gem", "bundle", "bundler",
        "brew", "apt", "apt-get", "dnf", "yum", "pacman", "snap", "port",
        "xcodebuild", "xcrun", "pod",
        "pdflatex", "xelatex", "lualatex", "bibtex", "biber",
        "tsc", "esbuild", "vite", "webpack", "rollup",
        "docker-compose", "podman-compose",
    ];
    if BUILD.contains(&prog) {
        return "mutate";
    }

    // Script interpreters — behavior unknown statically
    const EXEC: &[&str] = &[
        "python", "python2", "python3",
        "node", "deno",
        "ruby", "perl", "php", "lua",
        "bash", "sh", "zsh", "fish", "ksh", "dash",
        "tmux", "screen",
        "expect",
        "java", "scala", "kotlin",
    ];
    if EXEC.contains(&prog) {
        return "exec";
    }

    // Network tools
    const NETWORK: &[&str] = &[
        "curl", "wget", "http", "httpie",
        "ssh", "scp", "sftp", "rsync",
        "nc", "ncat", "socat", "netcat",
        "ping", "ping6", "traceroute", "tracepath", "mtr",
        "dig", "nslookup", "host", "drill",
        "telnet", "ftp",
        "openssl",
    ];
    if NETWORK.contains(&prog) {
        return "network";
    }

    "other"
}

/// Pick the dominant category for a compound command using a priority order:
/// mutate > exec > network > read > other.
fn dominant_category(cats: &BTreeSet<&'static str>) -> &'static str {
    for c in &["mutate", "exec", "network", "read", "other"] {
        if cats.contains(c) {
            return c;
        }
    }
    "other"
}

/// Detect risky patterns in a shell command. Returns the labels of every
/// match (a command can hit multiple, e.g. `sudo rm -rf`).
fn detect_dangerous(cmd: &str) -> Vec<&'static str> {
    let lower = cmd.to_lowercase();
    let mut hits = Vec::new();

    if has_rm_rf(&lower) {
        hits.push("rm -rf");
    }
    if lower.contains("sudo rm") {
        hits.push("sudo rm");
    }
    if (lower.contains("kill ") || lower.contains("killall "))
        && (lower.contains("-9") || lower.contains("-sigkill"))
    {
        hits.push("kill -9");
    }
    if lower.contains("git push") && (lower.contains("--force") || lower.contains(" -f")) {
        hits.push("git push --force");
    }
    if lower.contains("git reset") && lower.contains("--hard") {
        hits.push("git reset --hard");
    }
    if lower.contains("git clean")
        && (lower.contains("-f") || lower.contains("-d") || lower.contains("-x"))
    {
        hits.push("git clean -fd");
    }
    if lower.contains("git checkout") && (lower.contains(" -- .") || lower.contains(" -- *")) {
        hits.push("git checkout discard");
    }
    if lower.contains("chmod 777")
        || lower.contains("chmod -r 777")
        || lower.contains("chmod a+rwx")
    {
        hits.push("chmod 777");
    }
    if lower.contains("dd ") && lower.contains("of=") {
        hits.push("dd write");
    }
    if lower.contains("mkfs.") || lower.starts_with("mkfs ") || lower.contains(" mkfs ") {
        hits.push("mkfs");
    }
    if lower.contains("drop table") {
        hits.push("drop table");
    }
    if lower.contains("drop database") {
        hits.push("drop database");
    }
    if lower.contains("truncate table") {
        hits.push("truncate table");
    }
    if lower.contains("eval $(") || lower.contains("eval \"") || lower.contains("eval `") {
        hits.push("eval");
    }
    if lower.contains("/dev/sd")
        || lower.contains("/dev/disk")
        || lower.contains("/dev/nvme")
        || lower.contains("/dev/mmcblk")
    {
        hits.push("disk device");
    }
    if lower.contains(":(){") || lower.contains(":() {") {
        hits.push("fork bomb");
    }

    hits
}

fn has_rm_rf(lower: &str) -> bool {
    // Look for any token sequence: `rm <flags>` where flags contain both r/R and f.
    for (i, _) in lower.match_indices("rm") {
        // Must be a standalone word (preceded by start or whitespace)
        let preceded_ok = i == 0 || matches!(lower.as_bytes()[i - 1], b' ' | b'\t' | b'\n' | b';' | b'&' | b'|' | b'(');
        if !preceded_ok {
            continue;
        }
        let after = &lower[i + 2..];
        if !after.starts_with(' ') && !after.starts_with('\t') {
            continue;
        }
        // Peek the next non-empty token.
        let next_tok = after.split_whitespace().next().unwrap_or("");
        if !next_tok.starts_with('-') {
            continue;
        }
        // Could also be `rm -r -f path` -- check up to 4 next tokens.
        let mut has_r = false;
        let mut has_f = false;
        for tok in after.split_whitespace().take(4) {
            if !tok.starts_with('-') {
                break;
            }
            for c in tok.chars().skip(1) {
                if c == 'r' || c == 'R' {
                    has_r = true;
                }
                if c == 'f' {
                    has_f = true;
                }
            }
            if has_r && has_f {
                return true;
            }
        }
    }
    false
}

/// Verb for command-chain analysis: first program token, plus its subcommand
/// for tools where subcommand matters (git/gh/kubectl/docker/npm/cargo/bun).
fn command_verb(cmd: &str) -> Option<String> {
    // Use the first top-level segment only — chain analysis sees full commands
    // as atomic, not their internal `&&`/`|` parts.
    let toks = first_program_tokens(cmd);
    let prog = toks.first().cloned()?;
    if matches!(
        prog.as_str(),
        "git" | "gh" | "kubectl" | "k" | "docker" | "podman" | "npm" | "cargo" | "bun" | "pnpm" | "yarn"
    ) {
        if let Some(sub) = toks.get(1) {
            return Some(format!("{prog} {sub}"));
        }
    }
    Some(prog)
}

fn density_bucket(n: usize) -> usize {
    match n {
        1 => 0,
        2..=5 => 1,
        6..=20 => 2,
        21..=50 => 3,
        51..=100 => 4,
        _ => 5,
    }
}

/// Heuristic shell parser. Tracks quote state to avoid misreading operators
/// inside strings, but does NOT implement full shell grammar. Good enough for
/// statistics.
fn analyze_command(cmd: &str) -> CommandAnalysis {
    let mut a = CommandAnalysis::default();
    if cmd.contains('\n') {
        a.features.insert("multiline");
    }

    let bytes = cmd.as_bytes();
    let mut i = 0usize;
    let mut in_single = false;
    let mut in_double = false;
    let mut segment_start = 0usize;

    while i < bytes.len() {
        let c = bytes[i];

        if in_single {
            if c == b'\'' {
                in_single = false;
            }
            i += 1;
            continue;
        }
        if in_double {
            if c == b'\\' && i + 1 < bytes.len() {
                i += 2;
                continue;
            }
            if c == b'"' {
                in_double = false;
            } else if c == b'$' && i + 1 < bytes.len() && bytes[i + 1] == b'(' {
                a.features.insert("cmd_subst");
            } else if c == b'`' {
                a.features.insert("cmd_subst");
            }
            i += 1;
            continue;
        }

        match c {
            b'\'' => {
                in_single = true;
                i += 1;
            }
            b'"' => {
                in_double = true;
                i += 1;
            }
            b'\\' if i + 1 < bytes.len() => {
                i += 2;
            }
            b'#' => {
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
            }
            b'|' => {
                if i + 1 < bytes.len() && bytes[i + 1] == b'|' {
                    a.features.insert("or");
                    push_program(&cmd[segment_start..i], &mut a);
                    i += 2;
                    segment_start = i;
                } else {
                    a.features.insert("pipe");
                    push_program(&cmd[segment_start..i], &mut a);
                    i += 1;
                    segment_start = i;
                }
            }
            b'&' => {
                if i + 1 < bytes.len() && bytes[i + 1] == b'&' {
                    a.features.insert("and");
                    push_program(&cmd[segment_start..i], &mut a);
                    i += 2;
                    segment_start = i;
                } else if i + 1 < bytes.len() && bytes[i + 1] == b'>' {
                    a.features.insert("stderr_merge");
                    a.features.insert("stdout_file");
                    i += 2;
                } else {
                    a.features.insert("background");
                    i += 1;
                }
            }
            b';' => {
                if i + 1 < bytes.len() && bytes[i + 1] == b';' {
                    // case terminator
                    i += 2;
                } else {
                    a.features.insert("seq");
                    push_program(&cmd[segment_start..i], &mut a);
                    i += 1;
                    segment_start = i;
                }
            }
            b'2' if i + 3 < bytes.len()
                && bytes[i + 1] == b'>'
                && bytes[i + 2] == b'&'
                && bytes[i + 3] == b'1' =>
            {
                a.features.insert("stderr_merge");
                i += 4;
            }
            b'2' if i + 1 < bytes.len() && bytes[i + 1] == b'>' => {
                a.features.insert("stderr_file");
                i += 2;
                if i < bytes.len() && bytes[i] == b'>' {
                    i += 1;
                }
            }
            b'>' => {
                if i + 1 < bytes.len() && bytes[i + 1] == b'>' {
                    a.features.insert("append");
                    i += 2;
                } else if i + 1 < bytes.len() && bytes[i + 1] == b'(' {
                    a.features.insert("proc_subst");
                    i += 2;
                } else {
                    a.features.insert("stdout_file");
                    i += 1;
                }
            }
            b'<' => {
                if i + 2 < bytes.len() && bytes[i + 1] == b'<' && bytes[i + 2] == b'<' {
                    // <<<here-string
                    a.features.insert("herestring");
                    i += 3;
                } else if i + 1 < bytes.len() && bytes[i + 1] == b'<' {
                    a.features.insert("heredoc");
                    i += 2;
                } else if i + 1 < bytes.len() && bytes[i + 1] == b'(' {
                    a.features.insert("proc_subst");
                    i += 2;
                } else {
                    i += 1;
                }
            }
            b'$' if i + 1 < bytes.len() && bytes[i + 1] == b'(' => {
                a.features.insert("cmd_subst");
                i += 2;
            }
            b'`' => {
                a.features.insert("cmd_subst");
                i += 1;
                while i < bytes.len() && bytes[i] != b'`' {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                    } else {
                        i += 1;
                    }
                }
                if i < bytes.len() {
                    i += 1;
                }
            }
            b'(' => {
                a.features.insert("subshell");
                i += 1;
            }
            _ => i += 1,
        }
    }

    // Final segment
    push_program(&cmd[segment_start..], &mut a);

    a
}

fn push_program(segment: &str, a: &mut CommandAnalysis) {
    let toks = first_program_tokens(segment);
    let prog = match toks.first() {
        Some(p) => p.clone(),
        None => return,
    };
    if matches!(
        prog.as_str(),
        "for" | "while" | "if" | "case" | "until" | "function" | "select"
    ) {
        a.features.insert("control_flow");
        // Control-flow keywords aren't a meaningful classification target.
        return;
    }
    let cat = classify(&prog, toks.get(1).map(|s| s.as_str()));
    a.categories.insert(cat);
    a.programs.push(prog);
}

fn is_env_assignment(tok: &str) -> bool {
    if let Some(eq_pos) = tok.find('=') {
        let head = &tok[..eq_pos];
        !head.is_empty()
            && head
                .chars()
                .next()
                .map(|c| c.is_ascii_alphabetic() || c == '_')
                .unwrap_or(false)
            && head.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    } else {
        false
    }
}

fn strip_quotes(s: &str) -> String {
    let s = s.trim();
    if (s.starts_with('"') && s.ends_with('"') && s.len() >= 2)
        || (s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2)
    {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}

/// Return up to the first two "program" tokens of a segment, skipping
/// `FOO=bar` env-prefixes and group-opener characters. Used for classifying
/// commands by program + subcommand.
fn first_program_tokens(segment: &str) -> Vec<String> {
    let trimmed = segment.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let trimmed = trimmed.trim_start_matches(|c: char| c == '(' || c == '{').trim();
    let mut out = Vec::with_capacity(2);
    for tok in trimmed.split_whitespace() {
        if is_env_assignment(tok) {
            continue;
        }
        if tok == "!" || tok == "(" || tok == "{" {
            continue;
        }
        let stripped = strip_quotes(tok);
        if stripped.is_empty() {
            continue;
        }
        // Skip flags as subcommand candidates
        if !out.is_empty() && stripped.starts_with('-') {
            continue;
        }
        out.push(stripped);
        if out.len() >= 2 {
            break;
        }
    }
    out
}

// ── Stats endpoint ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NameCount {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct BashStats {
    pub total: usize,
    pub features: HashMap<String, usize>,
    pub top_programs: Vec<NameCount>,
    /// Histogram of feature-count per command. Index 0 = commands with no
    /// special features, index 5 = "5 or more features".
    pub complexity: Vec<usize>,
    pub by_project: Vec<ProjectComplexity>,
    /// Counts of commands by behavior category (read / mutate / exec /
    /// network / other), using the dominant category per command.
    pub categories: HashMap<String, usize>,
    pub timeseries: Vec<DailyCount>,
    pub hourly: Vec<usize>,
    pub session_density: SessionDensity,
    pub dangerous: Vec<DangerousEntry>,
    pub dangerous_summary: Vec<NameCount>,
    pub chains: Vec<CommandChain>,
    /// Total occurrences of each chain verb (used for sizing graph nodes).
    pub chain_node_counts: Vec<NameCount>,
}

#[derive(Debug, Serialize)]
pub struct DailyCount {
    pub date: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct SessionDensity {
    /// Histogram bucketed as: 1, 2-5, 6-20, 21-50, 51-100, 100+.
    pub histogram: Vec<usize>,
    pub top_sessions: Vec<SessionDensityRow>,
}

#[derive(Debug, Serialize)]
pub struct SessionDensityRow {
    pub session_id: String,
    pub tool: String,
    pub project: Option<String>,
    pub bash_count: usize,
    pub start_time: String,
}

#[derive(Debug, Serialize)]
pub struct DangerousEntry {
    pub timestamp: String,
    pub tool: String,
    pub project: Option<String>,
    pub session_id: String,
    pub command: String,
    pub patterns: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
pub struct CommandChain {
    pub from: String,
    pub to: String,
    pub count: usize,
    /// P(to | from) = count(from→to) / total_transitions_from_from.
    pub probability: f64,
}

#[derive(Debug, Serialize)]
pub struct ProjectComplexity {
    pub name: String,
    pub commands: usize,
    /// Total complexity score: sum of 10^bucket across all commands.
    /// Each additional feature on a command is treated as 10x harder, so a
    /// 5+ feature command is worth 100,000 simple commands.
    pub total_complexity: u64,
    /// Bucketed histogram (same shape as `BashStats.complexity`).
    pub complexity: Vec<usize>,
}

/// Bucket weights using a log-10 distribution: bucket i is worth 10^i.
const COMPLEXITY_WEIGHTS: [u64; 6] = [1, 10, 100, 1_000, 10_000, 100_000];

pub fn bash_stats(
    sessions: &[Session],
    tool_filter: Option<&str>,
    query: Option<&str>,
) -> BashStats {
    let q = query.map(|s| s.to_lowercase());
    let mut total = 0usize;
    let mut feature_counts: HashMap<String, usize> = HashMap::new();
    let mut program_counts: HashMap<String, usize> = HashMap::new();
    let mut category_counts: HashMap<String, usize> = HashMap::new();
    let mut complexity = vec![0usize; 6];
    // (commands, total_complexity_score, histogram)
    let mut project_acc: HashMap<String, (usize, u64, Vec<usize>)> = HashMap::new();

    let mut daily: BTreeMap<String, usize> = BTreeMap::new();
    let mut hourly = vec![0usize; 24];
    // session_id -> (count, tool, project, earliest start time)
    let mut session_acc: HashMap<String, (usize, String, Option<String>, chrono::DateTime<chrono::Utc>)> = HashMap::new();
    let mut dangerous: Vec<DangerousEntry> = Vec::new();
    let mut dangerous_pattern_counts: HashMap<&'static str, usize> = HashMap::new();
    let mut chain_counts: HashMap<(String, String), usize> = HashMap::new();
    let mut chain_from_totals: HashMap<String, usize> = HashMap::new();
    let mut verb_counts: HashMap<String, usize> = HashMap::new();

    for session in sessions {
        if let Some(t) = tool_filter {
            if session.tool.to_string() != t {
                continue;
            }
        }
        let mut last_verb: Option<String> = None;
        for message in &session.messages {
            for call in &message.tool_calls {
                if !is_bash_tool(&call.name) {
                    continue;
                }
                let cmd = match extract_command(call.args.as_ref()) {
                    Some(c) if !c.trim().is_empty() => c,
                    _ => continue,
                };
                if let Some(needle) = &q {
                    let lower = cmd.to_lowercase();
                    if !lower.contains(needle) {
                        continue;
                    }
                }
                total += 1;
                let a = analyze_command(&cmd);
                let feature_count = a.features.len();
                let bucket = feature_count.min(5);
                complexity[bucket] += 1;
                for feature in &a.features {
                    *feature_counts.entry(feature.to_string()).or_default() += 1;
                }
                for prog in a.programs {
                    *program_counts.entry(prog).or_default() += 1;
                }
                let cat = dominant_category(&a.categories);
                *category_counts.entry(cat.to_string()).or_default() += 1;

                let project_name = session
                    .project
                    .clone()
                    .unwrap_or_else(|| "(unknown)".to_string());
                let entry = project_acc
                    .entry(project_name)
                    .or_insert_with(|| (0, 0, vec![0; 6]));
                entry.0 += 1;
                entry.1 += COMPLEXITY_WEIGHTS[bucket];
                entry.2[bucket] += 1;
                let _ = feature_count; // weight already captures complexity

                // Timeseries + hourly: use message timestamp (commands are timed
                // when the assistant calls them, not when the session started).
                let local_ts = message.timestamp.with_timezone(&Local);
                let date = local_ts.format("%Y-%m-%d").to_string();
                *daily.entry(date).or_default() += 1;
                hourly[local_ts.hour() as usize] += 1;

                // Session density bucket
                let s_entry = session_acc
                    .entry(session.id.clone())
                    .or_insert_with(|| (
                        0,
                        session.tool.to_string(),
                        session.project.clone(),
                        session.start_time,
                    ));
                s_entry.0 += 1;

                // Dangerous patterns
                let danger = detect_dangerous(&cmd);
                if !danger.is_empty() {
                    for p in &danger {
                        *dangerous_pattern_counts.entry(p).or_default() += 1;
                    }
                    dangerous.push(DangerousEntry {
                        timestamp: message.timestamp.to_rfc3339(),
                        tool: session.tool.to_string(),
                        project: session.project.clone(),
                        session_id: session.id.clone(),
                        command: cmd.clone(),
                        patterns: danger,
                    });
                }

                // Command chains (within session, in order)
                if let Some(verb) = command_verb(&cmd) {
                    *verb_counts.entry(verb.clone()).or_default() += 1;
                    if let Some(prev) = &last_verb {
                        *chain_counts
                            .entry((prev.clone(), verb.clone()))
                            .or_default() += 1;
                        *chain_from_totals.entry(prev.clone()).or_default() += 1;
                    }
                    last_verb = Some(verb);
                }
            }
        }
    }

    let mut top_programs: Vec<NameCount> = program_counts
        .into_iter()
        .map(|(name, count)| NameCount { name, count })
        .collect();
    top_programs.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    top_programs.truncate(40);

    let mut by_project: Vec<ProjectComplexity> = project_acc
        .into_iter()
        .map(|(name, (commands, total_complexity, hist))| ProjectComplexity {
            name,
            commands,
            total_complexity,
            complexity: hist,
        })
        .collect();
    // Default sort: by command volume desc, then by total complexity desc.
    by_project.sort_by(|a, b| {
        b.commands
            .cmp(&a.commands)
            .then_with(|| b.total_complexity.cmp(&a.total_complexity))
    });
    by_project.truncate(40);

    let timeseries: Vec<DailyCount> = daily
        .into_iter()
        .map(|(date, count)| DailyCount { date, count })
        .collect();

    // Session density: histogram + top sessions.
    let mut density_hist = vec![0usize; 6];
    for (n, _, _, _) in session_acc.values() {
        density_hist[density_bucket(*n)] += 1;
    }
    let mut top_sessions: Vec<SessionDensityRow> = session_acc
        .into_iter()
        .map(|(id, (count, tool, project, start_time))| SessionDensityRow {
            session_id: id,
            tool,
            project,
            bash_count: count,
            start_time: start_time.to_rfc3339(),
        })
        .collect();
    top_sessions.sort_by(|a, b| b.bash_count.cmp(&a.bash_count));
    top_sessions.truncate(20);

    // Dangerous: newest first, cap at 200; build summary by pattern.
    dangerous.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    dangerous.truncate(200);
    let mut dangerous_summary: Vec<NameCount> = dangerous_pattern_counts
        .into_iter()
        .map(|(name, count)| NameCount {
            name: name.to_string(),
            count,
        })
        .collect();
    dangerous_summary.sort_by(|a, b| b.count.cmp(&a.count));

    // Command chains: keep transitions with both meaningful sample sizes.
    let min_chain_count = 3usize;
    let min_from_total = 10usize;
    let mut chains: Vec<CommandChain> = chain_counts
        .into_iter()
        .filter_map(|((from, to), count)| {
            if count < min_chain_count {
                return None;
            }
            let from_total = chain_from_totals.get(&from).copied().unwrap_or(0);
            if from_total < min_from_total {
                return None;
            }
            Some(CommandChain {
                probability: (count as f64) / (from_total as f64),
                from,
                to,
                count,
            })
        })
        .collect();
    chains.sort_by(|a, b| b.count.cmp(&a.count));
    chains.truncate(300);

    let mut chain_node_counts: Vec<NameCount> = verb_counts
        .into_iter()
        .map(|(name, count)| NameCount { name, count })
        .collect();
    chain_node_counts.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));

    BashStats {
        total,
        features: feature_counts,
        top_programs,
        complexity,
        by_project,
        categories: category_counts,
        timeseries,
        hourly,
        session_density: SessionDensity {
            histogram: density_hist,
            top_sessions,
        },
        dangerous,
        dangerous_summary,
        chains,
        chain_node_counts,
    }
}

pub fn bash_history(
    sessions: &[Session],
    offset: usize,
    limit: usize,
    query: Option<&str>,
) -> BashHistory {
    let q = query.map(|s| s.to_lowercase());
    let mut all: Vec<BashEntry> = Vec::new();

    for session in sessions {
        for message in &session.messages {
            let ts = message.timestamp.to_rfc3339();
            for call in &message.tool_calls {
                if let Some(entry) = entry_from_call(session, ts.clone(), call) {
                    if let Some(needle) = &q {
                        if !entry.command.to_lowercase().contains(needle)
                            && !entry
                                .description
                                .as_deref()
                                .map(|d| d.to_lowercase().contains(needle))
                                .unwrap_or(false)
                        {
                            continue;
                        }
                    }
                    all.push(entry);
                }
            }
        }
    }

    // Newest first
    all.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    let total = all.len();
    let end = (offset + limit).min(total);
    let entries: Vec<BashEntry> = if offset >= total {
        Vec::new()
    } else {
        all.drain(offset..end).collect()
    };

    BashHistory {
        total,
        offset,
        count: entries.len(),
        entries,
    }
}
