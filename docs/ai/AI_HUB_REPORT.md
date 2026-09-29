# AI Provider Hub — final report

## 1. Summary and artifact identity

- **Branch:** `ai-hub`, from `phase-4` @ `1a9883f` (`docs/ai/IMPLEMENTATION_PLAN.md` §"Scope"; `NEXT_ACTION.md`). `1a9883f`
  holds the Phase 4 work and is code-identical to the staging image `flowline:e42667d`.
- **Final code SHA:** **`c2fd494`** (product code). Later commits on `ai-hub` change only evidence, docs and test
  infrastructure (`FLOWLINE_TEST_NEXT=start`); the release record is the branch HEAD that contains this report.
- **No immutable image digest exists for this work.** Every gate below ran against the local test stack
  (`pnpm dev:test`, or a `next start` production build run manually) on the reviewer's machine, not a built/pushed
  release image. Compare Phase 3/4, where the verified artifact was a docker image with a `sha256:` digest
  (`NEXT_ACTION.md` "Phase 3" / "Phase 4" sections). No equivalent `flowline:<sha>` image has been built or gated for
  `ai-hub`. Any "final" SHA filled into this report identifies a **commit**, not an immutable build.
- **Scope:** an owner-approved, cloud-only, multi-provider AI hub replacing the earlier Anthropic/local-inference
  requirement (`docs/ai/IMPLEMENTATION_PLAN.md` §"Scope"). Local inference (Ollama) is removed from execution; legacy
  configurations are preserved read-only and refused with a migration error (`docs/ai/MIGRATION.md`).
- **Commits since the Phase 4 baseline (`1a9883f..HEAD`):** foundation + coverage + routing (Wave A/B), a combined
  security design for credentials in the UI (`docs/security/CREDENTIALS_DESIGN.md`), three rounds of independent
  Codex security/protocol review and fixes (CXH-01…21), a Chrome exploratory QA pass and retest (CXQ-01…05), and test
  fixes (TEST-03/04/05). Full list: `git log --oneline 1a9883f..HEAD`.

## 2. Verdicts

### CORE IMPLEMENTATION — DONE (contract-tested; live NOT RUN)

- Registry, routing, execution, pricing and connection modules exist in `src/ai/hub/` per the planned architecture
  (`docs/ai/IMPLEMENTATION_PLAN.md` §2). `src/ai/provider.ts` / `chat.ts` are thin facades over `execute.ts`
  (same source, "Architecture: extend, don't replace").
- Five protocols implemented: `openai-chat`, `openai-responses`, `anthropic-messages`, `gemini`, `cohere-v2`
  (`docs/ai/ROUTING.md` §5; `SCOPE_MATRIX.md` AIH-09, "PASS (contract, deterministic double; live NOT RUN)").
- Routing policies MANUAL / FALLBACK / FREE_ONLY / LOW_COST, retries, circuit breaker, streaming, cancellation and
  budget/metering are implemented and integration-tested against deterministic test doubles
  (`docs/ai/ROUTING.md`; `SCOPE_MATRIX.md` AIH-13, AIH-14 "PASS (deterministic)").
- One expand-only migration (`drizzle/0012_ai_hub.sql` plus later 0016–0019) adds `ai_connection`, `ai_model`,
  `ai_connection_model`, `ai_attempt`, `ai_policy`, never converting legacy `workspace.ai_provider = 'ollama'`
  (`docs/ai/IMPLEMENTATION_PLAN.md` §2 "Data model"; `docs/ai/MIGRATION.md`).
- Gate evidence at the last **fully completed** merged browser run (`22de627`): lint/typecheck clean, unit 285,
  contract 465, integration 460/460 twice, Chromium 65/65, Firefox 24/24, WebKit 24/24, all first attempt
  (`artifacts/ai-hub/gate-final-22de627/GATE.md`). The final gate on `c2fd494` is in §"MERGED BROWSER VERIFICATION"
  below.

### EXPANSION COVERAGE

Source: `docs/ai/PROVIDERS.md`, `artifacts/ai-hub/research/providers-2026-09-29.md`, `SCOPE_MATRIX.md` AIH-10/AIH-11.
"Live" is **NOT RUN** for every row (no owner keys entered); status below is CONTRACT VERIFIED unless noted.

