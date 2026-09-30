# AI routing, retries and budgets

- **Code:**
  - `src/ai/hub/routing.ts`: route resolution and the policy plan.
  - `src/ai/hub/execute.ts`: the executor (retries, circuit breaker, metering, streaming).
  - `src/ai/hub/pricing.ts`: pricing math.
  - `src/ai/hub/policy.ts`: policy validation.
- **Tests:**
  - `tests/integration/ai-hub-routing.test.ts`
  - `tests/unit/ai-hub-wave-b.test.ts`
  - `tests/contract/ai-*.test.ts`

## 1. Which route a call starts from

1. **Explicit:** a connection test, which always runs under MANUAL.
2. **Pin:**
   - an AI step's `route`;
   - an agent version's `route`. When the agent was saved without a pick, this is a **snapshot** of the workspace
     default at save time;
   - Copilot's planning or repair route from the workspace policy.
3. **The workspace default route.**

A missing, revoked or foreign connection is an error. Resolution never falls back to another connection, a server
key or an environment variable. Legacy Ollama pins fail with `AI_LOCAL_MIGRATION_REQUIRED` and are never
reinterpreted.

## 2. Policies

The workspace owner sets the policy (`ai.manage`, `PUT /api/workspaces/{id}/ai/policy`; partial updates keep the
other fields). It applies to every AI call: steps, agents and Copilot.

| Mode | Routes tried |
|---|---|
| **MANUAL** | The resolved route only. |
| **FALLBACK** | The resolved route, then the **explicitly listed** fallback routes (at most 5), in order. Nothing else, ever. |
| **FREE_ONLY** | The resolved route and the listed routes, keeping only those with a **verified zero price**: a catalogue entry from an official pricing page, or a documented listing (OpenRouter `:free`). Paid and unknown prices are refused. Owner-entered zero prices don't count. If none is left, the call fails closed with `AI_NO_FREE_ROUTE` and nothing is sent. No-charge quotas (Gemini free tier, Cloudflare's daily neurons) can't be confirmed per request, so they are refused. |
| **LOW_COST** | The resolved route and the approved pool (at most 10), **capability-compatible**, with a **known** price at or under the ceiling (input and output per 1M tokens), cheapest defensible maximum first. Unknown prices are never "within" a ceiling. If none is left: `AI_NO_ROUTE_WITHIN_CEILING`, nothing sent. |

**Privacy.** With `requireNoTraining`, every mode refuses any route whose provider doesn't document "no training on
API data".

- **Gateways:** OpenRouter's upstream terms vary, and the research documents no privacy routing control for it, so
  OpenRouter routes are refused rather than assumed safe.
- **Training by default:** Moonshot routes are refused.
- **Unknown terms:** xAI, DeepSeek and MiniMax routes are refused.
- **Result:** `AI_PRIVACY_POLICY`. The refusal is visible in `routesSkipped`.

**Capabilities are tri-state.** Only `UNSUPPORTED` excludes a route. For example, if an OpenRouter listing's
`supported_parameters` lacks `tools`, the route is excluded for a call with tools (`AI_CAPABILITY_UNSUPPORTED`, before
anything is sent). `UNKNOWN` is attempted. Structured output is sent natively only when `SUPPORTED`; otherwise it is
prompted, then validated.

## 3. When a policy moves to the next route

**Moves on after the route's bounded retries are exhausted, or immediately for non-retryable ones:**

