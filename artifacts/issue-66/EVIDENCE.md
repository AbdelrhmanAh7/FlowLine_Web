# Evidence — issue #66: federated MFA regression tests (H3)

Tested commit: `8addb3319264eb2afdc19657adbee6f7e4b6c02d` (the tests). Later commits on this branch change only Markdown (this file and `AI_QUESTIONS.md` moved here from the repo root).
Branch base: `bc59cab`. Run on 2026-10-08, macOS, Node 26.10.0, Vitest 5.0.2, integration project, against a disposable PostgreSQL 16 in a temp directory (CI uses 17) with a throwaway `.env.test` built from `.github/ci/env.test.template` (random secrets, fake provider values). No network, no real IdP, no credentials.

File: `tests/integration/sec-federated-mfa-regression.test.ts`; helper: `githubCallbackRequest` in `tests/integration/zitadel-callback-fixture.ts`. PRD: REQ ids from the Notion PRD for FL #66.

| REQ | Test (title prefix `@e2e @flow:federated-mfa @issue-66`) | Status |
|---|---|---|
| REQ-FL-66-1 | AC1: workspace SSO for an MFA-enrolled user stops at the MFA step without a session; AC1: a social (GitHub) callback for an MFA-enrolled user stops at the MFA step without a session | Pass |
| REQ-FL-66-2 | AC2: workspace SSO for a user without MFA still signs in and is audited; AC2: a social (GitHub) callback for a user without MFA still signs in | Pass |
| REQ-FL-66-3 | AC3: failed MFA codes leave no usable session and no sign-in audit; completion writes one | Pass |
| REQ-FL-66-4 | AC3: an abandoned MFA step expires and can never be completed into a session | Pass |
| REQ-FL-66-5 | Moved to #72 (AI council decision on PR #70). The code writes no audit entry on a failed or abandoned step (documented design), so a test for it needs the production change #72 makes. The AC3 tests assert the current audit behaviour. See `AI_QUESTIONS.md` in this folder. | Moved to #72 |
| REQ-FL-66-6 | AC4: repeating the workspace SSO callback (same state and code) does not bypass MFA; AC4: repeating the social callback (same state and code) does not bypass MFA | Pass |
| REQ-FL-66-7 | AC4: the pending MFA token is not a session and cannot be replayed after use | Pass |
| REQ-FL-66-8 | One small helper (`githubCallbackRequest`); all other setup reuses `federation-fixture.ts`, `platform-helpers.ts` and `helpers.ts` | Done |

## Results

- On the tested commit: `sec-federated-mfa-regression.test.ts` and `sec-federated-totp.test.ts` together: **2 files, 31 tests passed** (9 new, 22 existing).
- MFA check disabled on the workspace SSO path (`if (user.twoFactorEnabled)` → `if (false && ...)` in `src/server/sso.ts`, not committed): **5 failed, 4 passed**. Failing: both AC3 tests, AC1 workspace, AC4 workspace callback, AC4 pending token.
- MFA check disabled in the social/global plugin (`if (!user?.twoFactorEnabled || federated) return;` in `src/server/federated-mfa.ts`, not committed): **2 failed, 7 passed**. Failing: AC1 GitHub, AC4 GitHub callback.
- Both AC2 tests pass with and without each mutation, so they guard against over-blocking.
- ESLint on both changed test files: clean. `tsc --noEmit`: clean.

## Scope checks

- No production source, no `.github/workflows`, no secrets changed (`git diff bc59cab..HEAD --stat`).
- Own diff: about 185 lines of tests and helper, plus Markdown.
