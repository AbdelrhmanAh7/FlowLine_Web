# Codex — retest brief (Flowline Phase 2)

Same role and rules as `BRIEF.md` (independent tester; write only under `artifacts/phase-2/codex-review/`; no commits; one browser; the stack at http://localhost:3100 is already running — don't start/stop it).

- Code revision: **`c7b7b54`** (this worktree, detached HEAD). Your first report (`REPORT.md`, on `d86d1d4`) stays as is; write the retest to **`RETEST.md`**, screenshots to `screenshots/retest-*`, evidence to `evidence/retest-*`.
- The fake provider server was restarted (fresh state). Create new accounts via the Sign-up UI.
- Additional allowed control for the queue check only: as a second client in the same session, `POST http://localhost:3100/api/flows/<id>/runs` with body `{}` (header `origin: http://localhost:3100`) to push past the UI's concurrency gate.

## What the lead changed (verify each)
1. **CX2-01** (stack outages): the DB pool now fails fast and recovers after dropped connections (keepalive, connect/query/idle timeouts). Watch for any hang/timeout during the retest and report it with timestamps.
2. **CX2-02** (session token in console): server logs no longer include bound query params. Check the browser console across all journeys for any token, cookie, secret or `params:` values.
3. **CX2-03** (wrong toasts): a run that pauses for approval or is cancelled must not produce a "Run #N failed" toast.
4. New design states: during a slow provider step (Sheets `timeout` fault) the node and run dock show **"Running… Ns · provider slow"**; retries show "retry N (reason)" (e.g. Sheets `429` fault times 2).
5. Flows dashboard: real trigger kind (Manual/Webhook/Schedule) and status **Active** (published webhook/schedule), **Paused/Expired** (broken connection) — check during the repair journey.
6. Reconnect pre-selects the same account.
7. Run/step timestamps: Inspector Logs tab "started"/"finished" now show real times (they were empty before).

## Retest
- Re-run journeys **6 (approvals)**, **7 (cancel & double-click)**, **9 (repair — check dashboard statuses)**, **10 (monitoring & redaction — console included)**, **11 (usage & limits — queue quota via the second-client call above; expect a clear refusal)**.
- Quick re-check of 2 (template + OAuth) and 4 (fault + re-run, no duplicates).
- Report any NEW findings with IDs CX2-R01…, severity, steps, expected vs actual, evidence.

## RETEST.md
Revision, environment, per-item PASS/FAIL/BLOCKED (items 1–7 above and each journey), new findings table, what could not be tested and why. Call it an agent-driven exploratory retest.
