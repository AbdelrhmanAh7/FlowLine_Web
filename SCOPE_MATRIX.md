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
| P1-21 | Templates: local templates create a flow and open the canvas; integration templates disabled with reason | s11 | DESIGN | Use template → canvas | PASS | `templates-*`; onboarding step 3 (e2e: journey path uses blank; Codex used a template) |
| P1-22 | Settings: members (real), general (name/timezone persisted), API keys/billing honest state | s12, prompt I | DESIGN | Owner saves name/timezone; others disabled with reason | PARTIAL | `settings-*`; invite/keys/billing are Phase 3 (P3-04..06). Name/timezone save is covered only by Codex/manual, with no dedicated E2E |
| P1-23 | Design tokens: colours, radii, focus ring, Inter + JetBrains Mono | s3, s4 | DESIGN | Tokens in `globals.css @theme`; visual comparison | PASS | `src/app/globals.css`; artifacts/phase-1/visual-review |
| P1-24 | State matrix: loading skeleton (no full-screen spinner), empty, populated, error + recovery, degraded | s13, prompt F | DESIGN | Skeleton while the flow loads; load fault → Retry; worker-offline banner | PASS | `state-loading-builder-1440`, `state-error-load-1440`, `state-empty-*`; e2e: failures "load failure…" |
| P1-25 | Offline: local draft (per user, non-sensitive), run disabled, reconcile without silent overwrite | s13, prompt F | DESIGN | Offline edit → reconnect saves; server changed → conflict banner → explicit choice | PASS | e2e: failures "offline…", "offline conflict…"; `state-offline-builder-1440` |
| P1-26 | Drafts isolated by user and cleared on sign-out | prompt F | DESIGN | Draft key includes the user id; sign-out wipes | PASS | e2e: tenancy "sign-out clears local drafts"; `src/lib/drafts.ts` |
| P1-27 | Responsive: desktop ≥1280 (240 sidebar, 360 drawer), tablet 768–1279 (48 rail, overlay + scrim), mobile <768 | s14, prompt G | DESIGN | Sidebar width at 1440/1280/1279/1024/768/767/375; drawer 360 / sheet; no horizontal scroll | PASS | e2e: responsive (10 tests) |
| P1-28 | Mobile = monitoring only (editing disabled, persistent banner, bottom sheet 92vh) | s14, prompt G | DESIGN | Drag doesn't move nodes; fields disabled; run works | PASS | e2e: responsive "mobile is monitor-only"; `builder-mobile-monitor-375` |
| P1-29 | Tablet swipe-to-dismiss drawer; two-finger pan/pinch | s14 | DESIGN | — | PARTIAL | Pinch/pan come from React Flow. Swipe-to-dismiss isn't implemented (scrim tap / ✕ / Esc instead); DESIGN_DECISIONS D2 |
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
| P1-40 | Agent-driven exploratory browser test (Codex), fixes, retest | acceptance | DESIGN | Codex report → fixes → Codex retest | see REPORT | artifacts/phase-1/codex-review |
| P1-41 | Docs: SCOPE_MATRIX, DESIGN_DECISIONS, docs/implementation, rules in CLAUDE.md/AGENTS.md | prompt | DESIGN | Files present | PASS | repo root, docs/implementation |
| P1-42 | Worker-offline degraded banner; runs queue | s13 (degraded ≠ blocked) | EXTENSION | Health endpoint → banner | PASS | `src/components/shell/app-shell.tsx`; `/api/health` |
| P1-43 | Expression sandbox (time/depth/size limits) | security | EXTENSION | Runaway recursion stopped | PASS | unit: "stops runaway recursion" |
| P1-44 | Light-mode token remap | s3 | DESIGN | — | PLANNED (P3) | DESIGN_DECISIONS D11 |

## Phase 2: automation and integrations

| ID | Requirement | Source | Type | Acceptance test (planned) | Status |
|---|---|---|---|---|---|
| P2-01 | Integration connections (OAuth/API key), per-connection health | s10 | DESIGN | Connect a sandbox app; token stored encrypted | PLANNED |
| P2-02 | Expired token → only the affected flows pause; Reconnect banner (degraded ≠ blocked) | s10, s13 | DESIGN | Expire a token → affected flows paused, the app stays usable | PLANNED |
| P2-03 | Integration catalog with search (size per real connectors, not the deck's "120+") | s10 | DESIGN | Catalog lists only implemented connectors | PLANNED |
| P2-04 | Webhook trigger | s5, s8, s11 | DESIGN | POST to a webhook starts a run | PLANNED |
| P2-05 | Schedule trigger using the workspace timezone | s7, s11, s12 | DESIGN | Cron fires in the configured TZ | PLANNED |
| P2-06 | LLM nodes (enrich/score/classify) with tokens/cost per step | s4, s8 | DESIGN | Run with a provider key; cost recorded | PLANNED |
| P2-07 | App action nodes (Sheets, Slack, Gmail, HTTP fetch, SQL…) | s8, s11 | DESIGN | Sandbox connector E2E | PLANNED |
| P2-08 | Integration templates (Lead Enrichment, Ticket Triage, …) usable | s11 | DESIGN | Template → runnable flow | PLANNED |
| P2-09 | Credits/usage metering per run (real, not sample figures) | s7, s9 | DESIGN | Metered usage matches the run records | PLANNED |
| P2-10 | Node "Test" execution in isolation from the drawer | s8 | DESIGN | Test a single node with sample input | PLANNED |
| P2-11 | Provider-slow / partial-run degraded states ("Running… 12s provider slow") | s13 | DESIGN | Slow provider shows a degraded state and continues | PLANNED |
| P2-12 | Per-node retries/backoff, timeouts, run cancellation | s13 | DESIGN | Transient failure retried; cancel stops the run | PLANNED |
| P2-13 | Flow activation (Active/Paused/Expired statuses on the dashboard) | s7 | DESIGN | Status reflects the trigger + connection state | PLANNED |

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
