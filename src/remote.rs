use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, bail};
use serde::Deserialize;

use crate::collector::hostname;

#[derive(Deserialize)]
struct Config {
    remote: String,
}

/// Read remote address from `<data_dir>/config.toml`.
fn load_config(data_dir: &Path) -> Result<Config> {
    let path = data_dir.join("config.toml");
    let text = std::fs::read_to_string(&path).with_context(|| {
        format!(
            "missing config: {}\nCreate it with:\n  remote = \"user@host:~/.vibe-usage\"",
            path.display()
        )
    })?;

    let config: Config = toml::from_str(&text).context("parse config.toml")?;
    Ok(config)
}

/// Push local hostname's raw data to remote.
/// `rsync -az ~/.vibe-usage/raw/<hostname>/ remote:raw/<hostname>/`
pub fn push(data_dir: &Path) -> Result<()> {
    let config = load_config(data_dir)?;
    let host = hostname();
    let local = data_dir.join("raw").join(&host);

    if !local.exists() {
        bail!("no local data at {}", local.display());
    }

    // Ensure trailing slash for rsync
    let src = format!("{}/", local.display());
    let dest = format!("{}/raw/{}/", config.remote, host);

    eprintln!("pushing {} → {}", src, dest);

    // --rsync-path trick: create remote dir before transfer (macOS rsync lacks --mkpath)
    let (_remote_host, remote_path) = dest.split_once(':').context("invalid remote format")?;
    let rsync_path = format!("mkdir -p {} && rsync", remote_path);

    let status = Command::new("rsync")
        .args([
            "-az",
            "--progress",
            "--rsync-path",
            &rsync_path,
            &src,
            &dest,
        ])
        .status()
        .context("failed to run rsync")?;

    if !status.success() {
        bail!("rsync failed with exit code {:?}", status.code());
    }

    eprintln!("push complete");
    Ok(())
}

/// Pull all raw data from remote.
/// `rsync -az remote:raw/ ~/.vibe-usage/raw/`
pub fn pull(data_dir: &Path) -> Result<()> {
    let config = load_config(data_dir)?;
    let local_raw = data_dir.join("raw");
    std::fs::create_dir_all(&local_raw)?;

    let src = format!("{}/raw/", config.remote);
    let dest = format!("{}/", local_raw.display());

    eprintln!("pulling {} → {}", src, dest);

    let status = Command::new("rsync")
        .args(["-az", "--progress", &src, &dest])
        .status()
        .context("failed to run rsync")?;

    if !status.success() {
        bail!("rsync failed with exit code {:?}", status.code());
    }

    eprintln!("pull complete");
    Ok(())
}
