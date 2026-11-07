# remesa-agent · agent

TypeScript runtime for the remittance-timing agent (Claude + tool use, Stellar escrow).

## Run

```bash
cp .env.example .env     # fill in values; never commit .env
npm install
npm run chat             # interactive console against the agent (needs Anthropic credentials)
npm start                # run the agent loop (workers only)
npm run start:managed    # run under the process manager (auto-restart, crash alerts)
npm run typecheck && npm test
```

## LLM provider

Set `AI_PROVIDER` in `.env`:

| `AI_PROVIDER` | Required | Optional |
|---|---|---|
| `anthropic` (default) | Credentials via `ANTHROPIC_API_KEY` or `ant auth login` | `AGENT_MODEL`, `AGENT_LIGHT_MODEL`, `AGENT_EFFORT`, `AGENT_MAX_TOKENS`, `AGENT_FALLBACKS` |
| `openai` | `OPENAI_BASE_URL`, `OPENAI_MODEL` (no defaults; startup fails without them) | `OPENAI_API_KEY`, `OPENAI_LIGHT_MODEL`, `OPENAI_MAX_TOKENS` |

The OpenAI provider uses the Chat Completions API, so any compatible endpoint works (OpenAI, Azure, vLLM, Ollama, LM Studio, ...).

## Layout

| Path | Purpose |
|---|---|
| `index.ts` | Entrypoint: loads config, starts the `Agent`, handles signals, optional `--chat` console |
| `ProcessManager.ts` | Supervisor: restarts on crash, log rotation, Discord webhook alerts |
| `agent/runtimeConfig.ts` | Loads `.env` and exposes typed, frozen config |
| `agent/Agent.ts` | Orchestrator: cache, tools and workers lifecycle |
| `ai/config.ts` | Model defaults and the stable system prompt |
| `ai/ModelManager.ts` | Role → model profiles (`primary`, `light`) |
| `ai/LLMClient.ts` | Picks the provider from `AI_PROVIDER` and opens conversations |
| `ai/providers/` | `AnthropicProvider` (adaptive thinking, effort, caching, refusal fallbacks) and `OpenAIProvider` (Chat Completions, configurable endpoint) |
| `ai/ConversationManager.ts` | One provider conversation per id + provider-neutral tool-use loop |
| `tools/` | `ToolRegistry` and tool implementations; register new tools in `tools/index.ts` |
| `workers/` | Periodic jobs (`Worker` base, `RateWatcher` placeholder) |
| `managers/` | `LogManager` (winston) and `CacheManager` (Redis with in-memory fallback) |
| `types/`, `utils/` | Shared types and helpers |
| `tests/` | `node:test` unit tests |

## Next steps

- `tools/price/`: USDC→COP rate source, used by `RateWatcher` and exposed as a tool.
- `policy/`: the decision rules from the root README (target rate, average, deadline).
- `tools/stellar/`: escrow `release` / `get_escrow` calls.
- `tools/notify/`: recipient notifications.
