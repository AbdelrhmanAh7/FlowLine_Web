# Issue #124 — verification evidence

Requirement IDs below are derived from the issue brief, its CTO comments and the hub verify rounds.

Source tested: `c400b699792867bc2efb8018b10c3e030392095d` on `ai/124`. It contains the merge of origin/main `bc60ed21615176340dc2f20310bb030ec135311e` (`ee336db6`, docs-only conflicts in `AGENTS.md` and `NEXT_ACTION.md`), the test-first commit `57fbb0cc` and the fix. The army file at that commit has Git blob `b65d48c2b9934a729c9a2c59f94e507e7f072ba7`. The only edit after the browser runs was a comment in `src/server/test-auto-verify.ts`.
Earlier evidence (head `3b3b1e25`: duplicate-test removal, cold dev-server probe) is in this file's history: `git log -p -- artifacts/phase-4/issue-124/EVIDENCE.md`.

| Requirement | Verification in this session (2026-10-14) |
| --- | --- |
| REQ-124-1: the env and cookie opt-ins work only under `FLOWLINE_ENV=test` | `tests/unit/test-auto-verify.test.ts`: 16 passed, 0 failed. |
| REQ-124-2: staging ignores both opt-ins, still sends the verification mail and refuses an unverified sign-in; one warning for the env var | `tests/integration/test-auto-verify-staging.test.ts`: 5 passed, 0 failed, on `flowline_test_124` (run on the merged tree and again with the route restored). |
| REQ-124-3: one declaration per acceptance test | Army file: 7 titles, 7 unique. |
| REQ-124-4: sign-up → sign-in → workspace without a verification mail; the default sign-up and **Resend** stay honest | Army file 7/7 twice on the same database. `e2e/test-auto-verify.spec.ts` on Chromium: 4 passed, then 8 passed with `--repeat-each=2`. |
| REQ-124-5 (hub verify round on `16976e7`): a browser that can only navigate reaches the opt-in on a `FLOWLINE_ENV=test` stack; the route is a 404 everywhere else | Red: with `src/app/api/test/auto-verify/route.ts` moved out, the navigate-only army case failed at `toHaveURL` (the browser stayed on the 404), and the route unit test failed with "Cannot find package". Green: the same case passed; `tests/unit/test-auto-verify-route.test.ts` 8 passed; `curl` returned 303, `location: /sign-up`, `set-cookie: fl_test_auto_verify=1; Path=/; HttpOnly; SameSite=lax`. |
| REQ-124-6: merging main changes no auth logic, assertion, timeout, retry or gate | `ee336db6` resolves two Markdown conflicts by keeping both sides. `pnpm typecheck` and `pnpm lint` exit 0 on the merged tree and at `c400b699`. `tests/unit/gate-groups.test.ts` 8 passed; `tests/unit/ci-workflows.test.ts` 82 passed; `tests/unit/design-system.test.ts` 34 passed (hex guard over `src/app`). |

A `/security-review` sub-task on the branch diff, including the restored route, reported no findings. It noted that the cookie grants nothing beyond `/api/test/outbox` only while the test stack's mail goes to the DB outbox; the module comment now says so.

## Why the verify round on `16976e7` failed

The hub verifier's browser has no step that sets a cookie or an env var (its steps are `goto`, `click`, `fill`, `select`, `press`, `expect`, `wait`, `screenshot` and `viewport`, hub `src/jobs/verify.ts`). Its stack runs `FLOWLINE_ENV=test` without `FLOWLINE_TEST_AUTO_VERIFY` (hub `ops/verify/FlowLine_Web.sh`). After `31a2ccd4` removed `GET /api/test/auto-verify`, no generated flow could opt in, so every one showed **Check your inbox**. On `f678a86`, with the route, the same verifier judged both opt-in criteria met. The `e2e-army` error on `16976e7` did not come from this branch. Its three failures were agent steps of the hub's own suite, refused by the model provider (`Too Many Requests`). The PR's `e2e-army/*.e2e.ts` files were listed on the runner's command line but not collected (the run reports `Test Files 1`). Both come from the hub's `e2e-army.log` for `16976e7`.

## Commands

- Stack: `pnpm dev:test` through `hub-live/bin/suite.sh` with Node 24, `FLOWLINE_TEST_PORT=3124`, `FLOWLINE_TEST_FAKE_PORT=4124`, `FLOWLINE_TEST_AI_PORT=4125` and `FLOWLINE_TEST_DB=flowline_test_124`. `.env.test` was a temporary copy with synthetic values only, removed afterwards. The routes were warmed with GET before the runs; the stack was stopped with `pnpm stop:test`.
- Army: `E2E_ARMY_URL=http://localhost:3124 pnpm exec e2e run e2e-army/124-test-auto-verify-signup.e2e.ts --workers 1 --reporter list`. Red with `--grep "can only navigate"`: run `01a13c22-7b59-7a18-8423-884d70f4cde1`. Green: `01a13c22-fa76-7bd8-ad1d-c709b15b08d0`. Full file: `01a13c23-267a-7f49-81b3-761ee109ce90` and `01a13c23-81b0-7cb4-bf01-6d4e1b99e9a7`, `Tests 7 passed (7)` each.
- Playwright: `FLOWLINE_TEST_PORT=3124 FLOWLINE_TEST_FAKE_PORT=4124 FLOWLINE_TEST_AI_PORT=4125 FLOWLINE_TEST_DB=flowline_test_124 pnpm test:e2e e2e/test-auto-verify.spec.ts --project=chromium --workers=1` gave `4 passed`; adding `--repeat-each=2` gave `8 passed`.
- Unit, one file per run: `pnpm exec vitest run --project unit <file> --maxWorkers=2`.
- Integration: `node scripts/with-env.mjs <temporary env file> vitest run --project integration tests/integration/test-auto-verify-staging.test.ts --maxWorkers=2`, against `flowline_test_124` with separate synthetic workspace and platform keys.
- Army type-check: `tsc` with a `nodenext` config over the army file exited 0. A probe copy with a matcher typo failed with TS2551, so the check is live.

No full local suite or build ran (CI runs them). Nothing was pushed, and no CI, `e2e-army`, verify or CodeRabbit result for the new head is claimed. Raw outputs (`.e2e/124-*`, `test-results/`) are git-ignored and not committed.
