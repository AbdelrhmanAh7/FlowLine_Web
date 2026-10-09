# Evidence — issue #72: audit failed and abandoned federated MFA steps

Tested commits: `eea6b30` (production change and tests), then `612af72` (merge of `origin/main` after #66 landed as `9225fe9`; same production code and tests, re-run below). Failing-first commit: `8704395` (tests only).
Branch: `ai/72`. It was stacked on `ai/66` (PR #70); #70 is now squash-merged, so the PR's diff against `main` is #72 only.
Run on 2026-10-08, macOS, Node 26.10.0, Vitest 5.0.2, against a disposable PostgreSQL 16 in a temp directory (CI uses 17) with a throwaway `.env.test` from `.github/ci/env.test.template` (random secrets, fake provider values). No network, no real IdP, no credentials.

Carries REQ-FL-66-5 ("a failed or abandoned MFA step writes an audit entry") from the #66 PRD. Behaviour: [Failure audit](../../docs/security/FEDERATED_MFA.md#failure-audit).

| AC | Test (title prefix `@e2e @flow:federated-mfa @issue-72`) | Status |
|---|---|---|
| AC1 wrong code | AC1 AC3: a wrong workspace code writes one sso.mfa_failed (invalid_code) with the actor and no session; AC1 AC3: a wrong code after a social (GitHub) sign-in writes one platform signin.mfa_failed and no session | Pass |
| AC1 replayed code | AC1 AC3: a replayed workspace code writes one sso.mfa_failed (replayed_code) and issues no second session | Pass |
| AC1 expired / abandoned | AC1 AC3: an expired workspace challenge writes exactly one sso.mfa_failed (expired), however often it is retried or swept; AC1: an abandoned workspace challenge is audited once (expired) by the retention sweep; AC1: an abandoned social (GitHub) challenge is audited once (expired) by the retention sweep | Pass |
| AC1 rate limited (scope reason) | AC1: rate-limited guessing writes one sso.mfa_failed (rate_limited) per window, not one per request | Pass |
| AC2 | AC2: a successful completion writes exactly one sso.signin (localTotp) and no failure audit (workspace and GitHub) | Pass |
| AC3 | The AC1 AC3 tests assert `data` is exactly `{ reason }` (workspace) or `{ reason, provider }` (platform) and that the stored rows contain neither the code, the pending token, its hash nor any refusal message | Pass |
| AC4 | `git diff origin/main...HEAD --stat -- .github` is empty; diff against `main` about 285 lines including this file | Done |

## Results

- Failing first (`8704395`, production unchanged): the new file run gave **7 failed, 10 passed**; every failure was `expected [] to have a length of …` (no failure audit row). The AC2 guard and the 9 #66 tests passed.
- On `eea6b30`: `sec-federated-mfa-regression.test.ts` **17 passed**; with `sec-federated-totp`, `p4-retention`, `federated-lock-order`, `sec-platform` and `p3-sso`: **6 files, 74 tests passed**.
- Full integration project on `eea6b30`: **56 of 60 files passed**. The 4 failing files are not caused by this change:
  - `p2-code-sandbox.test.ts` (7): Docker is not running on this machine ("Docker or the sandbox image ... is not available").
  - `company-builder-cli.test.ts` (2 in the full run): `ISOLATION_UNVERIFIED` and a fail-closed check of the fake CLIs. They also fail with `src` and `tests` from the base `d70f567` (4 failures there), so the cause is the environment, not this change.
  - `email.test.ts` ("distinguishes expired links", expected `expired`, got `used`) and `local-scenarios.test.ts` (`low-stock-list`, run `failed`): both pass when rerun on `eea6b30` (19 tests) and at the base. The email helper `lastToken` reads the outbox without `ORDER BY`, so it can pick the earlier, already-used token; neither file calls the retention or federated code. Reported here as pre-existing flakes, not fixed (out of scope).
- Unit project: all federated suites pass (`federated-mfa-lifecycle`, `federated-lock-order`, `federated-mfa`, `federated-totp-replay`, `mfa-session-fence`: 38 tests). The mocked-DB lifecycle test now models `delete … returning` and the platform-audit insert and asserts the reasons (`invalid_code`, `expired`, `replayed_code`). The full unit project had 3 failures inside the sandbox, all in `egress.test.ts` / `codex-poc-egress-redirect.test.ts`, which bind local ports; both files pass outside the sandbox (32 tests).
- `tsc --noEmit`: clean. ESLint on the changed files: clean.

## Design notes

- Workspace challenges write `sso.mfa_failed` (`audit_event`); global-provider challenges write `signin.mfa_failed` (`platform_audit_event`, `result: denied`, new assurance value `federated_pending`, or `system` from the sweep). No schema migration: both columns are text.
- The replay refusal happens inside the completion transaction; its audit is written after the rollback. The other refusals happen before the transaction.
- `expired` is recorded once: a late request deletes the expired row (`delete … returning`) and records it, and `pruneOnce` deletes and records the rest before the generic `verification` cleanup.
- `rate_limited` is recorded at most once per user per five minutes (its own rate-limit key), so the audit cannot be flooded. `invalid_code` is already bounded by the five-per-five-minutes limit.
- Refusals from changed authority (recovery, factor change, unlink, revoked configuration or membership) are not MFA failures and stay unaudited. Unknown or malformed tokens have no actor and are not recorded.

## Review round 1 (PR #73)

- Finding: `docs/implementation/PHASE4_BETA_REPORT.md` appeared to drop the sentence recording the two known lock-order gaps (password-reset recovery; member role change/removal against the SSO audit insert). Cause: the #66/#72 summary had been appended to the same Markdown line, so the line diff showed the whole line as removed, though the sentence was still in it. Fix: the original line is restored byte-for-byte (no diff against `origin/main`), and the #66/#72 summary is a new paragraph that says the two gaps are unchanged. The gaps stay documented in `docs/security/FEDERATED_MFA.md` ("Known gaps"), which this branch does not change. Docs-only; no code or test change.

## Merge with main (rework round, `612af72`)

- PR #73 was `CONFLICTING` after #66 merged as a squash commit. The add/add conflicts in `tests/integration/sec-federated-mfa-regression.test.ts` and `docs/security/FEDERATED_MFA.md` were only where #72 extends the #66 text; the #72 side was kept. `PHASE4_BETA_REPORT.md` keeps main's line unchanged (two lock-order gaps included); the #72 paragraph no longer repeats the #66 sentence already on main.
- Re-run on `612af72` against a disposable PostgreSQL 16: `sec-federated-mfa-regression`, `sec-federated-totp`, `p4-retention`, `federated-lock-order`, `sec-platform` and `p3-sso`: **6 files, 74 tests passed**. Unit federated suites: **5 files, 38 tests passed**. `tsc --noEmit` clean; ESLint on the changed files clean.

## e2e-army test (rework round 2)

The hub's feature map ties the #72 files to four features (`fl-zitadel-federated-mfa`, `fl-audit-log`, `fl-platform-admin`, `fl-files` for the retention sweep), and the `e2e-army` gate needs a test tagged for each. `e2e-army/72-federated-mfa-failure-audit.e2e.ts` (`@issue-72`, `lvl:api`, no model) carries those tags. The throwaway stack has no IdP, so it cannot start a real federated challenge. The test checks what the stack can observe: a forged, well-formed challenge cookie still gets `401 FEDERATED_MFA_INVALID` twice, because the new expired-challenge cleanup and audit path must not mask the refusal. That attempt has no actor, so it writes no `sso.mfa_failed`. The workspace audit log contains neither that action nor the token, and the platform audit stays `404` for an ordinary user. The audited reasons and the sweep stay proven by the integration tests above; no endpoint triggers the retention job.

The repo does not depend on `e2e` and `@e2e-dev/web` yet (#85, draft PR #88), so `tsconfig.json` excludes `e2e-army/` from `pnpm typecheck` ([Developer guide](../../docs/DEVELOPER_GUIDE.md)). The hub runner type-checks the copied file. ESLint on the file: clean; `tsc --noEmit`: clean.

Run on `2f93536` (2026-10-08). The throwaway stack came from the hub's `run-local.sh FlowLine_Web ai/72` with `HOLD`. The file ran through the hub runner (`e2e` 0.18.0, `E2E_ARMY_NOAGENT=1`) from a copy under the runner's `tests/` folder: **1 passed** (3.1 s), then **1 passed** again on the same stack (the existing-account path). The unit file `federated-mfa-lifecycle.test.ts` also passed: **13 tests**.

Review threads: the CodeRabbit `wrongCode` thread (exclude offsets ±2) is already satisfied by `528432b` (`[-2, -1, 0, 1, 2]`). The PHASE4 report finding is satisfied by `2da1a97` (main's line is unchanged).