| Provider | Category | Status | Reason / evidence |
|---|---|---|---|
| OpenAI | Core | Implemented | Chat + Responses; `docs/ai/PROVIDERS.md` |
| Anthropic | Core | Implemented | Native Messages only (OpenAI-compat layer is test-only, not used); `docs/ai/PROVIDERS.md` |
| Google Gemini API | Core | Implemented | "Suitable with limits" — limited free tier trains/reviews; `docs/ai/PROVIDERS.md` |
| xAI | Core | Implemented | Terms only readable as search excerpts — legal review flagged; `docs/ai/PROVIDERS.md` |
| Groq | Core | Implemented | — |
| OpenRouter | Core (gateway) | Implemented | Gateway route; privacy routing refused by default (no documented control); `docs/ai/ROUTING.md` §2 |
| Mistral AI | Core | Implemented | Terms only readable as search excerpts — legal review flagged |
| Cohere | Core | Implemented | "Weakest" suitable-with-limits; SaaS §4(a)(i) legal review flagged |
| DeepSeek | Core | Implemented | Peak prices only; off-peak unpriced |
| Z.ai (GLM) | Core | Implemented | Pay-as-you-go attestation required; static catalogue (no list endpoint) |
| Moonshot (Kimi) | Core | Implemented, pending legal review | §3.2(6) credential-sharing clause; trains by default → privacy-refused |
| MiniMax | Core | Implemented, provisional | Pay-as-you-go ToS could not be read |
| Alibaba Model Studio (DashScope) | Core | Implemented | Workspace-domain endpoint only; Singapore prices only |
| OpenCode Zen | Core | **Unsuitable** | ToS: "own internal use…not on behalf of…any third party" |
| Command Code Provider API | Core | **Unsuitable, pending owner review** | Forbids sublicensing/transfer + "automated requests"; three official pages disagree on plan/API access |
| Cerebras | Expansion | Implemented | $5 trial credits (30-day expiry); prices unknown |
| Together AI | Expansion | Implemented | 403 = context too long |
| Fireworks AI | Expansion | Implemented, legal review | §1.2(d) credential-sharing clause |
| DeepInfra | Expansion | Implemented, legal review | §11(a)(viii) clause; listing is public (not a key check) |
| Hugging Face Inference Providers | Expansion | Implemented | Chat + Responses(beta); features vary per routed provider |
| Cloudflare Workers AI | Expansion | Implemented, legal review | §2.2.1(a) clause; live check pending for field names |
| Vercel AI Gateway | Expansion (gateway) | Implemented | Public listing; needs a card even for free-credit models |
| NVIDIA API catalog | Expansion | **Unsuitable** | Trial Terms §1.2/§1.4: evaluation only, not production |
| GitHub Models | — | **Retired, not added** | Retired 2026-07-30 (inference API + BYOK); recorded `RETIRED_NOT_ADDED` only |
| Amazon Bedrock | Deferred (enterprise) | Documented, not built | SigV4/Bedrock API keys, no `/models` on the runtime host |
| Azure OpenAI / Foundry | Deferred (enterprise) | Documented, not built | No global catalogue; deployment names as model ids |
| Google Vertex AI | Deferred (enterprise) | Documented, not built | Service-account/OAuth credential handling needed |

