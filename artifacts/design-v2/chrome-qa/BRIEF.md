# Codex: design-v2 exploratory QA in real Google Chrome (independent reviewer)

You are the **independent tester**. This is agent-driven exploratory testing, not human UAT and not the automated
Playwright suite, which has already run separately and must not be counted here.

## Rules
- **Do NOT modify product code, tests or configuration.** Write only under `artifacts/design-v2/chrome-qa/` and append
  findings to `artifacts/design-v2/BUGS.md`. Don't commit.
- **Servers and containers:** don't start, stop or rebuild them. Don't stop Docker or any process you didn't start.
- **Secrets:** never read or print `.env*` files or secret values. Don't put passwords, keys, TOTP secrets or session
  cookies in any file or screenshot; mask secret inputs.
- **No live cloud and no paid calls.** Every provider is a TEST DOUBLE (below); say so wherever results could be read as
  provider verification.
- **One browser session at a time.** Close only the browser you launched.

## Target
- **URL:** `http://localhost:3100`, a test stack (`FLOWLINE_ENV=test`) running a **production build** of this worktree.
  - Check `GET /api/health?require=worker` first. It reports `revision: "dev"`, so record the build identity from
    `.next-test/BUILD_ID` and the snapshot below.
- **Snapshot under test:** checkpoint 4, `refs/checkpoints/design-v2-closeout-4` → `85516ef` (tree `435c3db`). This is the
  working tree of branch `design-v2`: HEAD `fb563e5` plus uncommitted changes identical to checkpoint 4. Production build
  BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
  - Record `git rev-parse refs/checkpoints/design-v2-closeout-4`, `git rev-parse HEAD` and `.next-test/BUILD_ID`.
  - Don't change any file outside your output folders.
- **Test doubles:**
  - SaaS/OAuth fakes on `127.0.0.1:4010`; AI provider fake on `127.0.0.1:4011`.
  - Any key string works for AI connections (e.g. `sk-fake-qa-<random>`).
  - Fault controls, which you may use and must say whenever you do:
    - `POST http://127.0.0.1:4011/__fake/openai/fault` with `{"mode":"401"|"429"|"500"|"timeout","times":1}`;
    - `POST http://127.0.0.1:4010/__fake/fault`;
    - `POST http://127.0.0.1:4010/__fake/revoke-account` with `{"account":"a"|"b"}`;
    - `POST http://127.0.0.1:4010/__fake/issue-token`.
- **Accounts:** sign up through the UI with fresh synthetic `@flowline-qa.test` addresses. Verification links come from
  the test outbox: `curl "http://localhost:3100/api/test/outbox?email=<address>"`.
- **Platform admin:** get a one-time setup code with
  `node scripts/with-env.mjs .env.test npx tsx scripts/admin/bootstrap.mts --email <you>`. Add `--grant` if setup was
  already completed. Redeem it at `/admin/setup`, enrol TOTP using `e2e/tools/totp.ts` to compute codes, and step up.

## Browser
- **Real Google Chrome** via Playwright `channel: "chrome"`, **headed**, with a **dedicated fresh profile**: a temporary
  user-data-dir under `artifacts/design-v2/chrome-qa/.profile/`, deleted at the end. Never the owner's profile.
