// build.rs
use std::env;
use std::path::Path;

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let cached = Path::new(&manifest_dir).join("model_prices.json");

    // Re-run build script if the file changes
    println!("cargo::rerun-if-changed=model_prices.json");
    println!("cargo::rerun-if-env-changed=FETCH_PRICES");

    let should_fetch = env::var("FETCH_PRICES").map(|v| v == "1").unwrap_or(false);

    if !cached.exists() || should_fetch {
        let url = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
        let status = std::process::Command::new("curl")
            .args(["-sSfL", "-o", cached.to_str().unwrap(), url])
            .status();
        match status {
            Ok(s) if s.success() => {}
            _ => {
                if !cached.exists() {
                    std::fs::write(&cached, "{}").unwrap();
                    println!("cargo::warning=Failed to fetch model_prices.json, using empty fallback");
                }
            }
        }
    }
}
