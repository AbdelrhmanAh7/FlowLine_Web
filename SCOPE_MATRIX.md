# Scope matrix — Flowline

Legend. **Type:** `DESIGN` = required by the Product UI Design deck or the phase prompt; `EXTENSION` = added beyond the deck.
**Status:** `PASS` = verified by the evidence listed · `PARTIAL` = implemented with a documented gap · `FAIL` · `BLOCKED` · `PLANNED` = a later phase (not started).
Slide numbers refer to `design-reference/slides/slide-NN.png`. Evidence paths are relative to the repo root; `e2e:` = `e2e/*.spec.ts` test, `int:` = `tests/integration`, `unit:` = `tests/unit`.
Nothing has been removed to make the gate easier to pass. Rows for later phases stay listed as `PLANNED`.

## Phase 1: interface and foundation

| ID | Requirement | Source | Type | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|---|
| P1-01 | Landing page on the product tokens; CTAs lead to auth | s2, s5 | DESIGN | Landing renders; Start free → sign-up | PASS | e2e: journey; screenshots `landing-{1440,1024,375}` |
| P1-02 | Split-screen auth, email sign-up/sign-in, secure sessions | s6, prompt C | DESIGN | New user signs up through the UI; `/api/me` 401 when signed out | PASS | e2e: journey, tenancy "unauthenticated…"; `auth-signup-*` |
| P1-03 | Google/GitHub OAuth prepared but shown as unavailable unless configured | s6, prompt C | DESIGN | Buttons `aria-disabled` + reason when env vars are unset | PASS | e2e: journey (Google disabled); `src/app/api/auth-config` |
| P1-04 | Skippable 3-step onboarding (workspace → goal → first flow) | s2, s6 | DESIGN | Journey completes all 3 steps; Skip creates a workspace | PASS | e2e: journey; `onboarding-goal-1440`; Codex report |
| P1-05 | Workspaces + membership roles (owner/editor/viewer) enforced server-side | prompt A4, C | DESIGN | Viewer can read but gets 403 on edit; non-member gets 404 | PASS | int: tenancy (viewer 403, outsider 404) |
| P1-06 | Dashboard: KPIs from real data, flows table, activity feed with actions | s7 | DESIGN | Populated/empty/error states; Inspect links | PASS | `dashboard-populated-*`; e2e: tenancy (B sees only own flow) |
| P1-07 | Builder canvas: add nodes (click, drag, `/` search), connect, validate connections | s8, prompt D | DESIGN | Drag 4 nodes, connect 3 edges with real mouse drags; invalid edge refused with a reason | PASS | e2e: journey, canvas "invalid connections…"; unit: checkConnection |
| P1-08 | Select, multi-select, duplicate, delete | s8, s15, prompt D | DESIGN | Ctrl+D duplicates, Del deletes, trigger can't be duplicated (explained) | PASS | e2e: canvas "select, duplicate…" |
| P1-09 | Node drawer (Configure/Test/Logs), settings persisted | s8, prompt D | DESIGN | Edit expression → autosave → reload → value persists | PASS | e2e: journey (reload check) |
| P1-10 | Zoom / pan / Fit, minimap, dot-grid, 12px snap | s8, s15 | DESIGN | Zoom −/+ / Fit; Ctrl+0 | PASS | e2e: canvas |
| P1-11 | Autosave, Unsaved state, save-error handling | s8, s13, prompt D | DESIGN | Faults → "Failed to save — retrying" → Saved; exhausted → Retry | PASS | e2e: failures "save failure…" |
| P1-12 | Undo/redo | prompt D | EXTENSION | Ctrl+Z / Ctrl+Shift+Z restore/re-apply | PASS | e2e: canvas; DESIGN_DECISIONS §5 |
| P1-13 | Local nodes: Manual trigger → JSON transform → Condition → Output (no AI key) | prompt E | DESIGN | Engine unit tests + real worker run | PASS | unit: engine (12); int: runs; e2e: journey |
| P1-14 | Backend execution in a separate worker; step states + results persisted | prompt B, E | DESIGN | Run → worker → run_step rows re-read from DB | PASS | int: runs "claims with SKIP LOCKED…"; e2e: journey (API check) |
| P1-15 | Flows, versions and runs stored in the DB (not only localStorage) | prompt C | DESIGN | Revision bumps; `run` + `save` + `overwrite` versions | PASS | int: flows; e2e: journey, failures (overwrite version) |
| P1-16 | Reload/restart doesn't lose data; stale runs recovered | prompt E | DESIGN | Reload keeps graph; `recoverStaleRuns` requeues | PASS | e2e: journey (reload); int: runs (stale recovery) |
| P1-17 | Run inspector: history, filters, search, step timeline, Input/Output/Error, suggested fix | s9 | DESIGN | Inspect a failed run; filters + Clear filters | PASS | `run-inspector-failed-*`; e2e: journey, canvas re-run; `state-empty-runs-1440` |
| P1-18 | Re-run from a step (upstream outputs reused) | s9, s13 | DESIGN | Re-run from the condition → upstream `reused` | PASS | e2e: canvas "re-run…"; int: runs |
| P1-19 | Run dock (Ctrl/⌘+J) | s14, s15 | DESIGN | Ctrl+J toggles; opens on run | PASS | e2e: canvas, journey |
| P1-20 | Integrations page shows its real configuration state (0 connected, disabled Connect with reason) | s10, prompt I | DESIGN | No fake connections | PASS | `integrations-*`; DESIGN_DECISIONS D7 |
| P1-21 | Templates: local templates create a flow and open the canvas; integration templates disabled with reason | s11 | DESIGN | Use template → canvas | PASS | e2e: library "templates…"; `templates-*`; Codex REPORT/RETEST |
| P1-22 | Settings: members (real), general (name/timezone persisted), API keys/billing honest state | s12, prompt I | DESIGN | Owner saves name/timezone; others disabled with reason | PASS | e2e: library "settings…"; Codex RETEST; `settings-*`. Invite/keys/billing themselves are Phase 3 (P3-04..06) |
| P1-23 | Design tokens: colours, radii, focus ring, Inter + JetBrains Mono | s3, s4 | DESIGN | Tokens in `globals.css @theme`; visual comparison | PASS | `src/app/globals.css`; artifacts/phase-1/visual-review |
| P1-24 | State matrix: loading skeleton (no full-screen spinner), empty, populated, error + recovery, degraded | s13, prompt F | DESIGN | Skeleton while the flow loads; load fault → Retry; worker-offline banner | PASS | `state-loading-builder-1440`, `state-error-load-1440`, `state-empty-*`; e2e: failures "load failure…" |
| P1-25 | Offline: local draft (per user, non-sensitive), run disabled, reconcile without silent overwrite | s13, prompt F | DESIGN | Offline edit → reconnect saves; server changed → conflict banner → explicit choice | PASS | e2e: failures "offline…", "offline conflict…"; `state-offline-builder-1440` |
| P1-26 | Drafts isolated by user and cleared on sign-out | prompt F | DESIGN | Draft key includes the user id; sign-out wipes | PASS | e2e: tenancy "sign-out clears local drafts"; `src/lib/drafts.ts` |
| P1-27 | Responsive: desktop ≥1280 (240 sidebar, 360 drawer), tablet 768–1279 (48 rail, overlay + scrim), mobile <768 | s14, prompt G | DESIGN | Sidebar width at 1440/1280/1279/1024/768/767/375; drawer 360 / sheet; no horizontal scroll | PASS | e2e: responsive (10 tests) |
| P1-28 | Mobile = monitoring only (editing disabled, persistent banner, bottom sheet 92vh) | s14, prompt G | DESIGN | Drag doesn't move nodes; fields disabled; run works | PASS | e2e: responsive "mobile is monitor-only"; `builder-mobile-monitor-375` |
| P1-29 | Tablet swipe-to-dismiss drawer; two-finger pan/pinch | s14 | DESIGN | Swiping the drawer header right dismisses it at 1024 | PASS | e2e: responsive "builder drawer…" (swipe). Pinch/pan are React Flow built-ins, not separately automated |
| P1-30 | Keyboard map: ⌘↵ run, / search, ⌘J dock, ⌘0 fit, ⌘D duplicate, Del delete, Esc, arrows nudge 12 (Shift 1) | s15 | DESIGN | All exercised with a real keyboard | PASS | e2e: canvas, journey (Ctrl+Enter) |
| P1-31 | Delete/Run shortcuts inactive while typing | prompt H | DESIGN | Backspace/Delete/Ctrl+Enter inside a field don't delete or run | PASS | e2e: canvas "typing guards" |
| P1-32 | Focus-visible double ring; reduced motion; no hover lifts; motion ≤300ms | s15, prompt H | DESIGN | CSS tokens + `prefers-reduced-motion` block | PASS | `globals.css`; Codex report §focus/reduced-motion |
| P1-33 | Every button works or explains why it's disabled; no fake success | prompt B, I | DESIGN | Disabled controls carry `aria-describedby` reasons | PASS | e2e: failures (Run reason), journey (OAuth); Codex report |
| P1-34 | Demo data / fault injection only in the separate test env | prompt I | DESIGN | `/api/test/faults` returns 404 unless `FLOWLINE_ENV=test` | PASS | `src/server/faults.ts`; int: flows (fault) |
| P1-35 | Tenant isolation: two users in separate workspaces can't see each other's flows or runs | acceptance | DESIGN | UI + API with a second browser context | PASS | e2e: tenancy; int: tenancy |
| P1-36 | Invalid flow handling | acceptance | DESIGN | Run blocked with reasons; API 422 | PASS | e2e: failures "invalid flow…"; int: runs |
| P1-37 | Reproducible setup: Docker Postgres, migrations, separate test DB, secret-free `.env.example`, pinned versions + lockfile | prompt A4 | DESIGN | `pnpm db:up && pnpm db:migrate`; lockfile committed | PASS | README; `docker-compose.yml`; `drizzle/`; `pnpm-lock.yaml` |
| P1-38 | Lint / typecheck / unit / integration / E2E checks | prompt A4 | DESIGN | All green on the final SHA | PASS | artifacts/phase-1/REPORT.md (counts) |
| P1-39 | Screenshots at 1440/1024/375 + breakpoint edges; comparison with the design app area | acceptance | DESIGN | Captured; differences recorded and fixed | PASS | artifacts/phase-1/screenshots; artifacts/phase-1/visual-review/VISUAL-REVIEW.md |
| P1-40 | Agent-driven exploratory browser test (Codex), fixes, retest | acceptance | DESIGN | Codex report → fixes → Codex retest | PASS | artifacts/phase-1/codex-review/REPORT.md (2 findings on `edeb6a8`) → RETEST.md (18/18 PASS on `c35485e`, 0 new findings) |
| P1-41 | Docs: SCOPE_MATRIX, DESIGN_DECISIONS, docs/implementation, rules in CLAUDE.md/AGENTS.md | prompt | DESIGN | Files present | PASS | repo root, docs/implementation |
| P1-42 | Worker-offline degraded banner; runs queue | s13 (degraded ≠ blocked) | EXTENSION | Health endpoint → banner | PASS | `src/components/shell/app-shell.tsx`; `/api/health` |
| P1-43 | Expression sandbox: separate heap-capped process, hard timeout, size limits; worker lease guards; run rate/size limits | security | EXTENSION | ReDoS/huge allocation contained; lost lease writes nothing | PASS | unit: sandbox (7); int: worker lease (4); artifacts/phase-1/reviews/fable-security-review.md |
| P1-44 | Light-mode token remap | s3 | DESIGN | — | PLANNED (P3) | DESIGN_DECISIONS D11 |

