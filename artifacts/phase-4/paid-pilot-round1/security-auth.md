# Security auth candidate preparation

- Base: `9641ad1e684cad7b84bd2385751ea19b0a9d4060` (main).
- Source series: `ee70336`, `546db93`, `be2119d`, `239a1fe`, `0230ccf`, `2df3b31`, `609c95a`, applied using `cherry-pick --no-commit` on `codex/pilot-security-auth-round1`.
- Tested candidate: staged uncommitted source diff atop base. Evidence added after tests; no new committed SHA is claimed.
- Units: `pnpm exec vitest run --project unit --fileParallelism=false tests/unit/auth-confirmation.test.ts tests/unit/zitadel-issuer-binding.test.ts tests/unit/zitadel-platform-auth.test.ts tests/unit/zitadel-review-fixes.test.ts tests/unit/zitadel-env-config.test.ts`: **5 files / 19 passed**, no skips.
- `pnpm exec tsc --noEmit`: passed. `git diff --cached --check`: passed.
- Focused integration via `run-auth-focused.mjs`: `sec-sso-email-prehijack`, `sec-sso-link-consent`, `sec-zitadel-issuer-binding`, `p3-sso`: **4 files / 28 passed**, no skips. Fresh owned database `flowline_test_pilotsecauth` created on the existing local DB container; migrations and synthetic seeding succeeded; no worker/server launched. Database retained for bounded reproduction.
- H1/H2/M7 committed fixes are included. **H3 remains OPEN**: the source lane has substantial unfinished federated MFA changes, deliberately preserved and not copied. Platform MFA assurance and federated sign-in require that separately reviewed work.
- H1/H2 email/IdP tests are local fixtures/outbox; live email, ZITADEL and tenant-provider acceptance remain unverified.
- Report included for standalone main candidate; after the report PR merges, retain canonical report and add only auth remediation annotations.
- No environment files read, real providers called, browser suites/local gates, commits or pushes. Original dirty lane preserved.
- Model/tool: Codex security worker (inherited lead model).

## Fresh authority-race follow-up

After the source-series checks, independent lead review identified stale-config issuance and automatic re-membership of removed users. The candidate now uses Better Auth's adapter to build an unissued session, then checks current initiating session (when present), user, enabled configuration stamp, current member, approved binding and new session under database locks. Adapter hooks run before locks; failed admission deletes its unissued session. Membership removal stays effective; an explicit owner re-grant restores sign-in with its real role.

Added five mid-JWKS regressions: config replacement, config disabling, membership removal, account-link removal, and revoked mailbox verification. The previous membership-provisioning assertion now checks rejection after removal, absence of restored membership, then successful explicit re-grant; security assertions were strengthened, no test skipped or retried.

Fresh final source: **4 integration files / 33 tests passed**, no skips; `pnpm exec tsc --noEmit` and targeted ESLint passed. An intermediate typecheck found callback closure narrowing of `claims.sub`; captured the validated subject in a constant and reran typecheck successfully. H3 remains open and future MFA hooks must be tested with this adapter-preserving fence.
