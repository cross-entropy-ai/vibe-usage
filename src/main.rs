#[allow(dead_code)]
mod agent;
mod analytics;
mod cli;
mod collector;
mod insights;
mod litellm;
mod pricing;
mod query;
mod remote;
mod schema;
mod server;

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

use collector::{Collector, build_collectors, default_data_dir, sync_collector};

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
        Some(Command::Push) => {
            do_sync(&collectors, &data_dir)?;
            remote::push(&data_dir)?;
        }
        Some(Command::Pull) => {
            remote::pull(&data_dir)?;
        }
        Some(Command::Serve {
            port,
            host,
            no_browser,
        }) => {
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
    let s = cli::style();
    let w = collectors.iter().map(|c| c.name().len()).max().unwrap_or(0);
    for c in collectors {
        eprint!(
            "  {dim}syncing {bold}{name:<w$}{reset}{dim}…{reset}",
            dim = s.dim, bold = s.bold, reset = s.reset, name = c.name()
        );
        match sync_collector(c.as_ref(), data_dir) {
            Ok(stats) => {
                eprint!(
                    " {green}✓{reset} {copied:>4} copied, {skipped:>4} up-to-date",
                    green = s.green,
                    reset = s.reset,
                    copied = stats.copied,
                    skipped = stats.skipped
                );
                if stats.errors.is_empty() {
                    eprintln!();
                } else {
                    eprintln!(
                        ", {yellow}{n} failed{reset}",
                        yellow = s.yellow,
                        reset = s.reset,
                        n = stats.errors.len()
                    );
                    for e in &stats.errors {
                        eprintln!(
                            "    {yellow}warn:{reset} {e}",
                            yellow = s.yellow,
                            reset = s.reset
                        );
                    }
                }
            }
            Err(e) => eprintln!(" {red}✗{reset} {e}", red = s.red, reset = s.reset),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {}
