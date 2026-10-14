# Issue #124 — verification evidence

Requirement IDs below are derived from the issue brief and its latest CTO comment.

Source inspected: `3b3b1e259a722fdb406e7d188e1ca1347164f17a` on `ai/124`.
This rework removes only the two byte-identical test blocks introduced by `ebe306281aa904fee8c6c53af39ab5486fa92ac0`.
The retained army file has Git blob `a002465dbd454943e3f1c5578a3e8e6b9da7977b`.
Auth code, unit/integration tests, Playwright spec and gate groups are unchanged in this rework.

| Requirement | Verification in this session (2026-10-14) |
| --- | --- |
| REQ-124-1: explicit env/cookie opt-ins work only under `FLOWLINE_ENV=test` | `vitest run --project unit tests/unit/test-auto-verify.test.ts --maxWorkers=2`: 16 passed, 0 failed. |
| REQ-124-2: staging ignores both opt-ins, retains verification mail and refuses unverified sign-in | `vitest run --project integration tests/integration/test-auto-verify-staging.test.ts --maxWorkers=2`: 5 passed, 0 failed against local `flowline_test_124`; also covers test env/cookie opt-ins, no mail and default behavior. |
| REQ-124-3: one declaration per acceptance test | Before removal, `pnpm exec e2e run e2e-army/124-test-auto-verify-signup.e2e.ts --workers 1 --reporter list` exited 2 with `COLLECTION_ERROR`, duplicate title path; 0 tests executed. Title audit after removal: 6 titles, 6 unique. |
| REQ-124-4: signup → sign-in → creation without verification mail; default signup/resend remain honest | Army file: 6/6 passed twice consecutively on the same database; existing `e2e/test-auto-verify.spec.ts`: 3/3 Chromium tests passed. A temporary request-level check also signed up, signed in, created a workspace and flow, and asserted zero outbox messages for that account. |

`pnpm typecheck` and `pnpm lint` exited 0. Unit and integration commands ran serially with `nice -n 10` and synthetic `.env.test` values; no real credentials were used. The first integration setup attempt rejected identical synthetic workspace/platform keys before executing tests; separate synthetic keys corrected the local setup and the rerun passed.

Focused browser checks ran through `bin/suite.sh` under the shared resource governor, with Node 24, one browser worker, app port 3124 and fake-provider ports 4124/4125. No full local suite/build, new-head CI or deployment result is claimed. The implementation reuses the existing Better Auth hooks and test libraries; no dependency was added.

## Cold development-server probe

The first browser run collected all 6 tests and executed them: 5 passed, 1 failed. The signup UI case timed out on `Name your workspace` on a cold Next development stack (`3124`, `flowline_test_124`). Its trace shows HTTP 200 for both signup and sign-in, followed by an unfinished `/onboarding` GET when the assertion ended. The later browser sign-in case reached onboarding successfully (the server log then reports the compiled route in 117 ms). Raw evidence is retained in ignored `.e2e/124-cold-run/` and `.e2e/124-cold-stack.log`.

Hypothesis: on-demand Next development compilation delayed the first onboarding navigation beyond the unchanged locator deadline. Warming those routes before executing the same test file twice produced 6/6 passes each time. This supports a cold development-server delay; it does not claim a production-build reproduction. No timeout, retry, skip, assertion or auth implementation changed. No full build ran locally, per the issue instructions.

## Browser commands and outputs

Start `pnpm dev:test` with `FLOWLINE_TEST_PORT=3124`, `FLOWLINE_TEST_FAKE_PORT=4124`, `FLOWLINE_TEST_AI_PORT=4125`, `FLOWLINE_TEST_DB=flowline_test_124`. Before the warm probes, GET `/sign-up`, `/sign-in`, `/api/auth-config`, `/onboarding`, `/app` and `/resend-verification` to compile the development routes.

- Run twice: `E2E_ARMY_URL=http://localhost:3124 nice -n 10 pnpm exec e2e run e2e-army/124-test-auto-verify-signup.e2e.ts --workers 1 --reporter list` — `Tests 6 passed (6)` each time, no skips or failures. Run IDs: `01a139cb-5dbc-7594-a109-f661a6a635d1`, `01a139cb-e8e9-7532-9949-c0f421256978`.
- `FLOWLINE_TEST_PORT=3124 FLOWLINE_TEST_FAKE_PORT=4124 FLOWLINE_TEST_AI_PORT=4125 FLOWLINE_TEST_DB=flowline_test_124 nice -n 10 pnpm test:e2e e2e/test-auto-verify.spec.ts --project=chromium --workers=1` — `3 passed (13.1s)`.
- Raw reports remain ignored: `.e2e/124-run-1/report.json`, `.e2e/124-run-2/report.json`, `test-results/results.json`. The test stack was stopped after verification.
