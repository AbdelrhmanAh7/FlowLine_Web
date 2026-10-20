# Evidence — Issue #318: fix: qa finding: The PR includes changes to src/app/account/security/two-factor-card.tsx (split from #269)

PR #327 (supersedes part of #269, parent issue #199).
Tested commit: `42639cc6`

All checks and tests were executed locally in the workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-318`.

## Acceptance Criteria and Verification Report

| Req / AC | Description | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| **AC1** | Document `/account/security` route and `TwoFactorCard` enrolment/disabling in `docs/security/ACCOUNT_SECURITY.md` and index in `docs/README.md`. | Verified via `tests/unit/docs-index.test.ts:32-48` checking table row in `docs/README.md` and content in `docs/security/ACCOUNT_SECURITY.md`. | PASS (5/5 unit tests) | 0 |
| **AC2** | Localize TOTP specification with Arabic terms (`TOTP (SHA-1، 6 أرقام، خطوة 30 ثانية)`), reword password handling to "cleared from the input on submit", scope Engine decoupling, and cite federated MFA fencing implementation (`src/server/federated-mfa.ts`) and tests (`tests/unit/mfa-session-fence.test.ts`, `tests/integration/sec-federated-mfa-regression.test.ts`). | Verified via `tests/unit/docs-index.test.ts:40-47` asserting each required phrase and code reference is present in `docs/security/ACCOUNT_SECURITY.md`. | PASS (5/5 unit tests) | 0 |
| **AC3** | `TwoFactorCard` disables Cancel button while requests are pending (`disabled={pending !== null}`) and enforces request-id stale-response guards (`requestIdRef`) across `enable()`, `verify()`, `disable()`, and `cancel()` to discard late in-flight responses. | Verified via `tests/unit/account-security-two-factor.test.ts:21-70` asserting button attributes, function guards, and mid-request cancellation simulation. | PASS (7/7 unit tests) | 0 |
| **AC4** | Document why TOTP secret and backup codes enforce `dir="ltr"` in RTL/Arabic contexts via code comments in `src/app/account/security/two-factor-card.tsx`. | Verified via `tests/unit/account-security-two-factor.test.ts:54-58`. | PASS (7/7 unit tests) | 0 |
| **AC5** | In `src/i18n/messages/ar.json`, use a regular hyphen (`-`) instead of em-dash (`—`) for `account.security.twoFactor.backupCodes`. | Verified via inspection and `tests/unit/i18n.test.ts` (16/16 tests pass). | PASS (16/16 unit tests) | 0 |
| **AC6** | Update `NEXT_ACTION.md` and `docs/implementation/PHASE4_BETA_REPORT.md` referencing PR #327 (supersedes part of #269) and accurately qualifying test counts (4 tests in `e2e/account-security.spec.ts` + 1 targeted Arabic security test in `e2e/arabic.spec.ts` = 5 specs). | Verified in `NEXT_ACTION.md` and `docs/implementation/PHASE4_BETA_REPORT.md`. | PASS | 0 |
| **AC7** | Pre-push checks: typecheck, lint, and secrets audit pass cleanly. | `pnpm typecheck`, `pnpm eslint`, and `node scripts/check-evidence-secrets.mjs`. | PASS | 0 |

---

## Command Outputs

### 1. Unit Tests
```bash
$ pnpm vitest run tests/unit/account-security-two-factor.test.ts tests/unit/docs-index.test.ts tests/unit/i18n.test.ts
✓ |unit| tests/unit/account-security-two-factor.test.ts (7 tests) 54ms
✓ |unit| tests/unit/i18n.test.ts (16 tests) 43ms
✓ |unit| tests/unit/docs-index.test.ts (5 tests) 3ms

Test Files  3 passed (3)
     Tests  28 passed (28)
```
Exit code: 0

### 2. TypeScript Typecheck
```bash
$ pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
```
Exit code: 0

### 3. ESLint Check
```bash
$ pnpm eslint src/app/account/security/two-factor-card.tsx tests/unit/account-security-two-factor.test.ts tests/unit/docs-index.test.ts
```
Exit code: 0

### 4. Evidence Secrets Audit
```bash
$ node scripts/check-evidence-secrets.mjs
check-evidence-secrets: 0 local secret value(s) checked across 176 file(s); 0 hit(s)
```
Exit code: 0
