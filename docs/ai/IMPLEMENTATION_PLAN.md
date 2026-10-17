# AI Provider Hub: implementation plan

**Scope:** an owner-approved, cloud-only, multi-provider AI hub. It replaces the earlier "Anthropic or local inference"
requirement for the web release and changes nothing else in Phases 1–4.

- **Original baseline:** `ai-hub`, from `phase-4` @ `1a9883f`. This is the historical plan; the hub and design-v2
  code are now present together in the audited checkout `9641ad1`. See `AI_HUB_REPORT.md` for dated evidence and
  `../../NEXT_ACTION.md` for current verification limits.

## 1. Current AI paths (source checked 2026-10-03)

| Path | Code | Today |
|---|---|---|
| Workflow AI nodes (`ai.generate` / `ai.extract` / `ai.classify`) | `worker/handlers.ts` `aiNode` → `resolveRoute` / `executeAi` | Workspace BYOK route, policy and hub metering. Node route pins take precedence over the workspace default; legacy local pins are refused. |
| Agents | `worker/agent-runner.ts` → `src/ai/chat.ts` `chat` / `resolveAgentRoute` | Cloud hub. An agent version snapshots its route (the picked one, else the workspace default) when saved; with neither it stores none and uses the workspace default at run time. The model proposes tools; the runtime applies ALLOW/ASK/DENY. The hub meters every attempt and enforces agent cost limits. |
| Copilot generate + repair | `src/server/copilot.ts` → `src/ai/provider.ts` `getAiProvider` → `executeAi` | Policy plan/repair routes, typed validation, preview/diff, approval, draft-only save. Hub-metered. |
| Knowledge | `src/server/knowledge.ts` | **No model calls.** Postgres full-text search; "No embedding model is used or claimed". Nothing to migrate. Embeddings/rerank stay out of scope (§4). |
| Background tasks | worker `retention`, `runner` | No AI calls. |
| Settings | `src/app/w/[slug]/settings/ai-providers.tsx`, `/api/workspaces/[wid]/ai/*` | Workspace connections, default route and routing policy; no model-provider env keys. |
| Credentials | `ai_connection`; `src/ai/hub/connections.ts`, `credentials.ts` | AI keys use context-bound v2 encryption, credential versions, role checks and metadata-only projections. SaaS credentials remain in `connection`. |
| Egress | `src/ai/hub/transport.ts` → `src/server/egress.ts` `safeFetch` | Per-provider host allowlists, DNS pinning and private-address protection; test overrides require `FLOWLINE_ENV=test`. |
| Deployment | `docker-compose.staging.yml`, `.env.example` | No local inference runtime. Infrastructure/operator configuration remains separate from workspace BYOK. |

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

- **`src/ai/hub/`**:
  - `registry.ts`: the provider definition manifest (id, name, tier core/expansion/deferred, docs + terms sources,
    verification date, auth scheme, allowed hosts, protocols per model family, discovery method, status
    IMPLEMENTED / UNSUITABLE / PENDING / DEFERRED);
  - `protocols/*`;
  - `transport.ts`, `discovery.ts`, `routing.ts`, `pricing.ts`, `execute.ts`, `connections.ts`.
- **`src/ai/provider.ts` / `chat.ts` are facades** over `execute.ts`; workflow AI nodes call the hub directly.
  Hub execution owns AI-attempt metering; callers retain workflow/tool approval and idempotency boundaries.
- **No new orchestration engine or gateway service.** Protocols are hand-written against official REST docs
  (small, testable, SSRF-controlled via `safeFetch`). Vendor SDKs would bypass `safeFetch`, so they are not used for
  transport; this choice is documented in `ADDING_A_PROVIDER.md`.

### Data model (0012 foundation plus later migrations)

| Table | Purpose |
|---|---|
| `ai_connection` | Workspace BYOK connection: provider, label, context-bound v2 `secret_enc` + `key_id`, validated provider-specific settings (no arbitrary base URL), `use_roles` (default `["owner"]`: connecting does **not** grant members), status NOT_CONFIGURED/CONNECTED/DEGRADED/REVOKED, `verification` IMPLEMENTED/CONTRACT_VERIFIED/LIVE_VERIFIED, `last_tested_at`, `last_error`, `cred_version`, `created_by`. LIVE_VERIFIED has no automatic promotion path. |
| `ai_model` | Public catalogue snapshot per provider: model id, author, serving provider, protocol, capabilities (tri-state), limits, modalities, lifecycle, prices + source + verified date, free-tier notes, privacy provenance, `snapshot_version`, `stale`. |
| `ai_connection_model` | Credential-specific access: which models this connection's listing returned (`listed`), `access_confirmed_at` (a successful inference), last error. |
| `ai_attempt` | Per attempt: workspace, run/agentRun/copilot request id, node id, route (provider + connection ref + model + protocol), policy, attempt #, outcome, latency, tokens (input / output / cache-read / cache-write / reasoning; non-overlapping), price snapshot, `cost_source` provider_reported / estimated / unknown, cost, error code. |
| `workspace.ai_policy` (JSONB column, not a table) | Mode, ordered routes, price ceiling, privacy flags, `allowUnknownCost`, Copilot plan/repair routes. Nodes and agent versions pin routes, not separate policies. |