## Phase 2: automation and integrations

Evidence keys: `int:` = `tests/integration/<file>`, `contract:` = `tests/contract`, `unit:` = `tests/unit`, `e2e:` = `e2e/phase2.spec.ts` unless named, `live:` = `tests/live` (results in `artifacts/phase-2/live-results.json`), `codex:` = `artifacts/phase-2/codex-review`.
Rows P2-01…P2-13 are the design rows planned in Phase 1; P2-14 onwards are the Phase 2 prompt's requirements.

| ID | Requirement | Source | Type | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|---|
| P2-01 | Integration connections (OAuth/API key/basic/connection string), encrypted, scoped, per-connection health | s10, prompt | DESIGN | Connect via OAuth (state+PKCE) and API key; secret never returned | PASS | e2e: template journey (OAuth through the UI); contract: oauth; int: p2-actions (isolation, refresh race, denied refresh) |
| P2-02 | Expired token → only affected flows pause; Reconnect banner; same account; nothing auto-runs | s10, s13, prompt | DESIGN | Revoke → affected flow paused, other flow runs; reconnect with another account refused; same account restores without a run | PASS | int: p2-actions "expired auth pauses only…", "a denied refresh…"; int: p2-review-fixes L1 (same provider); codex: journey 9 |
| P2-03 | Integration catalog computed from real adapters, with verification level | s10, prompt | DESIGN | 12 providers listed from the registry; badges adapter / contract / live | PASS | `/api/integrations/catalog`; e2e: library, mobile; contract (82) |
| P2-04 | Signed webhook trigger: signature, dedupe, duplicates, ordering, failure after acceptance, replay | s5, s8, s11, prompt | DESIGN | Bad/stale signatures 401; same event id → same run; concurrent duplicates → 1 run; crash after acceptance keeps the run; replay under a new id refused | PASS | int: p2-triggers (5), p2-review-fixes M3 (2) |
| P2-05 | Schedule trigger: time zone, DST, missed-run policy, concurrent schedulers | s7, s11, s12, prompt | DESIGN | skip / run_once / run_all; two schedulers fire once; DST spring/fall | PASS | int: p2-triggers (5); unit: engine-v2 DST (3) |
| P2-06 | AI nodes (generate/extract/classify, schema JSON) record provider, model, tokens; no hard-coded model names or prices | s4, s8, prompt | DESIGN | Schema-valid JSON; usage settled once; model from config | PASS | int: p2-execution (AI); live: ai-ollama (real `qwen2.5:3b`) |
| P2-07 | App actions for 12 providers; adapter / contract / sandbox-live distinguished | s8, s11, prompt | DESIGN | Contract tests vs provider doubles; live identity per provider | PARTIAL — live BLOCKED for 11 SaaS | contract (82); live: Postgres PASS; 11 SaaS BLOCKED (no sandbox credentials) |
| P2-08 | The six design templates create independent, runnable flows with required connections, no fake counts | s11, prompt | DESIGN | Each template runs end-to-end; independence; setup placeholders block runs | PASS | int: p2-templates (9); e2e: template journey; e2e: library |
| P2-09 | Durable usage ledger, unique events, enforced spending limits | s7, s9, prompt | DESIGN | Budget refusal before the call; racing reservations never overshoot; AI billed once across a re-run | PASS | int: p2-execution (budget, race); e2e: template journey (usage) |
| P2-10 | Node "Test" from the drawer | s8 | DESIGN | Latest input/output + isolated expression preview; side-effecting nodes are exercised via "Re-run from this step" with a preview | PASS | node-drawer Test tab; DESIGN_DECISIONS D17 |
| P2-11 | Provider-slow / retry degraded states | s13 | DESIGN | "Running… 12s · provider slow", "retry 2 (rate limited)" from real step timing/events | PASS | unit: run-status (4); e2e: cancel test (provider slow) |
| P2-12 | Retries with backoff+jitter by error type, timeouts, cancellation | s13, prompt | DESIGN | 429 Retry-After retried; 5xx bounded; cancel queued/running mid-request | PASS | int: p2-actions "429…", p2-execution (retry, cancel); e2e: cancel |
| P2-13 | Flow activation status (Active / Paused / Expired) on the dashboard | s7 | DESIGN | Status from the published trigger + connection state | PASS | dashboard `flowStatus`; e2e: dashboard status |
| P2-14 | Queue + separate worker, leases, heartbeats, checkpoints/resume | prompt | DESIGN | Lost lease writes nothing; stale run requeued; resume keeps finished steps with real values | PASS | int: runs (lease, stale), p2-actions (crash resume), p2-review-fixes M4 |
| P2-15 | Immutable published versions; run linked to version, input and permission policy | prompt | DESIGN | UPDATE on a version rejected; a queued run executes its own version after an edit | PASS | int: p2-engine (2) |
| P2-16 | Run states incl. waiting_approval; step skipped and uncertain external outcome | prompt | DESIGN | Pause/uncertain/skip paths | PASS | unit: engine-v2; int: p2-actions (review) |
| P2-17 | Per-workspace concurrency and queue limits; run timeout; rate limit | prompt | DESIGN | Extra runs held; quota refuses | PASS | int: p2-execution (2) |
| P2-18 | Graph validation (types, references, connections), branching, bounded loops, parallel/join, versioned subflows | prompt | DESIGN | Invalid graphs refused; merges; loops bounded; subflow pinned; unpublished/foreign/self refused | PASS | unit: engine-v2 (validation, joins); int: p2-engine (subflows) |
| P2-19 | Lost response on a non-idempotent action → verify or human review; no blind retry | prompt | DESIGN | Drop after/before commit; no verify → review; crash mid-call; a retry decision is one-shot | PASS | int: p2-actions (4), p2-review-fixes M1/M2 (3) |
| P2-20 | Re-run from a step: known revision, preview, side-effect risk, re-authorization, no duplicates | prompt | DESIGN | Original vs latest revision; a demoted user's queued re-run refused; Sheets fault → UI re-run → one row | PASS | int: p2-engine (2), p2-actions "upstream message, rows and billing are not repeated"; e2e: template journey |
| P2-21 | Safe HTTP / egress: SSRF incl. redirects, private and metadata addresses, narrow allowlist | prompt | DESIGN | Private/metadata/rebinding/redirect blocked; credentials not forwarded cross-origin | PASS | unit: egress; int: p2-execution (egress), p2-templates (price watch), p2-postgres (H1), p2-review-fixes L2 |
| P2-22 | JSON map/filter/merge, CSV/JSON/file nodes | prompt | DESIGN | Data nodes produce the expected output | PASS | unit: engine-v2 "data nodes"; int: p2-templates (PDF) |
| P2-23 | Code node only in a real sandbox; unavailable otherwise; never in the server process | prompt | DESIGN | No network, no host env, read-only fs, CPU/memory limits | PASS | int: p2-code-sandbox (7) |
| P2-24 | Credentials separate from flows, encrypted, scoped; secrets never in logs/previews | prompt | DESIGN | Redaction of steps, events, approvals, errors | PASS | int: p2-actions (isolation), p2-review-fixes M4; codex: journey 10 |
| P2-25 | Human approvals bound to run/revision/action/args/connection/approver + expiry | prompt | DESIGN | Altered, expired or revoked-approver decisions not honoured | PASS | int: p2-actions (2); e2e: approval |
| P2-26 | Templates: file limits, authorized pricing sources, refusal of embedded instructions | prompt | DESIGN | Private pricing source refused; injected lines quarantined (real model: 0/9 poisoned, was 6/9) | PASS | int: p2-templates (price watch ×2, invoice injection); live: ai-ollama injection ×3 |
| P2-27 | Dashboard, history and payload inspector from real data, redaction, pagination, event log | prompt | DESIGN | Paginated history; events tab; redacted payloads | PASS | e2e: canvas re-run, approval; codex: journey 10 |
| P2-28 | Deterministic E2E suite (doubles only at provider boundaries) separate from the sandbox/live suite | prompt | DESIGN | `pnpm test:e2e` vs `pnpm test:live` | PASS | e2e; live |
| P2-29 | Fault tests: expired auth / denied refresh, 429/5xx/timeout, invalid schemas, duplicate webhooks, worker crash, double-click Run, cancellation, unaffected flows | prompt | DESIGN | Each fault exercised | PASS | int: p2-actions, p2-execution, p2-triggers; e2e: double-click + cancel |
| P2-30 | Races: balances, refresh tokens, scheduling; cross-workspace isolation | prompt | DESIGN | Racing reservations; one refresh; one fire; foreign connection unusable | PASS | int: p2-execution (race), p2-actions (refresh race, isolation), p2-triggers (schedulers) |
| P2-31 | Independent agent-driven UI testing (Codex), fixes, retest | prompt | DESIGN | Codex report → fixes → retest | PASS | codex: REPORT.md on `d86d1d4` (10 PASS / 3 FAIL / 1 BLOCKED; CX2-01…03) → fixed in `c7b7b54` → RETEST.md (changed items 6/7 PASS, journeys 6 PASS / 1 BLOCKED). Open: CX2-01 recurrence = Docker port-proxy stall outside the app (Postgres saw no connections); the app now fails fast (503 ≤5 s), recovers unaided and shows a clear message. CX2-R01 (minor hydration console warning) not reproducible. Viewer approval needs the Phase 3 role UI; covered by int: p2-actions |
| P2-32 | Security review of critical execution code | prompt (critical) | EXTENSION | Fable 5.1 findings fixed with tests that fail on the old code | PASS | artifacts/phase-2/reviews/fable-security-review.md; int: p2-postgres, p2-review-fixes |
| P2-33 | Phase 1 regressions re-run | prompt | DESIGN | All Phase 1 suites green | PASS | e2e (Phase 1 specs); int: runs, flows, tenancy, workspaces |

