# Web Dashboard

`vibe-usage serve` starts an HTTP server with:

- Summary cards (sessions, messages, tokens, cost)
- Activity heatmap + punchcard
- Cost breakdown (API equivalent vs subscription, savings)
- Token trends by tool/model/day
- Tool call chains and file type distribution
- Cache efficiency and thinking ratio
- Language detection and task classification
- Project lifecycle timelines
- And more (20+ chart components)

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/summary` | Overview stats |
| `GET /api/sessions?tool=&from=&to=&project=&limit=&offset=` | Filtered session list |
| `GET /api/tokens/daily` | Daily tokens by tool |
| `GET /api/tokens/by-model` | Tokens per model |
| `GET /api/tools/usage` | Tool call frequency |
| `GET /api/tools/status` | Tool call success/error rates |
| `GET /api/projects` | Per-project aggregation |
| `GET /api/hosts` | Per-hostname aggregation |
| `GET /api/duration` | Time spent (daily + by project) |
| `GET /api/activity/heatmap` | Hour x weekday session counts |
| `GET /api/cost` | Cost analysis with subscription support |
| `GET /api/messages/latency` | Response latency percentiles |
| `GET /api/git/activity` | Sessions by git repo/branch |
| `GET /api/directories` | Sessions by working directory |
| `GET /api/insights/conversations` | Depth, prompt/response lengths |
| `GET /api/insights/cache-efficiency` | Cache hit rates |
| `GET /api/insights/thinking` | Thinking token ratios |
| `GET /api/insights/toolchains` | Tool call sequences + file types |
| `GET /api/insights/project-lifecycle` | Weekly project activity |
| `GET /api/insights/model-switches` | Mid-session model changes |
| `GET /api/insights/languages` | Language + task classification |
| `GET /api/insights/session-complexity` | Complexity by hour of day |
