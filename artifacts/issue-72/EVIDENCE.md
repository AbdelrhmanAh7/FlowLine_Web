# Evidence — issue #72: audit failed and abandoned federated MFA steps

Tested commit: `eea6b30` (production change and tests; later commits change only Markdown). Failing-first commit: `8704395` (tests only).
Branch: `ai/72`, stacked on `ai/66` (PR #70, open draft) because the issue extends that PR's `tests/integration/sec-federated-mfa-regression.test.ts`; once #70 merges, this branch's own diff is the commits after `d70f567`.
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
| AC4 | `git diff d70f567..HEAD --stat -- .github` is empty; own diff about 290 lines including this file | Done |

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
