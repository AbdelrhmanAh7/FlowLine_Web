# Evidence for Issue #434: Arabic Typography Em-Dash Consistency for backupCodes

Supersedes part of [#383](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/383) (finding `232f2a67a05a`, parent issue #165).

## Originating Issues & Context
- PR: [#383](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/383)
- Issue: #434 (split from #383)
- Parent Issue: #165
- Originating Sentry issue: None (Localization QA review finding `232f2a67a05a` from PR #383)
- Finding reference: [PR #383 comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/383#issuecomment-6321637405)
- Review finding: `src/i18n/messages/ar.json:1: Regular hyphen (-) used instead of em-dash (—) for account.security.twoFactor.backupCodes. This should be consistent with the English version.`

## Acceptance Criteria

| AC | Requirement | Implementation & Verification |
|---|---|---|
| **AC1** | In `src/i18n/messages/ar.json`, `account.security.twoFactor.backupCodes` is defined and uses an em-dash (`—`, U+2014) instead of a regular hyphen (`-`), reading exactly `"رموز النسخ الاحتياطي — تُعرض مرة واحدة فقط، احتفظ بها خارج الإنترنت."` | `src/i18n/messages/ar.json`: added `account.security.twoFactor.backupCodes` with canonical em-dash typography |
| **AC2** | In `src/i18n/messages/en.json`, `account.security.twoFactor.backupCodes` is defined and uses an em-dash (`—`, U+2014), reading exactly `"Backup codes — shown only once, store them offline."` | `src/i18n/messages/en.json`: added matching `account.security.twoFactor.backupCodes` entry |
| **AC3** | All `backupCodes` messages across both Arabic and English catalogues (including `platformAdmin.setup.backupCodes` and `account.security.twoFactor.backupCodes`) consistently use an em-dash (`—`) and never contain regular hyphen with spaces (` - `) | Verified by unit tests in `tests/unit/i18n.test.ts` scanning both catalogues |
| **AC4** | Automated regression test in `tests/unit/i18n.test.ts` fails on base branch (missing key / regular hyphen) and passes on head | Demonstrated failure on base (`rc=1`, 2 failed tests) and pass on head (`rc=0`, 20 passed tests) |
| **AC5** | Pre-push quality checks (`pnpm typecheck`, `pnpm lint`, `vitest`) pass with exit code 0 | `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `vitest` (exit 0) |

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC4 (Regression on base) | Demonstrate regression failure on base branch before fix | `git checkout HEAD -- src/i18n/messages/ && nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts` | 1 | `2 failed \| 18 passed (20)`:<br>• `FAIL tests/unit/i18n.test.ts > Arabic typography and em-dash consistency (finding 232f2a67a05a, #434) > account.security.twoFactor.backupCodes uses em-dash (—) and not regular hyphen (-)`<br>`AssertionError: account.security.twoFactor.backupCodes must be defined in ar.json: expected undefined to be defined`<br>• `FAIL tests/unit/i18n.test.ts > Arabic typography and em-dash consistency (finding 232f2a67a05a, #434) > all backupCodes messages across catalogues use em-dash (—) and not regular hyphen (-)`<br>`AssertionError: expected 1 to be greater than or equal to 2` |
| AC1, AC2, AC3, AC4 (Head verification) | Verify `account.security.twoFactor.backupCodes` and all `backupCodes` entries across Arabic and English catalogues use em-dash | `nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts --maxWorkers=2` | 0 | `✓ 20 passed (20)` in 375ms (exit 0) |
| AC3 | Verify integration content text tests remain unaffected | `nice -n 10 pnpm exec vitest run tests/unit/i18n-content-text.test.ts --maxWorkers=2` | 0 | `✓ 43 passed (43)` in 650ms (exit 0) |
| AC5 (Types) | Full TypeScript compilation check | `pnpm typecheck` | 0 | `tsc --noEmit` clean (exit 0) |
| AC5 (Lint) | ESLint check across all files | `pnpm lint` | 0 | `eslint .` clean (exit 0) |

## UI & Playwright Screenshot Note
- UI Screenshot: Not applicable (UI exempt). `account.security.twoFactor.backupCodes` is an i18n translation catalogue string pending two-factor authentication account security UI integration (issue #199 / PR #318). It is not rendered in current user-facing UI on `main`. Full RTL typography and em-dash formatting consistency is verified programmatically by unit tests in `tests/unit/i18n.test.ts`.

## Changed Covering Tests
- `tests/unit/i18n.test.ts`: Added suite `Arabic typography and em-dash consistency (finding 232f2a67a05a, #434)` with 2 test cases:
  1. `account.security.twoFactor.backupCodes uses em-dash (—) and not regular hyphen (-)`: asserts definition in `ar.json` and `en.json`, exact Arabic string equality `"رموز النسخ الاحتياطي — تُعرض مرة واحدة فقط، احتفظ بها خارج الإنترنت."`, presence of em-dash `—`, and absence of ` - `.
  2. `all backupCodes messages across catalogues use em-dash (—) and not regular hyphen (-)`: recursively walks Arabic and English catalogues verifying all `backupCodes` strings use em-dash and prohibit regular hyphen ` - `.

## E2E Gate Note
`E2E: not needed — static i18n translation catalog update for account.security.twoFactor.backupCodes; UI component integration is part of the account security flow (#199 / #318) and not rendered in user-facing UI on main.`

## Skills Used
- `systematic-debugging`: Traced finding `232f2a67a05a` back to commit `a3d58130` on PR #318 / PR #383, diagnosed root cause (regular hyphen used instead of em-dash), and verified exact character codes (`—` U+2014 vs `-` U+002D).
- `tdd`: Added regression test in `tests/unit/i18n.test.ts` proving failure on base state (exit 1, 2 failed tests) and pass on head state (exit 0, 20 passed tests).
- `verification-before-completion`: Executed all local test, typecheck, and lint verification gates; confirmed real exit codes and stdout.
- `model-effort-routing`: Tool: Gemini 3.8 Flash · Effort: low · Why: typography fix, unit test coverage, and documentation verification.

## Tested Commit SHA
- Base commit: `ff98493d0cbda239c838fb605a6d749c0119809d` (origin/main)
- Implementation commit: `562b1a9c44830ea4555b50a61d97a5afc5d73eec` (ai/434)
- Merge commit: `1fd28dbad8f8c2e60a3d46aab6c0442ce87c1734`
- Verified cleanly against local gates: `pnpm typecheck` (rc=0), `pnpm lint` (rc=0), `vitest` (rc=0).