Totals: 15 core + 8 expansion = 23 candidate providers, of which 20 are connectable (`docs/ai/CONNECTING.md`: "20
providers can be connected"), 3 unsuitable (OpenCode Zen, Command Code, NVIDIA), plus 3 deferred enterprise clouds
documented only and 1 retired provider recorded but never registered. Registry total is 26 entries
(`SCOPE_MATRIX.md` AIH-02: "26 entries with cited sources").

### LIVE CLOUD VERIFICATION = BLOCKED

No owner API keys have been entered through the UI, and no owner-approved spend budget exists
(`docs/ai/PROVIDERS.md` "LIVE VERIFIED… NOT RUN for any provider. Needs owner keys and a budget (Wave C, AIH-17)";
`SCOPE_MATRIX.md` AIH-17 "PLANNED"). Every one of the following is **NOT RUN**:

- All 20 connectable providers' auth/discovery/inference calls against real vendor endpoints.
- All 5 protocol adapters (`openai-chat`, `openai-responses`, `anthropic-messages`, `gemini`, `cohere-v2`) against a
  real provider — only test doubles (`e2e/fakes/ai-protocols.ts`) have exercised them.
- Streaming and cancellation against a real SSE stream.
- Tool calls and structured output against a real model.
- Routing policies FALLBACK / FREE_ONLY / LOW_COST choosing between real, priced routes.
- Cost/usage reconciliation against a real provider-reported cost.
- Out-of-balance / rate-limit / moderation error handling against a real error response.
- Key verification (`CONNECTED` vs `Key not verified`) against a real credential, including the providers whose
  listing is documented as public (DeepInfra, Vercel) and so require a disclosed paid test (`docs/ai/CONNECTING.md`).
- The Copilot benchmark on a hosted model (§"COPILOT QUALITY" below).
- The AI-hub Codex security review's concurrency/OAuth/rotation findings — verified only in code and against
  PostgreSQL test fixtures, never a live provider or a live OAuth exchange
  (`artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md` "Review limits").

### COPILOT QUALITY = EXPERIMENTAL

- The only benchmark run to date used the **local Ollama model `qwen2.5:7b`**, historically, in Phase 4: **5/12**
  correct-or-safe-refusal against a target of ≥10/12, so Copilot is labelled **Experimental** in the UI
  (`SCOPE_MATRIX.md` P4-02). This result is reported here as **historical** — it predates the AI hub and did not use
  a cloud connection.
- A hosted-model benchmark (12 frozen cases, EN + AR, ≤3 routes + a stability repeat) is specified but **PLANNED**,
  requiring an owner-approved, bounded budget (`SCOPE_MATRIX.md` AIH-16; `docs/ai/IMPLEMENTATION_PLAN.md` §5 "Copilot
  benchmark: no paid calls without an explicit, bounded owner budget"). It has **not been run** against any cloud
  provider.

### UI ONBOARDING — DONE (deterministic)

- Settings → AI Providers: add a connection (name + key + provider fields), validate/save without a paid inference
  call, discover, pick a model, use it — entirely in the UI, no `.env` edit or restart
  (`docs/ai/IMPLEMENTATION_PLAN.md` §3a; `docs/ai/CONNECTING.md`).
- `SCOPE_MATRIX.md` AIH-21 "PASS (deterministic)": E2E types the key in the UI (no model-provider env keys present);
  persists across reload, sign-out/in and a web/worker restart (also proven directly in
  `artifacts/ai-hub/gate-final-22de627/GATE.md` "Restart persistence").
- Reusable, searchable ModelPicker with capability/provider/cost/context/lifecycle filters, used on AI steps, agents
  and Copilot (`SCOPE_MATRIX.md` AIH-07).

### CREDENTIAL ISOLATION — DONE (deterministic; not live-verified)

- `ai.manage` (owner: connect/rotate/disconnect/policy) is separate from `ai.use`/`use_roles` (who may select a
  connection); both are enforced server-side, including a permission change mid-run
  (`docs/ai/IMPLEMENTATION_PLAN.md` §2 "Permissions"; `SCOPE_MATRIX.md` AIH-03, AIH-22).
- Graphs/agents/Copilot/queued jobs hold a `connectionId` only; the worker resolves the key server-side, so a
  scheduled run works with the browser closed (`docs/ai/IMPLEMENTATION_PLAN.md` §3a).
- No tenant path reads a model-provider environment variable; a missing/revoked connection fails clearly with no
  fallback to another connection, a server key, or an environment variable
  (`docs/ai/IMPLEMENTATION_PLAN.md` §3a; `docs/ai/ROUTING.md` §1; `SCOPE_MATRIX.md` AIH-23 "PASS").
- Secret-leakage canary scans (HTML, browser storage, API responses, logs, run meta, evidence) passed in both the
  gate E2E and the Chrome QA pass (`SCOPE_MATRIX.md` AIH-24; `artifacts/ai-hub/chrome-qa-756d69c/REPORT.md` journey 1
  and journey 9; `artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md` journey 1).
- **Not established:** real per-provider isolation against a live account (e.g. a real revoked key actually failing
  at the vendor). All isolation proofs used test doubles or PostgreSQL fixtures.

### MERGED BROWSER VERIFICATION = **PASS on the production build of `c2fd494`; dev-stack runs show INTERMITTENT-02 stalls**

Record: `artifacts/ai-hub/gate-final-c2fd494/GATE.md`. Single worker, retries 0, test doubles only (not live cloud).

- **Production build** (`FLOWLINE_TEST_NEXT=start`: `next build` + `next start`, same fakes, worker and DB):
  Chromium **66/66**, Firefox **24/24** twice, WebKit **24/24** twice, all first attempt: 0 failures in 5 full suite
  runs (`prod-build/gate-*.txt`; Playwright JSON summaries `prod-build/results-{chromium,firefox}.json` report 0
  unexpected, 0 flaky). Both WebKit logs end `24 passed … exit=0`.
- **Dev stack** (`next dev`): Chromium 66/66; Firefox 23/24 twice (attempt 1 `phase3:42` invite link never appeared;
  attempt 2 `phase3:102` revealed key never appeared, trace lost); WebKit 23/24 (`phase3:102`, `page.goto` never
  reached load). Restart persistence passed (phase 1 + 2).
- The dev-stack stalls are filed as **INTERMITTENT-02** (see §8). The earlier merged gate on `22de627` (Chromium 65/65,
  Firefox 24/24, WebKit 24/24; `artifacts/ai-hub/gate-final-22de627/GATE.md`) predates the CXQ-05 fix.
- Non-browser gates on the final code: lint/typecheck clean, unit 285, contract 465, integration 460.

### CHROME QA

Agent-driven exploratory QA (not human UAT), test doubles only, no live cloud
(`artifacts/ai-hub/chrome-qa-756d69c/REPORT.md`). Original pass: 9 PASS / 2 FAIL, P0 0, P1 0, P2 2, P3 2. Retest on
`22de627`: 4/4 original findings fixed, 4/4 regression journeys pass, **1 new finding (CXQ-05)**
(`artifacts/ai-hub/chrome-qa-756d69c/retest-22de627/RETEST.md`).

| ID | Severity | Summary | Status |
|---|---|---|---|
| CXQ-01 | P2 | Arabic provider catalogue kept English-only explanatory prose (free use, data use, terms) | **FIXED**, verified in retest (`retest-22de627/RETEST.md`) |
| CXQ-02 | P2 | Run inspector labelled a converted currency cost as `costMicros` (off by 10^6, display only; stored accounting was correct) | **FIXED**, verified in retest |
| CXQ-03 | P3 | `fallbackFrom` structured metadata rendered as `[object Object]` | **FIXED**, verified in retest |
| CXQ-04 | P3 | Phone usage table had zero horizontal gutter between columns | **FIXED**, verified in retest |
| CXQ-05 | P2 (new, found in retest) | Model picker kept a stale workspace price after a successful price save, until reload | **Fixed in `c2fd494`** (commit message + `docs/ai/PROVIDERS.md`/price-key placeholder note in the same commit) — **pending Codex retest**; no retest artifact exists in this worktree |

### PRIVATE BETA — unchanged: still blocked by Phase 4 external items

The AI hub does not remove any Phase 4 blocker. Per `SCOPE_MATRIX.md` (Phase 4 section) and `NEXT_ACTION.md`
"Phase 4 — launch candidate & private beta: PAUSED for owner credentials":

- P4-08 live integration certification: BLOCKED, needs dedicated Sheets/Gmail/Slack/GitHub test accounts.
- P4-10 real Google/GitHub sign-in: BLOCKED, needs OAuth apps.
- P4-11 beta environment on a real host: PARTIAL, BLOCKED on domain/DNS + VPS.
- P4-05/06 real email delivery: BLOCKED, needs a Resend/Postmark account.
- P4-07 real Paddle sandbox flow: BLOCKED, needs a Paddle sandbox account + client-side token.
- P4-17/18/20 manual Chrome QA / acceptance journeys / beta load check: PLANNED.
- Verdicts so far (unchanged by this work): CODE COMPLETE PASS · BETA INFRA VERIFIED BLOCKED · PRIVATE BETA READY
  NO · PUBLIC PRODUCTION NO.

### PUBLIC PRODUCTION APPROVED = **NO**

Owner authorisation only (`SCOPE_MATRIX.md`, both the Phase 4 verdicts table and `AGENTS.md` "Production deployment,
live payments and release-scope changes need explicit owner approval"). Nothing in this work changes that.

## 3. Security review history (CXH-01…21, TEST-03/04/05, INTERMITTENT-01/02)

Source: `artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md` (original, on `84f2cc1`) and three retests
(`CODEX-RETEST-cceeb5d.md`, `CODEX-RETEST2-f74a5a1.md`, `CODEX-RETEST3-a0b92df.md`), all independent Codex
gpt-6-astra reviews, code/PostgreSQL-fixture only — **no live provider, no live OAuth exchange**
(`CODEX-REVIEW.md` "Review limits").

| ID | Severity | Area | Final status (after retest 3, `a0b92df`) |
|---|---|---|---|
| CXH-01 | P1 | OAuth revocation / app-identity binding | **FIXED** — reopened once (epoch reset on clear+recreate), fixed again in round 2 (`7dd5192`); accepted in retest 3 |
| CXH-02 | P1 | Sign-in credential cache collision after app rotation | **FIXED**, confirmed in retest 1 |
| CXH-03 | P1 | Recovery could re-send + double-charge after a worker death | **FIXED with a stated limitation** (no stored-result reuse — a recovered request is re-sent and both charges ledgered), confirmed in retest 1 |
| CXH-04 | P1 | Agent spend cap didn't aggregate retries/fallback; workspace `allowUnknownCost` bypassed it | **FIXED** — reopened once, fixed again in round 2 (`8f9d8cc`); accepted in retest 3 |
| CXH-05 | P1 | Crypto envelope 64 KiB cap broke run-data payloads up to 256 KiB | **FIXED** (per-purpose caps), confirmed in retest 1 |
| CXH-06 | P1 | Rewrap skipped already-v2 account/social tokens, so key retirement broke them | **FIXED**, confirmed in retest 1 |
| CXH-07 | P2 | Reservation didn't count historical tool-call arguments | **FIXED**, confirmed in retest 1 |
| CXH-08 | P2 | Missing/partial usage silently became a zero-cost reservation release | **FIXED**, confirmed in retest 1 |
| CXH-09 | P2 | Blank listing price strings became a "verified free" zero price | **FIXED** — reopened once (stored false zeros + malformed refresh survived), fixed again in round 2 (migration 0019); accepted in retest 3 |
| CXH-10 | P2 | Workspace OAuth-app rotation/delete had a stale-revision race | **FIXED**, confirmed in retest 1 |
| CXH-11 | P2 | Public (non-authenticated) listing endpoints were treated as a key check | **FIXED** — reopened once (pre-fix rows stayed `keyVerified`), fixed again in round 2; accepted in retest 3 |
| CXH-12 | P2 | Stale health/catalogue writes after disconnect/rotation raced in | **FIXED** — reopened twice (shared catalogue writes outside the fence; then omitted-pricing inherited from an unlocked read), fixed a third time in round 3 (`a0b92df`); accepted in retest 3, with test rigor caveats resolved by CXH-21 |
| CXH-13 | P2 | A removed/unlisted **primary** model failed before the FALLBACK/FREE_ONLY/LOW_COST planner could try alternates | **FIXED** — reopened once (index-based identity after filtering, see CXH-19), fixed again in round 2 (explicit `role: primary\|fallback`); accepted in retest 3 |
| CXH-14 | P2 | OAuth 429/transient refresh failures were treated as a dead grant, expiring valid connections | **FIXED, with a stated limitation** (no in-step retry — the step fails as retryable), confirmed in retest 1; retry wiring added in round 2 |
| CXH-15 | P2 | Malformed SSE chunks silently dropped; incomplete tool-argument JSON became `{}` | **FIXED**, confirmed in retest 1 |
| CXH-16 | P2 | Unrecognised provider error identifiers (incl. a canary secret) were reflected into user-facing errors | **FIXED**, confirmed in retest 1 |
| CXH-17 | P2 (new, retest 1) | Abandonment declared a live attempt dead at 60s with no ownership/lease check; late success couldn't settle | **FIXED** — reopened once (lease check/settlement/reconciliation not atomic), fixed again in round 3 (serialized on the locked `usage_event` row); accepted in retest 3 |
| CXH-18 | P2 (new, retest 1) | A resumed agent tool's reservation was counted twice | **FIXED**, confirmed in retest 2 |
| CXH-19 | P2 (new, retest 1) | After filtering a removed primary, the first fallback inherited primary-refusal semantics, so an allowed second fallback never ran | **FIXED**, confirmed in retest 2 (same fix as CXH-13) |
| CXH-20 | P2 (new, retest 2) | Concurrent catalogue refreshes in opposite provider order could deadlock | **FIXED** (deterministic write order + bounded retry), confirmed in retest 3 |
| CXH-21 | P2, test quality (new, retest 3) | Concurrency regression tests could pass without reaching the intended interleaving (`upTo` swallowed timeouts; `lockWaiting` accepted any ungranted lock) | **Fixed by the lead** (`upTo` removed, `until`-based rendezvous that fails on timeout, `blockedOn(table)` replacing `lockWaiting`) — **Codex retest not run**; no retest artifact exists in this worktree |

**Test-infrastructure defects found and fixed by the lead** (not product bugs; both classified TEST DEFECT):

| ID | Symptom | Cause | Resolution |
|---|---|---|---|
| TEST-03 | CXH-06 rotation tests timed out at 30s on the shared long-lived test DB | Rewrap re-encrypts every envelope in the DB (~10,000 rows accumulated) | Moved to a throwaway per-test DB; assertions and timeout unchanged; 2/2 in ~5s, full suite 460/460 twice |
| TEST-04 | `phase2.spec.ts` template journey failed once in a full-suite Chromium run (drawer showed no connection) | A one-shot read of the connections list raced the async query under full-suite load | `expect.poll` until a real option exists; passed 3/3 alone and in the full suite after |
| TEST-05 | `p3-settings` integration test failed twice with `AI_ATTEMPT_CONFLICT` | Fixed literal `requestId: "t"` collided with ledger keys left by earlier runs (ledger keys are unique across all workspaces, not scoped per workspace — noted as an open P3 hardening item) | Unique request id per run; full suite 460/460 twice |

**Open, honestly unresolved:**

- **INTERMITTENT-01** — cause unknown. An integration test (`ai-review-wavec`, agent-run claim path) failed
  intermittently across two runs on the round-2 merge, never reproduced again in 7 subsequent runs. Hypothesised
  cause: `claimNextAgentRun`'s `FOR UPDATE SKIP LOCKED` returning null while another transaction briefly held the
  row. A bounded retry + diagnostics was added in round 3 as a **mitigation**, not a fix — root cause remains
  unidentified, and Codex's retest-3 assessment states this explicitly: "does not prove the hypothesized lock
  contention caused the original failures. Keep INTERMITTENT-01 labelled mitigated, cause unknown"
  (`artifacts/ai-hub/wavec-84f2cc1/BUGS.md`, `CODEX-RETEST3-a0b92df.md`).
- **INTERMITTENT-02** — OPEN (test infrastructure). Occasional Settings-page stalls on the **dev** test stack only
  (an invite link or revealed key never appears, or `page.goto` never reaches load): once in Phase 4 and 3× at
  `c2fd494`; isolated re-runs pass. Deterministic diagnostics refuted the application hypotheses (input typed and
  submits clicked before hydration both work). A WebKit trace showed one JS chunk with no response while the server
  answered in 58 ms, and the production build ran 0 failures in 5 full suites. Classification: a dev-server artifact,
  **evidence-backed, not proven** (`artifacts/ai-hub/gate-final-c2fd494/GATE.md` "INTERMITTENT-02: classification").
  Recommendation: run release E2E against the production build.

## 4. Credentials in the UI

Design: `docs/security/CREDENTIALS_DESIGN.md`, from two independent reviews (Fable 5.1, Codex gpt-6-astra) plus
owner decisions of 2026-09-29. Status per `SCOPE_MATRIX.md` SEC-01…06:

| Area | Proven | Not live-verified / open |
|---|---|---|
| **Platform admin, bootstrap, MFA** | `platform_admin` principal, `requirePlatformAdmin()` 404-for-non-admin, TOTP enrolment gating the panel, step-up (10 min, session-bound), bootstrap single-use challenge — all integration-tested (SEC-02 "integration PASS") | E2E (`admin-panel.spec`) has been run in the merged browser gates (§2 above shows it passing at 22de627/756d69c/cceeb5d), but a dedicated Codex review + Chrome QA of the admin panel beyond the Wave C review's code-level pass is **PARTIAL** per `SCOPE_MATRIX.md` SEC-02 wording ("Codex review + Chrome QA pending" as originally scoped; the Chrome QA journey 11 in `chrome-qa-756d69c/REPORT.md` exercised it once, PASS, not a full independent QA pass) |
| **Write-only secret handling** | Metadata-only projections (never the value/ciphertext), explicit omitted=keep / ""=400 / revoke-clear semantics, uncontrolled password inputs with autocomplete/1p/lp/bw hints off, canary-absence scans in E2E and Chrome QA (`CREDENTIALS_DESIGN.md` §2 items 7–9; `chrome-qa-756d69c/REPORT.md` journeys 1, 9, 11) | Real providers (Google/Slack/GitHub OAuth apps, email, Paddle) are **not live-verified**; `SCOPE_MATRIX.md` SEC-03 states this explicitly |
| **Rotation with no restart** | better-auth revision-keyed auth factory; billing's indefinite cache removed; integration tests prove rotation is seen by a separate long-lived process with no restart and no paused flows (`CREDENTIALS_DESIGN.md` §2 item 18; `SCOPE_MATRIX.md` SEC-03/SEC-04) | Only proven against test doubles / fake OAuth providers, never a real IdP rotation |
| **Per-workspace OAuth app override** | Owner-only `oauthapp.manage`, consent provenance shown to members, switch/delete expires exactly the affected connections, audited — integration PASS (`SCOPE_MATRIX.md` SEC-05) | E2E provenance/settings spec "written, not run" per `SCOPE_MATRIX.md` SEC-05 at the time that row was last updated; superseded by later merged gates that do include `ai-hub`/`admin-panel` E2E, but no dedicated re-confirmation of this specific spec's run status was found in the artifacts read for this report |
| **Crypto v2 / AAD / key rings** | Per-secret DEK wrapped by a ring KEK, AAD binds table/row/scope/owner/provider/purpose, v1 refused in migrated domains, unit-tested AAD swaps per field (`CREDENTIALS_DESIGN.md` §2 item 4; `SCOPE_MATRIX.md` SEC-01) | KEK-rotation rewrap is "proven in unit tests only" per `SCOPE_MATRIX.md` SEC-01 — no real-database-scale rotation rehearsal beyond TEST-03's throwaway DB is recorded |
| **Audit log** | `platform_audit_event`, ≥730-day retention, transactional, typed, survives `pruneOnce` — integration PASS (`SCOPE_MATRIX.md` SEC-06) | — |

## 5. Distinct discovered models vs. routes

- **Direct routes** call a provider's own API directly (e.g. OpenAI, Anthropic, Groq) with its own protocol.
  **Gateway routes** call an aggregator (OpenRouter, Vercel AI Gateway; Hugging Face Inference Providers also routes
  to an upstream) that fronts several underlying "serving providers"; the hub records `servingProvider` separately
  from the connection's provider on gateway routes (`docs/ai/ROUTING.md` §6 "Where to see it"; `docs/ai/PROVIDERS.md`
  "Core providers" row for OpenRouter). The UI labels direct and gateway routes separately in the model picker
  (`docs/ai/CONNECTING.md` step 7).
- **All model counts to date come from test doubles, not real vendor catalogues.** Discovery has only ever run
  against `e2e/fakes/ai-protocols.ts` or the static curated catalogue (`src/ai/hub/catalogue.ts`), never a live
  `GET /v1/models` call to a real provider. For example, the Chrome QA pass's "OpenAI...returned five models" and
  "Anthropic also connected" (`artifacts/ai-hub/chrome-qa-756d69c/REPORT.md` journey 1) describe the fake's model
  list, not OpenAI's real catalogue.
- The registry itself documents 10 distinct discovery methods (cursor, `pageToken`, `page_token`, `offset`, `page`,
  and static-catalogue for providers with no list endpoint) across the 20 connectable providers
  (`SCOPE_MATRIX.md` AIH-05: "10 discovery methods… static versioned catalogues for Z.ai + Alibaba").
- Two providers (Z.ai, Alibaba) have **no discovery endpoint at all**; their models come from a dated, versioned,
  manually curated catalogue only, and the key itself "proves nothing" via listing — it stays "Key not verified"
  until a disclosed paid test succeeds (`docs/ai/PROVIDERS.md` "Core providers" table; `docs/ai/CONNECTING.md`).

## 6. Low-cost options configured

- **FREE_ONLY:** keeps only routes with a **verified zero price** — an official pricing-page entry or a documented
  free listing (e.g. OpenRouter `:free` variants). Owner-entered zero prices do not count. No-charge quotas that
  can't be confirmed per request (Gemini's free tier, Cloudflare's daily neuron allowance) are refused, not assumed
  free. If nothing qualifies, the call fails closed (`AI_NO_FREE_ROUTE`) before anything is sent
  (`docs/ai/ROUTING.md` §2).
- **LOW_COST:** ranks the resolved route plus an approved pool (≤10), capability-compatible, with a **known** price
  at or under an owner-set ceiling, cheapest-defensible-maximum first. An unknown price is never treated as "within"
  a ceiling; if nothing qualifies, the call fails closed (`AI_NO_ROUTE_WITHIN_CEILING`)
  (`docs/ai/ROUTING.md` §2).
- **Where prices come from:** the workspace's own price table first (`Settings → Usage & limits`, key
  `ai:<provider>/<model>`), then Flowline's dated curated catalogue of official prices; an unknown price stays
  unknown and is never assumed free (`docs/ai/CONNECTING.md` "Costs and routing"). The curated catalogue is version 1,
  checked 2026-09-29, sourced **only** from official pricing pages or a documented list API that reports price
  (OpenRouter, Vercel); no price is invented for providers whose docs don't state one (Mistral, Cerebras, Fireworks,
  Cloudflare, HF, Cohere's current models) (`docs/ai/PROVIDERS.md` "Prices (curated, version 1…)").
- **No real prices have been verified live.** Every accounting example in the evidence (Chrome QA's "OpenAI 2 input
  / 8 output USD per million tokens") is an "illustrative workspace estimate…not provider invoices or verified list
  prices" entered manually for the test doubles (`artifacts/ai-hub/chrome-qa-756d69c/REPORT.md` "Accounting
  evidence"; retest confirms the same caveat).

## 7. Blockers and the smallest exact owner actions

1. **Enter at least 2 provider keys through the UI** to unblock live certification (AIH-17) and the credential-UI
   live checks:
   - Settings → AI Providers → choose a **direct** provider (e.g. OpenAI or Anthropic) → Add connection → paste the
     key → Check and save.
   - Settings → AI Providers → choose a **gateway** provider (e.g. OpenRouter) → Add connection → paste the key →
     Check and save (`docs/ai/CONNECTING.md` steps 1–4).
2. **Approve a bounded benchmark budget** so the Copilot benchmark (12 frozen cases, EN+AR, ≤3 routes + a stability
   repeat) can run on a hosted model instead of only the historical local `qwen2.5:7b` 5/12 result
   (`SCOPE_MATRIX.md` AIH-16; `docs/ai/IMPLEMENTATION_PLAN.md` §5).
3. **Legal review before a public BYOK launch**, specifically:
   - Command Code Provider API: owner/legal must decide whether to approve it at all (sublicensing/transfer
     prohibition, "automated requests" ban, disputed plan coverage) (`docs/ai/PROVIDERS.md` "Unsuitable: the
     evidence").
   - Credential-sharing clauses for Cohere §4(a)(i), Moonshot §3.2(6), Fireworks §1.2(d), DeepInfra §11(a)(viii),
     Cloudflare §2.2.1(a), and terms only readable as search excerpts for xAI and Mistral
     (`docs/ai/PROVIDERS.md` "Legal review before a public BYOK launch").
4. **Phase 4 externals**, unchanged by this work and still required before any private beta: dedicated
   Sheets/Gmail/Slack/GitHub test accounts (P4-08), Google/GitHub OAuth apps (P4-10), a domain + VPS for
   `beta.<domain>` (P4-11), a Resend/Postmark account (P4-05/06), a Paddle sandbox account + client-side token
   (P4-07) (`SCOPE_MATRIX.md` Phase 4 rows; `NEXT_ACTION.md`).
5. **Deployment steps**, in order, before any of the above matters operationally (`docs/ai/MIGRATION.md` "Upgrading
   an existing Phase 4 deployment: required order"):
   1. Set `FLOWLINE_PLATFORM_ENCRYPTION_KEY` (distinct from every workspace key); take a backup.
   2. Deploy — migrations `0012`–`0019` run (expand-only).
   3. Bootstrap the first platform admin (`scripts/admin/bootstrap.mts --email <admin>`), verify email, enrol TOTP.
   4. Import existing Google/Slack/GitHub OAuth apps, sign-in apps, email and Paddle credentials from environment,
      once each, in `/admin`.
   5. Run `scripts/admin/rewrap.mts` repeatedly until `remaining=0`; only then retire old keys (long-running on a
      large database — see TEST-03).
   6. Reconnect or backfill existing Google/Slack/GitHub connections' issuing app provenance.
   7. Have customers add their own AI keys under Settings → AI Providers — nothing is imported automatically.
6. **Release E2E on the production build** (`FLOWLINE_TEST_NEXT=start`), because the dev stack shows INTERMITTENT-02
   stalls (§8).
7. **Codex retest** of CXQ-05 (§2 "CHROME QA") and of CXH-21 (§3) — neither has a retest artifact in this worktree.

## 8. Known limitations

- **No live cloud verification anywhere in this work.** Every "PASS"/"FIXED" above is contract-level or
  integration/E2E-level against deterministic test doubles or PostgreSQL fixtures, never a real provider, real
  OAuth app, or real payment (`docs/ai/PROVIDERS.md`; `artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md` "Review
  limits"; every Chrome QA report header: "TEST DOUBLES ONLY — no live cloud verification").
- **INTERMITTENT-01** remains open with an unconfirmed root cause; a bounded-retry mitigation was added, but Codex's
  own retest-3 language is explicit that this does not prove the hypothesis (`artifacts/ai-hub/wavec-84f2cc1/BUGS.md`).
- **INTERMITTENT-02** (dev-server stalls) remains open as a test-infrastructure issue: seen once in Phase 4 and 3× on
  the `c2fd494` dev stack, never in 5 production-build suite runs (`artifacts/ai-hub/gate-final-c2fd494/GATE.md`).
- **CXH-03's accepted limitation:** recovery after a worker death does not reuse a stored answer — a recovered
  request is re-sent, and both the original and the recovery charge remain in the ledger as separate attempts
  (`artifacts/ai-hub/wavec-84f2cc1/BUGS.md`).
- **CXH-14's accepted limitation:** a transient OAuth refresh failure (e.g. 429) is correctly classified as
  non-fatal, but there is still no in-step retry — the step itself still fails as retryable rather than
  transparently succeeding (`artifacts/ai-hub/wavec-84f2cc1/BUGS.md`).
- **Ledger keys are not scoped per workspace** (noted while fixing TEST-05): request ids must be globally unique
  across all workspaces. All current product callers satisfy this (run/agent-run UUIDs, `randomUUID()`), but it is
  an implicit invariant rather than an enforced one — flagged as open P3 hardening, not changed, to avoid touching
  reviewed ledger code (`artifacts/ai-hub/wavec-84f2cc1/BUGS.md` "TEST-05").
- **Provider model ids for several providers (Anthropic, Gemini, Groq, Z.ai, Alibaba, Cohere) are sourced from
  display names, not a verified API field**, and are flagged "unverified id" in the picker until a live listing
  confirms them (`docs/ai/PROVIDERS.md` "Prices (curated…)").
- **No image, audio, video, embeddings, rerank or local-runtime execution** is in scope; a `transport:
  "local-runner"` slot is reserved but unimplemented (`docs/ai/IMPLEMENTATION_PLAN.md` §4 "Out of scope").
- **Platform-funded AI is not implemented** and would need separate owner approval if ever wanted; it is never an
  implicit fallback (`docs/ai/IMPLEMENTATION_PLAN.md` §3a, §4; `docs/ai/MIGRATION.md`).
- **No immutable release artifact exists for this work** (§1) — everything here describes commits and a local test
  stack, not a built and gated release image comparable to Phase 3/4's `flowline:<sha>` images.
