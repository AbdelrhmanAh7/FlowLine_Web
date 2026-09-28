# AI Provider Hub: implementation plan

**Scope:** an owner-approved, cloud-only, multi-provider AI hub. It replaces the earlier "Anthropic or local inference"
requirement for the web release and changes nothing else in Phases 1–4.

- **Branch:** `ai-hub`, from `phase-4` @ `1a9883f`. That commit holds the Phase 4 work and is identical in code to the
  staging image `flowline:e42667d`.
- **Separate work:** the `design-v2` branch (colour/motion design system, owner-approved, in progress) is independent
  and not touched here.

## 1. Baseline: today's AI paths (verified 2026-09-29)

| Path | Code | Today |
|---|---|---|
| Workflow AI nodes (`ai.generate` / `ai.extract` / `ai.classify`) | `worker/handlers.ts` `aiNode` → `src/ai/provider.ts` `getAiProvider` | Single-shot generate. Provider is `ollama` or `anthropic` from env (`FLOWLINE_AI_PROVIDER`, `FLOWLINE_AI_MODEL`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`) or the workspace default (`workspace.ai_provider/ai_model`). Node `cfg.model` overrides the model. Metered with `reserveUsage` → `settleUsage` / `releaseUsage` (`src/server/usage.ts`); price from `workspace.prices` (`ai:<provider>/<model>`). |
| Agents | `worker/agent-runner.ts` → `src/ai/chat.ts` `chat` / `resolveModel` | Tool-calling chat, Ollama + Anthropic only. The model only proposes tools; the runtime applies ALLOW/ASK/DENY. `agent_version.provider/model` holds the pin. Per call: metered `ai` + per-step `agent_step`. |
| Copilot generate + repair | `src/server/copilot.ts` → `getAiProvider` | Schema-constrained patch proposal; typed validation, preview/diff, approval, draft-only save. Metered. |
| Knowledge | `src/server/knowledge.ts` | **No model calls.** Postgres full-text search; "No embedding model is used or claimed". Nothing to migrate. Embeddings/rerank stay out of scope (§4). |
| Background tasks | worker `retention`, `runner` | No AI calls. |
| Settings | `settings/ai-defaults.tsx`, `PATCH /api/workspaces/[wid]` | Workspace default provider/model, chosen among `configuredProviders()` (env). |
| Credentials | `connection` table (`encryptSecret` / `decryptSecret`, `key_id`, `cred_version`, status) | Used by SaaS integrations. **AI keys are server env only today.** |
| Egress | `src/server/egress.ts` `safeFetch` | Blocks private, link-local and metadata addresses, with DNS pinning; `FLOWLINE_EGRESS_ALLOWLIST` exception (used for staging Ollama). |
| Deployment | `docker-compose.staging.yml` (`OLLAMA_BASE_URL`, egress allowlist to host Ollama), `.env.example` | Local inference is referenced only here. |

## 2. Architecture: extend, don't replace

```
UI (Settings → AI Providers, ModelPicker)
  → server authorisation (access.ts + capabilities ai.use / ai.manage + per-connection useRoles)
  → route resolution (explicit → agent/node pin → workspace default) + execution policy
      (MANUAL | FALLBACK | FREE_ONLY | LOW_COST), capability check (tri-state, route level), privacy,
      budget reservation (defensible max; unknown price refused under a hard cap)
  → protocol transport (per route: openai-chat | openai-responses | anthropic-messages | gemini | cohere-v2)
      over safeFetch + per-provider host allowlist, manual redirects, no cross-origin credential forwarding
  → response normalisation (text, tool calls, JSON, usage incl. cache/reasoning tokens, provider-reported cost)
  → durable records: ai_attempt (per attempt) + usage_event (budget) + run step meta (route snapshot)
```

- **`src/ai/hub/`** (new):
  - `registry.ts`: the provider definition manifest (id, name, tier core/expansion/deferred, docs + terms sources,
    verification date, auth scheme, allowed hosts, protocols per model family, discovery method, status
    IMPLEMENTED / UNSUITABLE / PENDING);
  - `protocols/*`;
  - `transport.ts`, `discovery.ts`, `routing.ts`, `pricing.ts`, `execute.ts`, `connections.ts`.
- **The existing `src/ai/provider.ts` / `chat.ts` become thin facades** over `execute.ts`. Callers
  (`aiNode`, agent runner, Copilot) keep their metering, approval and idempotency code paths; only the provider call
  changes.
- **No new orchestration engine or gateway service.** Protocols are hand-written against official REST docs
  (small, testable, SSRF-controlled via `safeFetch`). Vendor SDKs would bypass `safeFetch`, so they are not used for
  transport; this choice is documented in `ADDING_A_PROVIDER.md`.

### Data model (one expand-only migration)

| Table | Purpose |
|---|---|
| `ai_connection` | Workspace BYOK connection: provider, label, `secret_enc` + `key_id` (existing crypto), non-secret settings (account/region/base URL for approved custom endpoints), `use_roles` (default `["owner"]`: connecting does **not** grant members), status NOT_CONFIGURED/CONNECTED/DEGRADED/REVOKED, `verification` IMPLEMENTED/CONTRACT_VERIFIED/LIVE_VERIFIED, `last_tested_at`, `last_error`, `cred_version`, `created_by`. |
| `ai_model` | Public catalogue snapshot per provider: model id, author, serving provider, protocol, capabilities (tri-state), limits, modalities, lifecycle, prices + source + verified date, free-tier notes, privacy provenance, `snapshot_version`, `stale`. |
| `ai_connection_model` | Credential-specific access: which models this connection's listing returned (`listed`), `access_confirmed_at` (a successful inference), last error. |
| `ai_attempt` | Per attempt: workspace, run/agentRun/copilot request id, node id, route (provider + connection ref + model + protocol), policy, attempt #, outcome, latency, tokens (input / output / cache-read / cache-write / reasoning; non-overlapping), price snapshot, `cost_source` provider_reported / estimated / unknown, cost, error code. |
| `ai_policy` (jsonb on workspace + node/agent config) | Mode, ordered routes, price ceiling, privacy flags, `allow_unknown_cost`. |

- **Legacy:** `workspace.ai_provider = 'ollama'`, `agent_version.provider = 'ollama'` and Ollama node overrides are
  kept, read-only. Executing them fails with `AI_LOCAL_MIGRATION_REQUIRED` and a message saying what to pick. They are
  never converted silently. A migration banner lists affected items.
- **Snapshots:** the published version and run records store the **resolved route**, so a later change to the
  workspace default doesn't change a published flow.

### Permissions

- `ai.manage` (owner): connect, rotate and disconnect connections; set defaults, policies and custom endpoints.
- `ai.use`: choose routes, and only on connections whose `use_roles` includes the member's role. This is checked at
  selection AND at execution, so a mid-run permission change is honoured.

## 3. Waves

| Wave | Delivers | Gate |
|---|---|---|
| **A — foundation** | Schema + migration; registry; `openai-chat` protocol + transport + SSRF host policy; connections (configure, auth test, optional disclosed inference test, rotate, disconnect) with the existing crypto; discovery (pagination, cache, refresh, stale, malformed rejection); route resolution + MANUAL policy; `execute.ts` wired into AI nodes with metering + `ai_attempt`; Settings → AI Providers; reusable ModelPicker (on the AI node); legacy local migration errors; test-only doubles | Deterministic E2E: connect → discover → select → run → inspect result/usage/cost; isolation + permission + redaction + error tests |
| **B — coverage + routing** | Protocols `openai-responses`, `anthropic-messages`, `gemini`, `cohere-v2`; the 15 core providers; expansion where the documented API fits; agents + Copilot on the hub (pickers, snapshots); FALLBACK / FREE_ONLY / LOW_COST; budgets with defensible max + reconciliation; streaming + cancellation; tool calls + structured output per route; research record per provider | Core adapters contract-tested; expansion status explicit; routing + cost controls tested across protocols |
| **C — certification + QA** | Live certification on authorised connections (BLOCKED without keys); Copilot benchmark (≤3 routes + a stability repeat, within an approved budget); cumulative regression; Codex security/protocol/metering review + Chrome QA; fixes + retest; docs + report | Verdicts (§12 of the prompt) |

## 4. Out of scope

- Local runtimes (Ollama, LM Studio, vLLM, llama.cpp), browser inference and a desktop companion.
- Enterprise clouds (Bedrock, Azure, Vertex): documented, not built.
- Image/audio/video execution.
- Embeddings and rerank: no knowledge path uses them today.
- A future local runner: extension point only (a `transport: "local-runner"` slot reserved in the registry type,
  unimplemented).
- Platform-funded routes: supported by the model, disabled unless explicitly configured with a budget.

## 5. Risks and decisions

- **Hand-written protocol clients over SDKs,** so that every byte goes through `safeFetch` (SSRF, size limits,
  timeouts) and the tests use the same code as production.
- **Live verification needs owner keys.** Without them: IMPLEMENTED / CONTRACT VERIFIED only, with live checks
  BLOCKED.
- **Copilot benchmark:** no paid calls without an explicit, bounded owner budget.
