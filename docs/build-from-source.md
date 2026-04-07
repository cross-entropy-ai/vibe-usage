# Build from Source

Requires Rust 1.80+ and Node.js 18+.

```bash
# Build frontend
cd web && npm install && npx vite build && cd ..

# Build backend (embeds frontend dist into the binary)
cargo build --release
```

The resulting binary at `target/release/vibe-usage` is self-contained. Frontend assets are embedded, so no extra files are needed.
