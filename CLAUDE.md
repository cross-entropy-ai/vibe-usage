# vibe-usage

## Release Steps

1. Bump `version` in `Cargo.toml`
2. Run `cargo check` to sync `Cargo.lock`
3. Commit all changes (Cargo.toml, Cargo.lock, and feature code)
4. Tag: `git tag v{version}`
5. Push: `git push origin main --tags`
6. Wait for GitHub Actions release workflow to build (produces binaries for 4 platforms)
7. Update release notes: `gh release edit v{version} --notes "..."`