- `AI_RATE_LIMITED`, `AI_PROVIDER_ERROR`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_OVERLOADED`
- `AI_STREAM_INTERRUPTED`, `AI_BAD_RESPONSE`, `AI_MODEL_REMOVED`, `AI_MODEL_NOT_LISTED`
- `AI_QUOTA_EXCEEDED` (out of balance on that account), `AI_CIRCUIT_OPEN`, `AI_ROUTING_UNAVAILABLE`
- `AI_CONTEXT_TOO_LONG`, `AI_CAPABILITY_UNSUPPORTED`, `AI_COST_UNKNOWN`, `AI_CONNECTION_CHANGED`,
  `AI_RESPONSE_TOO_LARGE`

**Never moves on:**

- **Auth refusals:** `AI_AUTH_FAILED`, `AI_FORBIDDEN`, and `AI_ROUTE_FORBIDDEN` on the primary route.
- **Connection problems:** `AI_CONNECTION_REVOKED` (including a revocation mid-fallback), `AI_CONNECTION_MISSING`,
  `AI_CREDENTIAL_UNREADABLE`.
- **The provider refused the content:** `AI_SAFETY_REFUSAL`.
- **Cancellation:** a user cancel, or `AI_CANCELLED`.
- **Budget:** `BUDGET_EXCEEDED`, and an agent's own limit, `AGENT_COST_LIMIT`.
- **Forbidden key types:** `AI_PLAN_NOT_ALLOWED`, `AI_TRIAL_KEY`.
- **The request itself is bad:** `AI_BAD_REQUEST`.
- **Policy and account refusals:** `AI_PRIVACY_POLICY`, `AI_REGION_UNSUPPORTED`, `AI_ACCOUNT_ACTION_REQUIRED`.

A **listed** route the acting member may not use (`use_roles`) is skipped, and the next listed route is tried. A
**primary** route's permission refusal is final.

A pinned **primary model that discovery marked removed** (or that is missing from a fresh listing) doesn't stop a
FALLBACK / FREE_ONLY / LOW_COST call before planning: the planner skips it (`routesSkipped`, `AI_MODEL_REMOVED` /
`AI_MODEL_NOT_LISTED`) and tries the approved routes. Under MANUAL it is refused at once, as before. A missing or
revoked connection is still refused at once in every mode.

## 4. Retries, Retry-After and the circuit breaker

- **Retries per route:** up to 3 attempts, for retryable errors only.
  - Backoff is jittered, capped at 8 s.
  - `Retry-After` is honoured up to 30 s. A longer Retry-After isn't waited for: the route counts as exhausted, and
    a policy may move on.
- **Circuit breaker, per connection:**
  - It opens when the last 3 attempts on the connection within 60 s were all transient failures and the latest is
    under 30 s old.
  - While it is open, calls are refused unsent (`AI_CIRCUIT_OPEN`, recorded as `refused`). FALLBACK moves on.
  - The breaker reads `ai_attempt`, so every web and worker process shares it.
- **Stale results are fenced:** health, test and catalogue writes made after a network call only apply while the
  connection still has the credential version the call used and isn't disconnected. A key test that finishes after a
  disconnect never writes CONNECTED over REVOKED, and an old key's model list never overwrites the catalogue after a
  key replacement.
- **Rotation and revocation:** every attempt re-reads the connection, the key and the actor's membership.
  - A key replaced while a call is running: the answer is discarded (`AI_CONNECTION_CHANGED`, retryable) and the
    next attempt uses the new key.
  - A revoked connection: `AI_CONNECTION_REVOKED` is final.

## 5. Streaming and cancellation

- **Streaming is opt-in** (`executeAi({ stream: true, onStream })`). It uses SSE parsers per protocol:
  - OpenAI `chat.completion.chunk` + `[DONE]`;
  - Responses `response.*` events;
  - Anthropic `message_*` / `content_block_*` events, including mid-stream `error` events;
  - Gemini `alt=sse` chunks;
  - Cohere typed events.
- **Tool-call fragments** are assembled by index. A stream that ends before its terminal event (for Chat: before a
  finish reason, even after `[DONE]`) is `AI_STREAM_INTERRUPTED`, never a partial answer.
- **Malformed data is rejected:** a `data:` chunk that isn't a JSON object fails the attempt (`AI_BAD_RESPONSE`,
  possible charge) instead of being skipped; comments and empty keep-alives are still accepted. Tool-call arguments
  that aren't a JSON object (e.g. cut-off JSON) are rejected too; only empty text or `{}` means "no arguments".
- **Provider errors:** only documented error identifiers are named in messages (a fixed vocabulary); unknown codes and
  free-text reasons are dropped, and the submitted key is scrubbed from any error before it is returned or stored.
- **No concatenation across attempts:**
  - Every delta carries its `attemptKey`.
  - When an attempt that streamed fails, a `discard` event follows.
  - The final result is only the answering attempt's text. This holds across models too.
- **Cancellation** (the caller's `AbortSignal`):
  - Reading stops at once.
  - The attempt is recorded as `cancelled` with `possible_charge = true`.
  - Its budget reservation is kept (settled at the defensible maximum), because a sent request may be billed.
- **Reasoning text** (`reasoning_content`, Responses reasoning items, Anthropic thinking, Gemini thought parts, Cohere
  `tool_plan`) is **never** stored or streamed. Only reasoning *token counts* are kept.

## 6. Budgets and metering

- **Every attempt is an `ai_attempt` row:**
  - route, protocol, policy, `route_reason` ("primary", "fallback #1 after AI_PROVIDER_ERROR", "low-cost rank 1 …");
  - outcome `success` / `error` / `timeout` / `interrupted` / `cancelled` / `refused`;
  - non-overlapping tokens: uncached input, cache read, cache write, output, reasoning;
  - `cost_source`: `provider_reported`, `estimated` or `unknown`;
  - `possible_charge`;
  - for gateways, `serving_provider`.
- **Reservation:** before sending, the executor reserves the **defensible maximum**: every input token uncached at
  ~2 characters per token (safe for Arabic), plus every allowed output token, at the higher long-context tier where
  one applies. It reserves under a `FOR UPDATE` lock on the workspace row, so concurrent calls can't jointly exceed
  the cap. This is tested with two concurrent calls.
- **Reconciliation after the call:**
  - **Success:** settled at the real cost. A provider-reported USD cost is used for USD workspaces; otherwise the
    estimated cost.
  - **Error with an HTTP error response:** released (nothing was billed).
  - **Timeout after send, stream cut, or cancellation:** settled at the reservation (possible charge).
  - **Success with no usage reported:** tokens unknown, the ledger keeps the reservation, and `cost_source` is
    `unknown`.
- **Unknown is not 0.** With a hard cap (workspace budget or plan cap) **or an agent's own cost limit**, an
  unknown-price call is refused unsent (`AI_COST_UNKNOWN`) unless the owner allows unknown-cost calls; then it is
  recorded with `cost_source = unknown` (an agent step's cost is `null`), never as 0. That setting never makes an
  unknown price "free" or "within a ceiling".
- **Usage must be complete.** A response whose usage lacks a required count (e.g. `usage: {}`, only a prompt count,
  cached tokens above the prompt total) is **unknown** in every adapter: the ledger keeps the reservation, the
  tokens stay `null`.
- **The reservation counts the whole request:** system prompt, every message including historical tool calls with
  their arguments and tool results, tool definitions and the output schema (JSON-serialised, plus per-message
  framing). The same size is used for LOW_COST ranking and agent limits.
- **Agent cost limit:** enforced inside every reservation the hub makes for an agent run — each retry and each
  fallback route — against everything the run holds in the ledger (settled charges and open reservations, model and
  tool steps). The agent's reported cost is that ledger total, not only the answers it received.
- **Metering:** AI steps, agents and Copilot are all metered by the hub, with ledger keys
  `${requestId}:${attempt}`, so a retried or fallen-back call never double-bills.
- **Recovery:** attempt numbers survive a worker restart. A recovered request continues after the highest attempt
  found in `ai_attempt` or the ledger, and every send reserves a **new** key first; an existing key is never taken as
  permission to send (another process holding it just moves this one to the next number). A reservation left open by
  a worker that stopped (older than 60 s, no attempt record) is settled at its reservation and recorded as an
  `interrupted` attempt with `possible_charge = true` (`AI_ATTEMPT_ABANDONED`). No answer is reused across a
  recovery: the hub keeps no answer text outside the run's encrypted step data, so the request is sent again and both
  charges stay in the ledger (step meta `recoveredAttempts`). An agent model retry never replays
  a tool: failed attempts return nothing, and only a successful turn's proposals reach ALLOW / ASK / DENY.

## 7. Where to see it

- **Run step meta:** `provider`, `connectionId`, `protocol`, `policy`, `routeReason`, `fallbackFrom[]` (route + the
  error that moved the call on), `routesSkipped[]` (privacy / price / capability / unresolvable), `servingProvider`,
  `costMicros`, `costSource`.
- **Run events:** `ai_fallback` (from → to, and the error), `step_retry`, `budget_blocked`.
- **Agent steps:** `args.policy`, `routeReason`, `fallbackFrom`, `costSource`.
