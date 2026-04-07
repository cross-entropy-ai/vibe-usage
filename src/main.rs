mod analytics;
mod collector;
mod insights;
mod pricing;
mod query;
mod remote;
mod schema;
mod server;

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

use collector::{Collector, build_collectors, default_data_dir, raw_dirs_for, sync_collector};

#[derive(Parser)]
#[command(
    name = "vibe-usage",
    about = "Collect AI coding tool usage into a unified format"
)]
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
            let pricing = Box::new(pricing::PricingConfig::load(&data_dir));
            let state = query::AppState::new(collectors, data_dir, pricing);
            server::serve(state, port).await?;
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

fn do_parse(
    collectors: &[Box<dyn Collector + Send + Sync>],
    data_dir: &PathBuf,
) -> Result<Vec<schema::Session>> {
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
    let stats = analytics::summary(sessions);

    let tool_str = {
        let mut parts: Vec<_> = stats.by_tool.iter().collect();
        parts.sort_by_key(|(k, _)| k.as_str());
        parts
            .iter()
            .map(|(name, count)| format!("{name}: {count}"))
            .collect::<Vec<_>>()
            .join(", ")
    };

    println!("=== Usage Summary ===");
    println!("Sessions:  {} ({tool_str})", stats.total_sessions);
    println!(
        "Messages:  {} (user: {}, assistant: {})",
        stats.messages.total, stats.messages.user, stats.messages.assistant
    );
    println!(
        "Tokens:    input: {}, output: {}",
        stats.tokens.input, stats.tokens.output
    );

    if let (Some(start), Some(end)) = (&stats.period.start, &stats.period.end) {
        println!("Period:    {start} — {end}");
    }

    println!("\nTop projects:");
    for p in stats.top_projects.iter().take(15) {
        println!("  {:>4}  {}", p.sessions, p.name);
    }
}
