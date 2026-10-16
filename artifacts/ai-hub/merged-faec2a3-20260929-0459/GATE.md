# Merged browser gate: `ai-hub`

**Final revision: `84f2cc1`.** Product code (`src`, `worker`, `drizzle`, `scripts`, `next.config.ts`, `package.json`)
is identical to `8b7c803`; `84f2cc1` changes only test files (`e2e/tools/totp.ts`, the `admin-panel.spec` import,
`tests/unit/e2e-totp.test.ts`). The run started from `faec2a3`. Test doubles only; this is **not** live cloud
verification. Environment and limits: `ENVIRONMENT.md`.

## Browser results (single worker, one browser project at a time, retries 0)

| Browser | Expected | Executed | Passed | Failed | Flaky | Skipped | Interrupted | Revision | Log |
|---|---|---|---|---|---|---|---|---|---|
| Chromium (all specs) | 65 | 65 | 65 | 0 | 0 | 0 | 0 | `8b7c803` | `gate-chromium-8b7c803.txt` |
| Chromium: `admin-panel.spec` re-run (spec file changed) | 3 | 3 | 3 | 0 | 0 | 0 | 0 | `84f2cc1` | `gate-chromium-admin-panel-84f2cc1.txt` |
| Firefox (`@critical\|@cross-browser`) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `8b7c803` | `gate-firefox-8b7c803.txt` |
| WebKit (`@critical\|@cross-browser`, Linux image in Docker) | 24 | 24 | 24 | 0 | 0 | 0 | 0 | `84f2cc1` | `gate-webkit-84f2cc1.txt` |

**Intentional coverage differences:** Firefox and WebKit run only the `@critical` / `@cross-browser` tags
(config `grep`). `admin-panel.spec` (3 tests) is untagged, so it runs in Chromium only.

## Non-browser gates on `84f2cc1`
- lint and typecheck: clean.
- Unit 235, contract 444, integration 407: all passed.
- Canary grep over `artifacts/`, `test-results/`, `playwright-report/`: clean.
- Separate concurrency, budget-race and duplicate-execution tests are in integration
  (`ai-hub-routing`, `ai-hub`, `sec-*`), not replaced by the single-worker browser runs.

## Attempts, kept visible
1. **Chromium + Firefox, default 2 workers:** stopped by Claude Code memory reaping about 15 s in, before any
   result (`INTERRUPTED-attempt1-chromium+firefox.txt`).
2. **Admin-panel diagnostic, Chromium, `faec2a3`:** 1 passed, **2 failed** (`diag-admin-panel-chromium.txt`).
   **APPLICATION DEFECT:** five `SecretInput` fields had no `ref`, so the secret was never submitted; the server
   returned 400. Fixed in `8b7c803`, with a unit guard. The re-run passed 3/3 (`diag-admin-panel-chromium-after-fix1.txt`).
3. **WebKit, `8b7c803`:** **no tests ran** (`FAILED-attempt1-webkit-8b7c803-spec-import.txt`). **TEST DEFECT:**
   `admin-panel.spec` imported `../src/server/totp`, which the container doesn't copy, so spec loading failed. Fixed
   in `84f2cc1` with an independent RFC 6238 emulator; the re-run passed 24/24.
4. **WebKit phase infrastructure (not a code change):** the local, gitignored `.env.test` fake ports were switched
   4020/4021 → 4010/4011 so the container reaches the stack's fakes. It was restored afterwards.

## Credential UI journey: what these runs prove
- **`ai-hub.spec` (@critical; Chromium, Firefox, WebKit):**
  - the key is typed in Settings → AI Providers, then save/test and discover (5 models);
  - a model is picked on an AI step, the flow runs, and the inspector shows provider, model, tokens and cost;
  - the connection persists across reload and sign-out/in;
  - the canary is absent from HTML, browser storage and API bodies;
  - a second workspace gets 404;
  - an editor without use roles gets empty models and 403 on pinning.
- **Restart persistence** (`restart-proof-phase1/2.txt`, spec archived as `restart-proof.spec.ts.txt`): a key typed
  in the UI, then a full web + worker + fake restart, then sign-in again. The connection is listed with its masked
  hint only, and the provider received exactly that key (SHA-256 match) on the metadata test. Phase 2 attempt 1
  failed on a proof-script bug (wrong test body), kept as `restart-proof-phase2-attempt1-scriptbug.txt`.
- **Integration** (`ai-hub`, `sec-*`):
  - model-provider env keys absent at startup, and a bogus global key is never sent;
  - manage/use enforced server-side, including a change after a job is queued;
  - revoked/missing connections fail with no fallback;
  - a fresh worker process uses the stored key;
  - no secret in logs or DB rows.
