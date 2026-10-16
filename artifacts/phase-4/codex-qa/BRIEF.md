# Codex — Chrome exploratory QA + private-beta acceptance journeys (Flowline Phase 4, STAGING)

You are an **independent tester**. Do **NOT** modify product code (anything outside `artifacts/phase-4/codex-qa/`).
Do not commit. Test first and report findings; the lead (Claude) fixes them and asks you to retest.
Call your work an **agent-driven exploratory browser test in Chrome**. It is not human UAT.

## Target
- **Staging:** `http://localhost:3200`, running the release image `flowline:fdb1cb0` (a production build: web +
  worker + its own PostgreSQL). It is running. Do not start, stop or rebuild servers or images, except for the one
  outage step in Journey 10.
- **Private-beta mode is ON (`invite_only`).** Sign-up needs an invitation or a beta access code. A 6-use code is in
  `C:\Users\ABDELR~1\AppData\Local\Temp\claude\C--Users-Abdelrahman-Desktop-Personal-Project-FlowLine\1de60827-acfa-4d1d-8b34-1de4bdc07c48\scratchpad\qa-beta-code.txt`.
  Never write the code into the report, screenshots or any file under `artifacts/` (blur it or keep it out of frame).
- **Email:** staging stores outgoing email in a database outbox instead of sending it. Use this test inbox to open
  verification, reset, invitation and deletion links, as a user would from their mail client:
  `node artifacts/phase-4/codex-qa/scripts/inbox.mjs <address> [count]` (run from the repo root; read-only).
- **Real AI provider:** the local Ollama model `qwen2.5:7b`. It is slow (10–60 s per AI step), so don't run many AI
  calls in parallel.
- **No SaaS credentials on staging.** Google Sheets, Gmail, Slack, GitHub, HubSpot and the others must show their real
  "not configured" or credential-needed state, never fake success. Billing (Paddle) and Google/GitHub sign-in are not
  configured and must say so honestly.
- Rate limits are the production ones. Space out sign-ups and emails; an address can request at most 3 emails an hour.
- **Accounts:** create your own through the sign-up UI with `@flowline-qa.test` addresses and a password such as
  `Codex-QA-Pass-4`. You need an owner, a member you invite (as viewer, later promoted), and an outsider for tenancy
  checks.

## How to test
- **Browser:** use real Google Chrome. Playwright 1.63 is in `node_modules`; launch it with `channel: "chrome"`. You
  can reuse or adapt `artifacts/phase-4/codex-qa/scripts/browser-repl.cjs` from Phase 3, and put your scripts under
  `artifacts/phase-4/codex-qa/scripts/`.
- **Drive the UI like a user.** Click and type. Don't substitute API calls or DB edits for UI interaction. The only
  exceptions: the inbox helper above, read-only `/api/health`, and the public `/api/v1` API called with a key you
  created in the UI.
- **Watch the browser:** console errors, React hydration warnings (note every page and the text) and network 4xx/5xx.
  Screenshots go in `artifacts/phase-4/codex-qa/screenshots/`.
- **Language and layout:** the product is **Arabic-first**. The UI is Arabic by default, RTL, with English as
  secondary via the language switcher. Test both languages. Check 1440, 1024 and 375 px widths: no horizontal scroll,
  correct RTL mirroring, emails/URLs/code staying LTR, and no untranslated or garbled text.
- **One browser at a time.**

## Private-beta acceptance journeys (report each PASS / FAIL / BLOCKED with evidence)
1. **New invited user:** signs up (with the beta code, and also through an invitation link from an owner), verifies
   their email, completes onboarding, creates a local workflow, runs it, and inspects the output. Also check the
   refusals: an uninvited email without a code, and a wrong code, both get a clear refusal with no fake "check your
   email".
2. **Google Sheets:** expected BLOCKED (no credentials). Confirm the UI shows the honest not-configured state.
3. **Gmail:** same as Journey 2.
4. **Slack:** same as Journey 2.
5. **GitHub:** same as Journey 2.
6. **Copilot:**
   - Ask for a workflow.
   - A proposal should be created, then validated, then previewed.
   - Approve it manually, which saves it as a draft.
   - Does the actual behaviour match the request?
   - Also check that Copilot is labelled **Experimental** and that the preview says "ran without errors, verify the
     output matches your request" rather than claiming correctness. With the local 7B model, a failed or invalid
     proposal is an expected, honest outcome. Judge the honesty and safety of the UI, not the model's quality.
7. **Viewer vs owner:** the owner invites a Viewer, and the Viewer opens the project. The Viewer must not be able to
   perform protected actions: edit, run where not allowed, approve, manage members or billing. Disabled controls need
   a stated reason. The owner can approve an approval-gated step.
8. **Billing sandbox checkout:** expected BLOCKED (no Paddle sandbox). Confirm Plan & billing states that honestly,
   and that no real payment is possible.
9. **Provider fails:**
   - Create a PostgreSQL connection with wrong credentials (host `db`, port 5432, any wrong password), or another
     provider failure you can trigger from the UI.
   - Use it in a flow, publish it, and run it.
   - Flowline should show a useful degraded or error state.
   - A different, unaffected flow keeps running.
10. **Service interruption** (do this once, near the end):
    - Start a run.
    - Run `docker pause flowline-staging-db-1`.
    - Watch the UI for about 20 seconds: the degraded banner and error states, and no crash.
    - Run `docker unpause flowline-staging-db-1`.
    - Confirm recovery without reloading, and that each run executed exactly once (the run inspector shows its
      steps once).

## Exploratory areas (beyond the journeys)
- Password reset and forgot password, resend verification, account deletion (the confirmation email link, and the
  sole-owner rules).
- The user menu: BETA badge, Report an issue, Contact support, Account items, language switch.
- Integrations page: the beta "not yet verified live" badges on the 7 deferred providers; honest connect dialogs.
- Settings, every tab: members and invites (does the invite say whether it was emailed?), API keys (one-time reveal,
  revoke), audit log, SSO (not configured), Plan & billing, AI defaults, usage.
- Agents and knowledge: create an agent with an ASK tool, upload knowledge, get a cited answer, and approve.
- Runs: filters, the inspector, re-run from a step, approvals.
- Tenancy: the outsider must get "not found" for the owner's URLs (flows, runs, settings, agents).
- Keyboard: canvas shortcuts must not fire while typing.

## Report
Write `artifacts/phase-4/codex-qa/REPORT.md`:
- Environment: Chrome version, staging revision from `/api/health`, and the date.
- Coverage.
- The journeys table.
- A findings table: ID `CX4Q-NN`, severity, area, steps, expected vs actual, evidence.

Also write `artifacts/phase-4/codex-qa/BUGS.md` with every finding by severity:
- **P0:** data loss, security or tenancy breach, or the beta is unusable.
- **P1:** a core journey is broken, or a misleading or false claim.
- **P2:** a degraded experience with a workaround, including i18n/RTL defects that affect understanding.
- **P3:** cosmetic.

List the console and network errors seen. No secrets, beta codes or passwords go into any file.