- **Record:** the Chrome version (CDP `Browser.getVersion` + the executable's ProductVersion), headed/headless mode, and
  the tools you had.
- **If real Chrome can't be driven:** stop and record the exact limitation. Don't substitute Chromium silently.
- **Drive the UI like a user** (click, type, drag, keyboard, navigate). Use API calls only for read-only checks, the
  outbox, and the fault controls above.
- **Watch** the console (errors, warnings, hydration messages) and network (4xx/5xx), and note which were expected.

## Coverage (each PASS / FAIL / BLOCKED with evidence)
1. **Sign-in / sign-up, English and Arabic.** Check RTL layout and that there's no horizontal overflow at 1440, 1024,
   768/767, 375 and 360. Also cover the theme (Light/Dark/System) and language switchers, email verification via the
   outbox, sign-out and sign-in.
2. **Onboarding and dashboard:** onboarding steps and motion; the dashboard empty and populated states.
3. **Workflow lifecycle.**
   - Create a flow, add nodes from the palette by dragging, and connect them. Configure a node (including a JSONata
     expression). Save, refresh, and confirm it persists.
   - Run it and inspect the run: steps, output, and the run inspector tabs. The Error tab must be disabled with a reason
     when nothing failed.
4. **Failures and recovery.**
   - An invalid flow must be blocked with reasons.
   - A failing step (use a fault) must show the error.
   - Approvals: a step requiring approval waits, and can be approved once. A pending approval can be found again after
     navigating away.
   - Reconnect: revoke the fake account, which must pause only that flow and show a banner. Reconnect via OAuth, and
     confirm the banner clears and nothing auto-runs.
5. **Permissions.** Invite an Editor and a Viewer (two more synthetic accounts):
   - the Viewer can see but not edit, approve or run where forbidden, with disabled controls explaining why;
   - the Editor can edit;
   - removing a member revokes access;
   - an outsider in another workspace gets 404s.
6. **AI providers, through the UI only.**
   - Connect → check and save → discover models → search the model picker. The key is shown only masked afterwards;
     check the page HTML, storage and URLs for the raw key.
   - Pick models in an AI step and run it: cost is labelled (`Cost (USD)` / `التكلفة (USD)`), and unknown/estimated
     cost is shown honestly.
   - Rotate/replace the key, with the affected-items preview; then disconnect, and runs must fail clearly.
   - An invalid key (401 fault) must give a clear error with no fake success.
   - Workspace isolation: another workspace can't see or use the connection.
7. **Copilot.** Controls, preview/diff, an invalid proposal explained and not applicable, rejection changing nothing,
   and approval saving a draft only. The wording must not claim semantic correctness.
8. **Admin and settings.**
   - Settings tabs: members, API keys (the revealed-once key), OAuth apps (write-only secret, provenance), usage & limits
     (table scroll on phones), billing (sandbox only), audit log, SSO.
   - The platform admin panel: setup, TOTP, step-up, a write-only credential never shown back, and a non-admin getting
     404 at `/admin`.
9. **Accessibility and interaction.**
   - Keyboard: Tab order, visible focus, Escape closing dialogs, focus returning, and no keyboard trap.
   - Dialogs: focus trap and names.
   - Disabled controls: the reason is reachable by hover, focus and tap.
   - Emulate `prefers-reduced-motion: reduce`: everything static and readable, the public pages fully visible, and no
     dead scroll space.
   - With motion on: brief, clear feedback (≤300 ms), and no hover lifts.
10. **Responsive:** 1440, 1024, 768/767 and 375 for the main screens.
11. **Mobile monitor-only (an expected requirement).** On a phone width, editing and Copilot are disabled with a
    persistent explanation, while running and monitoring still work.
12. **Public pages:** the landing page in Arabic and English, light and dark. Check scroll motion with motion on and
    off, and that there's no horizontal overflow.

## Findings
Append each to `artifacts/design-v2/BUGS.md` as `DV2-Qnn` with:
- **severity:** P0 security/tenancy/data loss/money; P1 core journey broken or misleading claim; P2 degraded with a
  workaround; P3 cosmetic;
- **classification:** application defect, test defect, environmental, or unresolved observation;
- **exact reproduction steps, and expected vs actual;**
- **the tested snapshot and build id, plus sanitised evidence paths.**

Don't file a finding you couldn't reproduce as a defect; mark it an unresolved observation.

## Report
`artifacts/design-v2/chrome-qa/REPORT.md` containing:
- the environment (Chrome version, headed/headless, profile, snapshot, BUILD_ID, date, tools);
- the coverage table with PASS / FAIL / BLOCKED per journey and evidence links;
- the console/network inventory;
- the findings summary by severity;
- an explicit statement of what was NOT covered.

Screenshots go in `artifacts/design-v2/chrome-qa/screenshots/`.
