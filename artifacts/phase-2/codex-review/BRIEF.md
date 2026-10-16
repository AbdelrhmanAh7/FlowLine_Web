# Codex — agent-driven exploratory test brief (Flowline Phase 2)

You are an **independent tester**. Do **NOT** modify product code (anything outside
`artifacts/phase-2/codex-review/`). Do not commit. Test first, report findings; the lead
developer (Claude) fixes them and will ask you to retest.

## Target
- App URL: **http://localhost:3100** — the isolated TEST stack (`FLOWLINE_ENV=test`, DB `flowline_test`). It is already running; do not start/stop servers, the worker, or Docker.
- Code revision: `d86d1d4` (this worktree, branch `codex-p2`).
- Phase 2 made Flowline a real automation platform: queue + worker, published versions, webhook/schedule triggers, retries, approvals, re-run from a step with preview, cancel, integrations (12 apps), AI nodes, templates, usage & limits.
- **Provider boundary is doubled** (by design — no real SaaS accounts are used):
  - Fake SaaS APIs for all 12 apps at `http://127.0.0.1:4010` (OAuth consent auto-approves as a fake account; Slack channels accept any id; Sheets accept any spreadsheet id).
  - Fake AI (Ollama-compatible) at `http://127.0.0.1:4011`, plus a fake public pricing page at `http://127.0.0.1:4011/pricing` (allowlisted for the Price Watch template).
- Accounts: create your own through the **Sign-up UI** with `@flowline-e2e.test` emails (password e.g. `Codex-Test-Pass-2`). Create a second account for tenancy checks.

### Allowed test-only controls (provider/infrastructure faults only — everything else through the UI)
- App faults: `POST http://localhost:3100/api/test/faults` `{"kind":"save"|"load"|"run","count":N,"status":500}` / `{"reset":true}` (header `origin: http://localhost:3100`, your session cookie).
- Provider faults: `POST http://127.0.0.1:4010/__fake/fault` `{"provider":"google_sheets","pathPattern":"<regex on the provider path, e.g. your spreadsheet id>","mode":"500"|"429"|"timeout"|"drop_after_commit","times":N}`.
- Provider state (read-only evidence of side effects): `GET http://127.0.0.1:4010/__fake/state/google_sheets`, `.../state/slack`.
- Simulate "user revoked the app at the provider": `POST http://127.0.0.1:4010/__fake/revoke-account` `{"account":"a"}` (all tokens of the default fake account stop working; reconnecting via OAuth issues new ones).
- Do **not** call `/__fake/reset` (it wipes state other checks may rely on).

## How to test
Use a **real browser you control** (browser/computer-use tools if you have them; otherwise write and run Playwright scripts that click/type/drag like a user — `@playwright/test` 1.63 + Chromium are installed via `node_modules`; put scripts under `artifacts/phase-2/codex-review/scripts/`). Screenshots → `artifacts/phase-2/codex-review/screenshots/`; save Playwright traces for failures → `artifacts/phase-2/codex-review/traces/`. Watch console and network (4xx/5xx). **Do not** substitute API calls or DB edits for UI interaction, except the controls above. One browser at a time; no parallel runners (keep laptop load low).

## Journeys to explore (report each as PASS / FAIL / BLOCKED with evidence)
1. **Blank flow**: new flow → Manual trigger → HTTP request (GET `http://127.0.0.1:4011/pricing`) → JSON transform → Output. Run; inspect steps (input/output/log tabs). Then an HTTP request to `http://169.254.169.254/latest/meta-data/` and to `http://localhost:5433` — must be refused with a clear egress error (SSRF protection).
2. **Template with connections**: Integrations → connect Google Sheets and Slack (OAuth → fake consent). Templates → "Lead Enrichment Pipeline" shows requirement status → Use template → finish setup in the node drawers (choose connections; edit the input mapping to replace `REPLACE_WITH_…` values) → Run → inspect AI step meta (provider/model/tokens) and the sheet row / Slack message in the fake state.
3. **Editing mappings**: invalid JSONata, `$steps.<id>` referring to a non-upstream step, missing required fields — the builder must explain issues and block Run; server must refuse too.
4. **Fault + re-run without duplicates**: inject a Sheets `500` fault (times ≥ attempts) on your spreadsheet id → run fails at the Sheets step → Inspector → "Re-run from this step" → the preview lists what re-runs, what is reused, side-effect risk → confirm → run succeeds; fake state shows exactly one row and no duplicate Slack message; Settings → Usage shows AI billed once.
5. **Lost response on a non-idempotent step**: `drop_after_commit` on Sheets append → the step becomes "Outcome unknown"/review (or is verified); resolve it in the Inspector (mark done / retry / fail); no blind duplicate.
6. **Approvals**: an action with "Require human approval" → run waits → Approve / Reject in the Inspector; verify args shown match what executes; viewer role can't approve.
7. **Cancel & double-click**: double-click Run creates one run; Cancel during a slow step (`timeout` fault) → cancelled; other flows keep running.
8. **Publish & triggers**: publish a webhook flow; copy URL/secret; the panel explains signing; rotate secret. Schedule trigger: cron validation (too frequent is refused), time zone, next-fire preview, missed-run policy options.
9. **Repair a connection**: with a published/active flow using Slack, revoke the fake account → run fails with a connection error → the flow is paused, an Integrations banner says so, **other flows keep running** → Reconnect (same account) → flow resumes; nothing runs automatically on reconnect.
10. **Monitoring**: Dashboard (real KPIs, attention items), Run history filters/search/pagination ("Load older"), payload inspector redaction (no tokens/secrets visible anywhere: steps, logs, events, approvals, errors).
11. **Usage & limits**: Settings → set a tiny monthly budget + a price for the AI model → an AI step is refused with a clear budget message; concurrency/queue limits save and apply.
12. **Tenancy**: account B can't see/open A's flows, runs, connections, approvals by URL.
13. **Mobile (375 px)** and 1024/1440: no horizontal scroll; mobile is monitor-only; Integrations/Templates/Runs usable.
14. **Phase 1 regressions** spot-check: canvas editing, autosave, undo/redo, offline banner.

Every button must work or clearly explain why it is disabled. No fake success, no fake counts or metrics.

## Report — write `artifacts/phase-2/codex-review/REPORT.md`
- Environment actually used (tooling, versions), journeys run, counts.
- Findings table: ID (CX2-NN), severity (blocker/major/minor/cosmetic), area, steps, expected vs actual, evidence path (screenshot/trace/console text).
- Per-journey PASS/FAIL/BLOCKED list.
- What worked (brief). What you could not test and why.
Call it an **agent-driven exploratory test** (not human testing).