- **Legacy:** `workspace.ai_provider = 'ollama'`, `agent_version.provider = 'ollama'` and Ollama node overrides are
  kept, read-only. Executing them fails with `AI_LOCAL_MIGRATION_REQUIRED` and a message saying what to pick. They are
  never converted silently. A migration banner lists affected items.
- **Snapshots:** the published version and run records store the **resolved route**, so a later change to the
  workspace default doesn't change a published flow. Without a default at publish time its AI steps stay unpinned
  and use the default at run time.

### Permissions

- `ai.manage` (owner): connect, rotate and disconnect connections; set defaults and policies. Arbitrary custom endpoints are not accepted.
- `ai.use`: choose routes, and only on connections whose `use_roles` includes the member's role. This is checked at
  selection AND at execution, so a mid-run permission change is honoured.

## 3. Waves

| Wave | Delivers | Gate |
|---|---|---|
| **A — foundation** | Schema + migration; registry; `openai-chat` protocol + transport + SSRF host policy; connections (configure, auth test, optional disclosed inference test, rotate, disconnect) with the existing crypto; discovery (pagination, cache, refresh, stale, malformed rejection); route resolution + MANUAL policy; `execute.ts` wired into AI nodes with metering + `ai_attempt`; Settings → AI Providers; reusable ModelPicker (on the AI node); legacy local migration errors; test-only doubles | Deterministic E2E: connect → discover → select → run → inspect result/usage/cost; isolation + permission + redaction + error tests |
| **B — coverage + routing** | Protocols `openai-responses`, `anthropic-messages`, `gemini`, `cohere-v2`; the 15 core providers; expansion where the documented API fits; agents + Copilot on the hub (pickers, snapshots); FALLBACK / FREE_ONLY / LOW_COST; budgets with defensible max + reconciliation; streaming + cancellation; tool calls + structured output per route; research record per provider | Core adapters contract-tested; expansion status explicit; routing + cost controls tested across protocols |
| **C — certification + QA** | Live certification on authorised connections (BLOCKED without keys); Copilot benchmark (≤3 routes + a stability repeat, within an approved budget); cumulative regression; Codex security/protocol/metering review + Chrome QA; fixes + retest; docs + report | Verdicts (§12 of the prompt) |

## 3a. Owner clarification (2026-09-29): customer keys through the UI only

Customer AI credentials are connected, tested, used, rotated and disconnected **entirely in Flowline**:
Settings → AI Providers → provider → Add connection (name + key + provider-specific account/project fields) →
validate/save → discover → select model → use in workflow / Agent / Copilot.

- No terminal, server, `.env` edit, developer or restart is needed.
- Multiple connections per provider, explicit workspace default, health + verification, Test, Replace key, Disconnect,
  and an affected-workflows preview.
- After save, only metadata + a masked indicator are shown; the raw key never comes back.
- The key is never in browser storage, drafts, URLs, telemetry, logs, run meta or QA evidence.
- MANAGE (`ai.manage`) is separate from USE (`use_roles`). Graphs, agents, Copilot settings and queued jobs hold a
  `connectionId` only; the worker resolves it server-side, so scheduled runs work with the browser closed.
- **No tenant path reads a model-provider env var.** The app starts with all of them absent.
- A missing or revoked connection fails clearly and **never** falls back to a global or operator key.
- Platform-funded AI stays disabled (a future, separately approved option).
- Legacy env keys are not imported into workspaces.
- Infrastructure secrets (DB, auth, encryption, Flowline OAuth apps, email, billing/webhooks) stay operator-managed
  and are never shown in customer settings.
- Customer OAuth integrations keep their Connect/consent flow.

Acceptance (AIH-21…AIH-24):
- UI onboarding with no env keys;
- persistence across refresh, sign-out/in and a web/worker restart;
- two-workspace key isolation;
- server-side manage/use enforcement;
- replace/disconnect with queued work and cache invalidation;
- no global fallback;
- a secret-leak scan (responses, HTML, browser storage, logs, evidence) using a canary key.

The E2E enters the key through the UI; no DB seeding and no `.env` as a substitute.

## 4. Out of scope

- Local model runtimes (Ollama, LM Studio, vLLM, llama.cpp), browser inference and a desktop companion are outside
  the AI hub. The separate Company Builder owner-only CLI prototype does not add a hub inference provider.
- Enterprise clouds (Bedrock, Azure, Vertex): documented, not built.
- Image/audio/video execution.
- Embeddings and rerank: no knowledge path uses them today.
- A future local runner: extension point only (a `transport: "local-runner"` slot reserved in the registry type,
  unimplemented).
- Platform-funded routes: not implemented; a future option needing separate owner approval, never an implicit fallback (§3a).

## 5. Risks and decisions

- **Hand-written protocol clients over SDKs,** so that every byte goes through `safeFetch` (SSRF, size limits,
  timeouts) and the tests use the same code as production.
- **Live verification needs owner keys.** Without them: IMPLEMENTED / CONTRACT VERIFIED only, with live checks
  BLOCKED.
- **Copilot benchmark:** no paid calls without an explicit, bounded owner budget.
