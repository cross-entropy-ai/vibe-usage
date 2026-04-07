# Release

1. Update version in `Cargo.toml`
2. Commit and tag:

```bash
git tag v0.x.0
git push origin v0.x.0
```

GitHub Actions will automatically build all platforms, create a GitHub Release, and update the [Homebrew formula](https://github.com/cross-entropy-ai/homebrew-tap).
