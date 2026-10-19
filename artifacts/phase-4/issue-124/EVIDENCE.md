# Issue #124 — verification report

Source tested: `028644d05c66d6342af93b5ccd505341d055e195` on `ai/124`. It contains origin/main `cef5dd89` through the merge commit `6307c3fb`, the spec commit `d581a195` and the `/simplify` commit `028644d0` (four review agents; what was fixed and what was skipped is in its commit message). The local runs below took place on 2026-10-18 at `028644d0`, before anything was pushed, unless a row names an older commit; the stack, browser, integration and unit runs used Node 24.21.0. Earlier rounds (heads `3b3b1e25` and `c400b699`) are in this file's history: `git log -p -- artifacts/phase-4/issue-124/EVIDENCE.md`.

## Acceptance criteria

AC1 to AC5 are the "Done when" list of the planner spec appended to #124 on 2026-10-16. AC6 to AC9 come from the issue brief, the CTO comments on PR #135 and the hub verify rounds.

1. AC1: with `FLOWLINE_ENV=test` and `FLOWLINE_TEST_AUTO_VERIFY=1`, `requireEmailVerification` is false and new users are created with `emailVerified=true`.
2. AC2: with `FLOWLINE_ENV=test` and the flag unset, `requireEmailVerification` stays true.
3. AC3: with any other `FLOWLINE_ENV` and `FLOWLINE_TEST_AUTO_VERIFY=1`, the server throws at start-up.
4. AC4: the exported `isAutoVerifyEnabled()` is true only for `FLOWLINE_ENV=test` with `FLOWLINE_TEST_AUTO_VERIFY=1`.
5. AC5: existing tests pass, and a new unit test covers the flag logic.
6. AC6: an automated tester gets from sign-up to sign-in and a workspace without a verification e-mail, either server-wide (the variable) or per browser context (the `fl_test_auto_verify=1` cookie, or `GET /api/test/auto-verify` for a browser that can only navigate). Without an opt-in, sign-up still asks for the e-mail link and **Resend** gives its honest answer.
7. AC7: outside `FLOWLINE_ENV=test` the opt-ins do nothing. The route is a 404, the cookie is ignored, and auth built without the server (scripts, tests) logs one warning and ignores the variable.
8. AC8: e2e-army keeps at most 8 top-level files, the hub's cap, which this PR's CI failed on.
9. AC9 (CTO orders on PR #135): origin/main merged with a merge commit, `AI_QUESTIONS.md` identical to main, the #124 army cases moved into an existing auth army file with titles and tags kept, and that file run twice on one database.

## Verification report

| AC | Test or command | Observed |
| --- | --- | --- |
| AC1 | `tests/unit/test-auto-verify.test.ts`, block "spec AC1/AC2": a 5-row table on `requireEmailVerification`, and a sign-up created verified with no cookie | 44 passed (44), exit 0 |
| AC1 | `tests/integration/test-auto-verify-staging.test.ts`, "test: FLOWLINE_TEST_AUTO_VERIFY=1 verifies the sign-up, signs it in at once and sends no verification e-mail", with auth built under the switch | Sign-up returns a session token, the user row is verified, no verify token, no outbox mail; 5 passed (5), exit 0. Probe: pointed back at auth built without the switch, it fails with "expected null to deeply equal Any<String>" |
| AC1 | Test stack started with `FLOWLINE_TEST_AUTO_VERIFY=1`, no cookie: `POST /api/auth/sign-up/email`, then `GET /api/me` with the returned cookie, then `/api/test/outbox` polled for 5 s | Sign-up 200 with `emailVerified: true`, a session token and a `better-auth.session_token` cookie; `/api/me` 200; 0 outbox messages; script exit 0 |
| AC1 | The same stack: Playwright sign-up in Arabic and in English, no cookie | Both reach `/onboarding`: "سمِّ مساحة عملك" with `dir=rtl lang=ar`, "Name your workspace" with `dir=ltr lang=en`; "Check your inbox" shown 0 times; exit 0. The server log shows each sign-up `POST` followed directly by `GET /onboarding`; at `d581a195` the form had sent a second sign-in `POST` in between |
| AC2 | Unit block "spec AC1/AC2", rows `test` with the flag empty, `staging` and `production` | `requireEmailVerification` true in each (the 44/44 run) |
| AC2 | Integration cases "the fl_test_auto_verify=1 cookie verifies the sign-up" and "without any opt-in" | Both sign-ups return no session token (verification still required); passed in the 5/5 run |
| AC2 | Test stack without the variable: the two army `@issue-124 AC2` cases and the Playwright no-opt-in case | A new sign-up stays unverified, sign-in is refused until the link is used, and the form shows "Check your inbox" (passed, runs under AC6) |
| AC3 | Unit block "spec AC3": `register()` from `src/instrumentation.ts` throws for 7 `FLOWLINE_ENV` values; any non-empty value refuses, and the message does not repeat it; it starts under `test` with the switch and anywhere without it | Passed (the 44/44 run) |
| AC3 | `FLOWLINE_ENV=staging FLOWLINE_TEST_AUTO_VERIFY=1 NEXT_DIST_DIR=.next-ac3 next dev -p 3197` | "Error: An error occurred while loading instrumentation hook: [config] FLOWLINE_TEST_AUTO_VERIFY is test-only and FLOWLINE_ENV is not test: refusing to start. Unset FLOWLINE_TEST_AUTO_VERIFY." from `src/server/test-auto-verify.ts:45` via `src/instrumentation.ts:10`; exit 1 |
| AC3 | Control: the same command without the variable | "✓ Ready in 242ms"; `GET /api/health` reached the app (500, because that bare dev server has no `DATABASE_URL`); then stopped |
| AC4 | Unit block "spec AC4": a 12-row table of `FLOWLINE_ENV` and flag values, and "the per-context cookie does not turn it on" | Passed (the 44/44 run) |
| AC5 | Tests first: the 28 new unit cases against the code before `d581a195` | 24 failed, 20 passed (44): "isAutoVerifyEnabled is not a function", "expected true to be false", "Cannot find package '@/instrumentation'" |
| AC5 | Unit files that load the changed modules, one per run | `test-auto-verify` 44/44, `test-auto-verify-route` 8/8, `beta-mode-security` 5/5, `zitadel-review-fixes` 7/7, `auth-confirmation` 1/1, `auth-provider-fence` 5/5, `dv2-visual-fixes` 4/4, `federated-lock-order` 4/4, `federated-mfa-lifecycle` 13/13, `public-route-body-budget` 37/37, `sso-callback-lock-order` 2/2; all exit 0 |
| AC5 | Other checks | Integration 5/5; Playwright `e2e/test-auto-verify.spec.ts` 4/4, then 8/8 with `--repeat-each=2` (after a first run on the cold stack, described below); `pnpm lint` and `pnpm typecheck` exit 0 |
| AC6 | `e2e-army/85-sign-in-and-core-flow.e2e.ts`, twice on `flowline_test_124r7`: runs `01a14bf8-a349-7330-8c82-43920040cec0` and `01a14bf9-53ca-7584-9c30-a4a262fa2ab6` | The seven `@issue-124` cases passed in both runs (the three failing #85 cases are explained below) |
| AC6 | `playwright test e2e/test-auto-verify.spec.ts --project=chromium --workers=1` on the stack without the variable | 4 passed, exit 0 |
| AC6 | `curl -i /api/test/auto-verify` on the same stack | 303, `location: /sign-up`, `set-cookie: fl_test_auto_verify=1; Path=/; HttpOnly; SameSite=lax`, `cache-control: no-store` |
| AC6 | Playwright with the cookie, Arabic and English | `/sign-up` with `dir=rtl lang=ar`, then `dir=ltr lang=en`; after **Create account**, `/onboarding` with the workspace heading; "Check your inbox" shown 0 times |
| AC7 | `tests/integration/test-auto-verify-staging.test.ts`: with `FLOWLINE_ENV=staging` one warning, both opt-ins ignored, the link still sent and an unverified sign-in refused | Passed in the 5/5 run |
| AC7 | `tests/unit/test-auto-verify-route.test.ts` (404 unless `FLOWLINE_ENV=test`), and the unit block "auto-verify is impossible outside FLOWLINE_ENV=test" (8 `FLOWLINE_ENV` values) | 8/8; the block passed in the 44/44 run |
| AC8 | `tests/unit/e2e-army-tooling.test.ts` at the merge `6307c3fb`, before the fold | 1 failed, 11 passed: "expected 9 to be less than or equal to 8" at `:129` |
| AC8 | The same file after the fold (`eaa539ae`), and `ls e2e-army/*.e2e.ts` | 12/12, exit 0; 8 files |
| AC9 | `git log -1 --format=%P 6307c3fb`, and `git diff origin/main -- AI_QUESTIONS.md` | Parents `72970eca` and `cef5dd89` (origin/main); the diff is empty |
| AC9 | `e2e-army/85-sign-in-and-core-flow.e2e.ts` against its two sources | The #85 body (69 lines) and the #124 block (192 lines) are byte-identical (`cmp`); 12 titles, none repeated; the #124 tags `feat:fl-auth-api`, `feat:fl-sign-up` and `feat:fl-sign-in` kept; `e2e-army/124-test-auto-verify-signup.e2e.ts` deleted; the branch removes no line from the 85 file |

## First Playwright run on the restarted stack

The first run after the stack restart gave 3 passed and 1 failed: in the cookie case, "Name your workspace" was not visible within the 10 s assertion. The server log shows why. Sign-up answered 200 in 3.7 s (the first compile of the auth route), the form's sign-in `POST` answered 200 in 293 ms, and then `next dev` printed "○ Compiling /onboarding ..." with no `GET /onboarding` before the test ended. The next run on the same stack passed 4 of 4, and `--repeat-each=2` passed 8 of 8. No timeout or assertion was changed. The `d581a195` runs did not hit this because the army runs had compiled those routes first.

## A blank onboarding capture

The first server-wide Arabic capture showed the onboarding card with only its stepper. It was the stack's first `/onboarding` render (`GET /onboarding` in 890 ms). Everything missing (heading, text, input and buttons) sits inside the step's `.motion-enter` container, whose `m-enter` animation starts at opacity 0 (`src/app/globals.css:44`), while the stepper outside it was drawn. Playwright counts an element at opacity 0 as visible, so the heading wait had passed. The captures were taken again with animations fast-forwarded (`animations: "disabled"`). On that retake the step had opacity 1 and no running animation when the heading appeared, and both images show the full step.

## The #85 failures in the army runs

The three agent-driven `@issue-85` cases (sign in, wrong password, create a blank flow) failed in both runs with `MODEL_UNAVAILABLE: the "ai" package is not installed`, as they did in the two runs at `d581a195` (`01a14bdc-1b2d-7a98-aadf-8d04366f3fd3`, `01a14bdd-b8ee-70fd-8b45-9733ac91985e`). Agent steps need the `ai@^7` peer dependency, which this checkout does not resolve; the hub's runner has it. The fold copied those tests unchanged. A run with `E2E_ARMY_NOAGENT=1` (`01a14bdd-421d-7812-a97a-371e2c86a5de`) stopped at a run-level configuration error, because the agent fixture asks for a model before a test can skip, so it is not counted.

## CI before the fold

Four fast-tier runs failed in the static leg of `checks` on one test, `tests/unit/e2e-army-tooling.test.ts` "README and DEVELOPER_GUIDE state the hub's real cap (up to 8 top-level e2e-army/*.e2e.ts files), and the repo stays within it". Lint, typecheck, evidence and contract passed in each. The runs: 39063017571 (on `72970eca`; unit 1 failed, 1782 passed, 1 skipped), 38634588594, 38670814617 and 38685426496 (checked-out SHAs `30b23bc`, `a61b1b7` and `2e8dd94`), read from each run's static-leg `summary.json` and `unit.log`.

## Screenshots

Playwright (Chromium, 1280×860, full page) took the screenshots on the test stack at `028644d0`. The repo keeps raw evidence out of Git, so they are not committed.

- Cookie opt-in, stack without the variable: `124-sign-up-ar.png`, `124-after-sign-up-ar.png`, `124-sign-up-en.png`, `124-after-sign-up-en.png`.
- Server-wide switch, stack with `FLOWLINE_TEST_AUTO_VERIFY=1` and no cookie: the same four names, the after-sign-up images taken with animations fast-forwarded.

The Arabic sign-up page is mirrored, with the form and logo on the right and **إنشاء الحساب** as the submit button. Each after-sign-up image shows step 1 of 3 of onboarding with the workspace name filled in ("مساحة عمل Army" in Arabic, "Army's Workspace" in English); the Arabic one has step 1 on the right. The sets taken at `d581a195` showed the same screens.

## Commands

- Database: `createdb -h /tmp -O flowline flowline_test_124r7`, a throwaway database dropped after the runs. A temporary `.env.test` held synthetic values only (separate workspace and platform keys) and was removed afterwards.
- Stack: `FLOWLINE_TEST_PORT=3124 FLOWLINE_TEST_FAKE_PORT=4124 FLOWLINE_TEST_AI_PORT=4125 FLOWLINE_TEST_DB=flowline_test_124r7 hub-live/bin/suite.sh pnpm dev:test`, first without and then with `FLOWLINE_TEST_AUTO_VERIFY=1`, each stopped with `pnpm stop:test` and the same variables.
- Army: `E2E_ARMY_URL=http://localhost:3124 E2E_ARMY_CLI=agy pnpm exec e2e run e2e-army/85-sign-in-and-core-flow.e2e.ts --workers 1 --reporter list`.
- Playwright: the stack variables above plus `playwright test e2e/test-auto-verify.spec.ts --project=chromium --workers=1 --reporter=list`.
- Unit, one file per run: `pnpm exec vitest run --project unit <file> --maxWorkers=2`.
- Integration: `node scripts/with-env.mjs <temporary env file> vitest run --project integration tests/integration/test-auto-verify-staging.test.ts --maxWorkers=2`.
- The server-wide sign-up check and the screenshots used two one-off Node scripts (`fetch`, and `chromium` from `@playwright/test`), not committed.

## Not run, and limits

- No full local suite or build; CI runs them. `next start` was not run because it needs a production build. Next 16.3.6 awaits `register()` before it serves and exits 1 when it throws (`server/lib/start-server.js`).
- `tests/unit/changed-scope.test.ts` stalled locally after "RUN v5.0.2", twice. It reads no file this branch changes and passed in CI run 39063017571.
- The hub's stop hook runs `vitest related` without a test `DATABASE_URL`, so the integration project's global setup refuses to start ("Integration tests must run against flowline_test (got )"). The same file passes through `scripts/with-env.mjs`, as above.
- No Sentry issue exists for #124. It is a feature request for automated testers (context #110), not a production error.
- `/security-review` on the branch diff at `d581a195` reported no findings. The `/simplify` commit changes no access rule: the same opt-ins under the same `FLOWLINE_ENV=test` check.
- No CI, e2e-army, verify or CodeRabbit result is claimed for a head that contains these commits.

## Verification round on `0a64f97` and head `4a92d264` (2026-10-19)

### Gate and CI status
- The earlier CI failure on head `68408af` (Gate run 39076067076, static leg) was caused by the design-system token guard misidentifying `#124` in a comment in `src/app/(auth)/auth-form.tsx` as a forbidden hex color literal. Head `0a64f97` reworded the comment; Gate run 39222132887 passed cleanly.
- Origin/main was merged into `ai/124` at commit `44dc8166` with zero product conflict.
- Diff against `origin/main` for `AI_QUESTIONS.md` is empty (`git diff origin/main -- AI_QUESTIONS.md`).
- Diff against `origin/main` for `.github/` workflows is empty (`git diff origin/main --stat -- .github/`).
- e2e-army top-level file count is exactly 8 (`e2e-army/*.e2e.ts`), adhering to the repo limit in `tests/unit/e2e-army-tooling.test.ts`.
- No duplicate test titles exist in `e2e-army/85-sign-in-and-core-flow.e2e.ts`.

### Verify round on `0a64f97` root-cause analysis
- In verify round 5 on head `0a64f97`, the hub judged all acceptance criteria met, but `verify` reported `e2e-army` failed.
- The failure was external: three of the hub's own test cases hit `MODEL_OUTPUT_INVALID` under its Claude Haiku adapter.
- Two test titles were clarified to prevent runner/planner misinterpretation:
  1. `e2e/test-auto-verify.spec.ts` (`55b6e6ee`): Changed title from naming an action phrase "... Resend with that email on /resend-verification shows ..." to explicit steps "open /resend-verification, fill Email, click Resend: If the account is eligible, an email will arrive shortly."
  2. `tests/integration/test-auto-verify-staging.test.ts` (`d1b0431f`, `4a92d264`): Clarified that the test verifies auth built outside the Next.js server (scripts/tests), which logs one warning and ignores the env var, whereas the Next.js server itself refuses to start via `src/instrumentation.ts`.

### Local verification results on head `4a92d264`
- `pnpm typecheck`: Exit 0 (`tsc --noEmit` clean).
- `pnpm lint`: Exit 0 (ESLint clean across the repository).
- Unit tests:
  `pnpm exec vitest run --project unit tests/unit/test-auto-verify.test.ts tests/unit/test-auto-verify-route.test.ts tests/unit/e2e-army-tooling.test.ts tests/unit/gate-groups.test.ts --maxWorkers=2`
  Result: 4 test files passed, 72 tests passed (44 in test-auto-verify, 8 in test-auto-verify-route, 12 in e2e-army-tooling, 8 in gate-groups), 0 failed, exit 0.
- Integration tests:
  `FLOWLINE_ENV=test DATABASE_URL="postgres://flowline:flowline@localhost:5432/flowline_test" pnpm exec vitest run --project integration tests/integration/test-auto-verify-staging.test.ts --maxWorkers=2`
  Result: 1 test file passed, 5 tests passed (all 5 staging and test scenarios pass), 0 failed, exit 0.

### Security posture
- Dependencies: None added or updated.
- Secrets: None added or read.
- Environment variables: One test-only variable `FLOWLINE_TEST_AUTO_VERIFY` (strictly gated to `FLOWLINE_ENV=test`, refused at start-up in non-test environments).
- Permissions: Unchanged.

## Review round on `343e387` (2026-10-19)

### QA Finding 6acb57cdc997
- Finding: In `AGENTS.md`, the description of the auto-verify feature was overly detailed and needed simplification to focus on the key security constraint (only works in test environment).
- Root cause: Testing/usage mechanics (cookie parameters, endpoint path, browser API notes) were placed in the high-level `AGENTS.md` constitution rather than staying confined to `docs/DEVELOPER_GUIDE.md` and `README.md`.
- Fix in `AGENTS.md:33`: Simplified the clause to: `The only exception is the test-only sign-up auto-verify switch (src/server/test-auto-verify.ts, #124), strictly test-only (refused at startup outside FLOWLINE_ENV=test); never set it on beta or production.`
- Proof in `tests/unit/test-auto-verify.test.ts:229-242`: Added `AGENTS.md documentation guard (#124)` asserting that `AGENTS.md` explicitly states the test-only security constraint and startup refusal while omitting low-level testing mechanics. (Red: failed with `AssertionError: expected ... not to contain 'fl_test_auto_verify=1'`; Green: passed in 0ms).

