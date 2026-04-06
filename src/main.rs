mod collector;
mod insights;
mod pricing;
mod remote;
mod schema;
mod server;

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

use collector::{
    claude::ClaudeCollector, codex::CodexCollector, default_data_dir, gemini::GeminiCollector,
    kimi::KimiCollector, raw_dirs_for, sync_collector, Collector,
};

#[derive(Parser)]
#[command(name = "vibe-usage", about = "Collect AI coding tool usage into a unified format")]
struct Cli {
    /// Which tools to operate on (gemini, claude, codex, kimi). Omit for all.
    #[arg(short, long, value_delimiter = ',', global = true)]
    tools: Option<Vec<String>>,

    /// Data directory (default: ~/.vibe-usage)
    #[arg(short, long, global = true)]
    data_dir: Option<PathBuf>,

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Sync raw data from tool directories into local store
    Sync,
    /// Analyze synced data and output unified format
    Analyze {
        /// Output file path (default: stdout)
        #[arg(short, long)]
        output: Option<String>,
        /// Print summary stats instead of full JSON
        #[arg(long)]
        summary: bool,
    },
    /// Push local raw data to remote server
    Push,
    /// Pull all raw data from remote server
    Pull,
    /// Start web dashboard server
    Serve {
        /// Port to listen on (default: 3000)
        #[arg(short, long, default_value = "3000")]
        port: u16,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let data_dir = cli.data_dir.unwrap_or_else(default_data_dir);
    let collectors = build_collectors(&cli.tools);

    match cli.command {
        Some(Command::Sync) => {
            do_sync(&collectors, &data_dir)?;
        }
        Some(Command::Analyze { output, summary }) => {
            let sessions = do_parse(&collectors, &data_dir)?;
            output_sessions(&sessions, output, summary)?;
        }
        Some(Command::Push) => {
            remote::push(&data_dir)?;
        }
        Some(Command::Pull) => {
            remote::pull(&data_dir)?;
        }
        Some(Command::Serve { port }) => {
            server::serve(collectors, data_dir, port).await?;
        }
        None => {
            // Default: sync then analyze --summary
            do_sync(&collectors, &data_dir)?;
            eprintln!();
            let sessions = do_parse(&collectors, &data_dir)?;
            output_sessions(&sessions, None, true)?;
        }
    }

    Ok(())
}

fn build_collectors(tools: &Option<Vec<String>>) -> Vec<Box<dyn Collector + Send + Sync>> {
    let all_names = vec!["gemini", "claude", "codex", "kimi"];
    let selected: Vec<&str> = match tools {
        Some(ts) => ts.iter().map(|s| s.as_str()).collect(),
        None => all_names,
    };

    selected
        .iter()
        .filter_map(|name| -> Option<Box<dyn Collector + Send + Sync>> {
            match *name {
                "gemini" => Some(Box::new(GeminiCollector::new())),
                "claude" => Some(Box::new(ClaudeCollector::new())),
                "codex" => Some(Box::new(CodexCollector::new())),
                "kimi" => Some(Box::new(KimiCollector::new())),
                other => {
                    eprintln!("unknown tool: {other}");
                    None
                }
            }
        })
        .collect()
}

fn do_sync(collectors: &[Box<dyn Collector + Send + Sync>], data_dir: &PathBuf) -> Result<()> {
    for c in collectors {
        eprint!("syncing {}...", c.name());
        match sync_collector(c.as_ref(), data_dir) {
            Ok(stats) => eprintln!(" {} copied, {} up-to-date", stats.copied, stats.skipped),
            Err(e) => eprintln!(" error: {e}"),
        }
    }
    Ok(())
}

fn do_parse(collectors: &[Box<dyn Collector + Send + Sync>], data_dir: &PathBuf) -> Result<Vec<schema::Session>> {
    let mut all_sessions = Vec::new();
    for c in collectors {
        let dirs = raw_dirs_for(c.as_ref(), data_dir);
        eprint!("parsing {}...", c.name());
        let mut count = 0;
        for raw_dir in dirs {
            match c.parse(&raw_dir) {
                Ok(sessions) => {
                    count += sessions.len();
                    all_sessions.extend(sessions);
                }
                Err(e) => eprintln!(" error in {}: {e}", raw_dir.display()),
            }
        }
        eprintln!(" {} sessions", count);
    }
    all_sessions.sort_by_key(|s| s.start_time);
    Ok(all_sessions)
}

fn output_sessions(
    sessions: &[schema::Session],
    output: Option<String>,
    summary: bool,
) -> Result<()> {
    if summary {
        print_summary(sessions);
    } else {
        let json = serde_json::to_string_pretty(sessions)?;
        match output {
            Some(path) => std::fs::write(&path, &json)?,
            None => println!("{json}"),
        }
    }
    Ok(())
}

fn print_summary(sessions: &[schema::Session]) {
    use schema::Tool;

    let total = sessions.len();
    let gemini = sessions.iter().filter(|s| s.tool == Tool::Gemini).count();
    let claude = sessions.iter().filter(|s| s.tool == Tool::Claude).count();
    let codex = sessions.iter().filter(|s| s.tool == Tool::Codex).count();
    let kimi = sessions.iter().filter(|s| s.tool == Tool::Kimi).count();

    let total_msgs: usize = sessions.iter().map(|s| s.messages.len()).sum();
    let user_msgs: usize = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == schema::Role::User)
        .count();
    let assistant_msgs: usize = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter(|m| m.role == schema::Role::Assistant)
        .count();

    let total_input: u64 = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter_map(|m| m.tokens.as_ref())
        .filter_map(|t| t.input)
        .sum();
    let total_output: u64 = sessions
        .iter()
        .flat_map(|s| &s.messages)
        .filter_map(|m| m.tokens.as_ref())
        .filter_map(|t| t.output)
        .sum();

    println!("=== Usage Summary ===");
    println!("Sessions:  {total} (gemini: {gemini}, claude: {claude}, codex: {codex}, kimi: {kimi})");
    println!("Messages:  {total_msgs} (user: {user_msgs}, assistant: {assistant_msgs})");
    println!("Tokens:    input: {total_input}, output: {total_output}");

    if let (Some(first), Some(last)) = (sessions.first(), sessions.last()) {
        println!(
            "Period:    {} — {}",
            first.start_time.format("%Y-%m-%d"),
            last.start_time.format("%Y-%m-%d")
        );
    }

    let mut projects: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
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

    println!("\nTop projects:");
    for (name, count) in projects.iter().take(15) {
        println!("  {count:>4}  {name}");
    }
}
