# Merged browser gate: `ai-hub` @ `cceeb5d` (after the Codex Wave C fixes)

Single worker, one browser project at a time, retries 0, test doubles only (NOT live cloud). One test stack
(`pnpm dev:test`, Next dev server); restarted once, between Firefox and WebKit, for the restart proof and the
WebKit ports. Environment as in `../merged-faec2a3-20260929-0459/ENVIRONMENT.md` (15.7 GB free at start).

| Browser | Expected | Executed | Passed | Failed | Flaky | Skipped | Interrupted | Log |
|---|---|---|---|---|---|---|---|---|
| Chromium (all specs incl. `admin-panel` ×3) | 65 | 65 | 65 | 0 | 0 | 0 | 0 | `gate-chromium.txt` |
| Firefox (`@critical\|@cross-browser`) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `gate-firefox.txt` |
| WebKit, **attempt 1** | 24 | 24 | 23 | **1** | 0 | 0 | 0 | `gate-webkit-attempt1-1failed.txt`, `webkit-attempt1-failure/` |
| WebKit, attempt 2 (complete suite re-run, same code) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `gate-webkit-attempt2.txt` |

## WebKit attempt 1 failure: classified as an infrastructure stall (hypothesis, not confirmed)
- **What failed:** `phase3.spec.ts:102` "API keys…". `page.goto('/w/…/settings?tab=keys')` did not reach `load` in
  60 s.
- **Evidence:**
  - The server served the HTML in 58 ms (`stack-after-restart.log:732`).
  - The trace (`webkit-attempt1-failure/trace.zip`) shows 22 requests; exactly one,
    `/_next/static/chunks/17q7_next_dist_compiled_1s4hhdo._.js`, never got a response (status -1).
  - The same chunk served 200 / 148 117 B in about 3 ms when fetched afterwards.
- **Pattern:** this is the 3rd occurrence of a browser request that never completes against the `next dev` test
  server. The earlier two were in Phase 4: once in Firefox, natively; once in WebKit, at sign-up. It has never
  occurred against the production-build staging stack or in the release scripts.
- **Hypothesis (unconfirmed):** a dev-server (Turbopack) or loopback transport stall under load. It is not an
  application defect in the tested code paths, but it stays an OPEN test-infrastructure issue.
- **Suggested next step (not done here):** run the E2E suite against a production build (`next start`) to confirm or
  refute it.

## Restart persistence (re-run because the credential code changed)
A key was typed in the UI, then web + worker + fakes were fully restarted, then the user signed in again. The stored
connection is listed with its masked hint only, and the provider received exactly that key (SHA-256).
`restart-proof-phase1.txt` and `restart-proof-phase2.txt`: both passed. The spec is the same as
`../merged-faec2a3-20260929-0459/restart-proof.spec.ts.txt`.

## Non-browser gates on `cceeb5d`
lint and typecheck clean; unit 245, contract 465, integration 430; 17 migrations on an empty DB.
