mod analytics;
mod collector;
mod insights;
mod pricing;
mod query;
mod remote;
mod schema;
mod server;
#[allow(dead_code)]
mod agent;

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

use collector::{Collector, build_collectors, default_data_dir, raw_dirs_for, sync_collector};

#[derive(Parser)]
#[command(
    name = "vibe-usage",
    about = "Local-first usage analytics for AI coding tools.\n\nRun without subcommands to sync data and open the dashboard in your browser."
)]
struct Cli {
    /// Which tools to operate on (gemini, claude, codex, kimi). Omit for all.
    #[arg(short, long, value_delimiter = ',', global = true)]
    tools: Option<Vec<String>>,

    /// Data directory (default: ~/.vibe-usage, or $VIBE_USAGE_DATA_DIR)
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
    /// Start web dashboard (syncs data first, opens browser automatically)
    Serve {
        /// Port to listen on (auto-finds available port if busy)
        #[arg(short, long, default_value = "3000")]
        port: u16,
        /// Host address to bind to
        #[arg(long, default_value = "0.0.0.0")]
        host: String,
        /// Don't open browser automatically
        #[arg(long)]
        no_browser: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let data_dir = resolve_data_dir(cli.data_dir);
    let collectors = build_collectors(&cli.tools);

    match cli.command {
        Some(Command::Sync) => {
            do_sync(&collectors, &data_dir)?;
        }
        Some(Command::Analyze { output, summary }) => {
            do_sync(&collectors, &data_dir)?;
            let sessions = do_parse(&collectors, &data_dir)?;
            output_sessions(&sessions, output, summary)?;
        }
        Some(Command::Push) => {
            do_sync(&collectors, &data_dir)?;
            remote::push(&data_dir)?;
        }
        Some(Command::Pull) => {
            remote::pull(&data_dir)?;
        }
        Some(Command::Serve { port, host, no_browser }) => {
            do_sync(&collectors, &data_dir)?;
            let pricing = Box::new(pricing::PricingConfig::load(&data_dir));
            let state = query::AppState::new(collectors, data_dir, pricing);
            server::serve(state, &host, port, !no_browser).await?;
        }
        None => {
            // Default: sync then serve
            do_sync(&collectors, &data_dir)?;
            let pricing = Box::new(pricing::PricingConfig::load(&data_dir));
            let state = query::AppState::new(collectors, data_dir, pricing);
            server::serve(state, "0.0.0.0", 3000, true).await?;
        }
    }

    Ok(())
}

fn resolve_data_dir(cli_data_dir: Option<PathBuf>) -> PathBuf {
    if let Some(path) = cli_data_dir {
        return path;
    }
    if let Some(path) = std::env::var_os("VIBE_USAGE_DATA_DIR") {
        return PathBuf::from(path);
    }
    default_data_dir()
}

fn do_sync(collectors: &[Box<dyn Collector + Send + Sync>], data_dir: &PathBuf) -> Result<()> {
    for c in collectors {
        eprint!("syncing {}...", c.name());
        match sync_collector(c.as_ref(), data_dir) {
            Ok(stats) => {
                eprint!(" {} copied, {} up-to-date", stats.copied, stats.skipped);
                if stats.errors.is_empty() {
                    eprintln!();
                } else {
                    eprintln!(", {} failed", stats.errors.len());
                    for e in &stats.errors {
                        eprintln!("  warn: {e}");
                    }
                }
            }
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
        let mut all_warnings = Vec::new();
        for raw_dir in dirs {
            match c.parse(&raw_dir) {
                Ok(result) => {
                    count += result.sessions.len();
                    all_warnings.extend(result.warnings);
                    all_sessions.extend(result.sessions);
                }
                Err(e) => eprintln!(" error in {}: {e}", raw_dir.display()),
            }
        }
        eprint!(" {} sessions", count);
        if all_warnings.is_empty() {
            eprintln!();
        } else {
            eprintln!(", {} skipped", all_warnings.len());
            for w in &all_warnings {
                eprintln!("  warn: {w}");
            }
        }
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