## Phase 3: agents / knowledge / copilot, collaboration, billing, release

| ID | Requirement | Source | Type | Acceptance test (planned) | Status |
|---|---|---|---|---|---|
| P3-01 | Agents (tool-using AI steps) | phase objective | DESIGN | Agent node completes a task with tools | PLANNED |
| P3-02 | Knowledge bases (documents, retrieval) | phase objective | DESIGN | Retrieval grounded in uploaded docs | PLANNED |
| P3-03 | Copilot (build/edit flows from natural language) | phase objective | DESIGN | Prompt → valid flow draft | PLANNED |
| P3-04 | Members: invite by email, role changes, removal | s12 | DESIGN | Invite accepted; role enforced | PLANNED |
| P3-05 | API keys (live/test, revoke, last used) | s12 | DESIGN | Key authenticates the API; revoked key rejected | PLANNED |
| P3-06 | Billing: plans, credits, upgrade (pricing requires business approval) | s12 | DESIGN | Test-mode checkout; credits enforced | PLANNED |
| P3-07 | Default LLM provider setting | s12 | DESIGN | Provider used by LLM nodes | PLANNED |
| P3-08 | Email verification, password reset, account deletion | security | DESIGN | Verification email flow | PLANNED |
| P3-09 | SSO + audit logs | s12 (Scale plan) | DESIGN | SSO login; audit entries | PLANNED |
| P3-10 | Real-time collaboration / presence on the canvas | phase objective | DESIGN | Two editors see each other's changes | PLANNED |
| P3-11 | Light mode (token remap) | s3 | DESIGN | Theme toggle; contrast checks | PLANNED |
| P3-12 | Release: production build, deployment, monitoring, security review, public docs | phase objective | DESIGN | Release checklist | PLANNED |
| P3-13 | Live OAuth (Google/GitHub) configured and verified | s6 | DESIGN | OAuth login E2E against real apps | PLANNED |
