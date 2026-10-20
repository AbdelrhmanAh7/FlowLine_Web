# Evidence — Issue #303: fix: qa finding: docs/implementation/PHASE4_BETA_REPORT.md, new 108 section (split from #214)

Branch: `ai/303` (based on `main` at `264336fb`). Tested head SHA: `26c2e2535363aebcacea5a1e38aa543808b48c09`.

All checks and tests were executed locally in the repo workspace `/Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-303`.

## Skills Used
- `systematic-debugging`: Identified root cause of QA Round 1 finding (regex matching Reconciliation paragraph instead of H3 review section) and isolated section slices.
- `diagnosing-bugs`: Analyzed documentation inconsistency between `PHASE4_BETA_REPORT.md` and `FEDERATED_MFA.md`.
- `verification-before-completion`: Executed all local checks (`pnpm typecheck`, `pnpm lint`, Vitest unit tests) and verified base-fail / head-pass behavior.

## Originating Sentry Issue
- Originating Sentry issue: None (QA / documentation consistency finding split from PR #214 / parent issue #108; not a runtime exception or crash).

## UI Verification Note
- UI: Non-user-facing change (documentation and unit test only; no UI components or browser flows modified; Playwright screenshots / RTL and LTR exempt).

## Changed Covering Tests
- `tests/unit/email-token-lock-order-docs.test.ts`: New unit regression test asserting documentation consistency across `docs/implementation/PHASE4_BETA_REPORT.md` and `docs/security/FEDERATED_MFA.md`.
- `tests/integration/federated-lock-order.test.ts`: Reused `routeTransactions` export from `tests/integration/pg-lock-helpers.ts` (removed duplicate local implementation).
- `tests/integration/account-delete-sso-lock-order.test.ts`: Documented #108 acceptance criteria and history in header comments.
- `tests/integration/pg-lock-helpers.ts`: Documented #108 authoring and #37 reuse in header comments.

## Acceptance Criteria and Verification Report

| Req / AC | Description | Verification Method | Result | Exit Code |
|---|---|---|---|---|
| AC1 | Explicit numbered Acceptance Criteria defined and mapped to verification results. | This verification report and evidence table. | Verified | 0 |
| AC2 | In `docs/implementation/PHASE4_BETA_REPORT.md`, the new #108 section, H3 review section (~line 140), and Reconciliation paragraph all consistently describe `tests/integration/email-token-lock-order.test.ts` as having passed locally on 2026-10-08 against PostgreSQL (issue #45) and verified against throwaway databases for #109 (`flowline_test_109`) and #108 (`flowline_test_i108`), with CI as the gate. | Verified via doc inspection and unit regression test `tests/unit/email-token-lock-order-docs.test.ts`. | PASSED (2/2) | 0 |
| AC3 | In `docs/security/FEDERATED_MFA.md`, the Email-token lock order checks and validation limits match this status (passed locally on 2026-10-08 against PostgreSQL). | Verified via doc inspection and unit regression test `tests/unit/email-token-lock-order-docs.test.ts`. | PASSED (2/2) | 0 |
| AC4 | No conflicting claims: neither `docs/implementation/PHASE4_BETA_REPORT.md` nor `docs/security/FEDERATED_MFA.md` marks `tests/integration/email-token-lock-order.test.ts` as "not executed locally" or "unexecuted". | Regex assertion in `tests/unit/email-token-lock-order-docs.test.ts`. | PASSED (2/2) | 0 |
| AC5 | QA Round 1 finding resolution: Anchor H3 assertion in `tests/unit/email-token-lock-order-docs.test.ts` specifically to the `## H3 security readiness review` section and require the phrase `'two-connection PostgreSQL test'` so it cannot match the Reconciliation paragraph. | Scoped assertion in `tests/unit/email-token-lock-order-docs.test.ts`. | PASSED (2/2) | 0 |
| AC6 | Regression test demonstrates failure on base branch (`main`) and passes on head branch (`ai/303`). | Executed `tests/unit/email-token-lock-order-docs.test.ts` against base docs (FAILED, exit code 1) and head docs (PASSED, exit code 0). | RED on base, GREEN on head | 0 |
| AC7 | Pre-push checks (`pnpm typecheck`, `pnpm lint`, and unit test suite) run clean with zero errors. | Executed `pnpm typecheck`, `pnpm lint`, and vitest test runs. | Clean | 0 |
| AC8 | PR body states "Supersedes part of #214" and notes that E2E tests are not needed (pure documentation consistency and unit test, non-user-facing). | Verified in PR description and NEXT_ACTION.md. | Complete | 0 |

## Test Execution Evidence

### 1. Regression Test Failure on Base (before fix)
```
$ node -e '
const cp = require("child_process");
const fs = require("fs");
const currentDocs = fs.readFileSync("docs/implementation/PHASE4_BETA_REPORT.md", "utf8");
try {
  const mainDocs = cp.execSync("git show main:docs/implementation/PHASE4_BETA_REPORT.md", { encoding: "utf8" });
  fs.writeFileSync("docs/implementation/PHASE4_BETA_REPORT.md", mainDocs);
  const out = cp.spawnSync("pnpm", ["exec", "vitest", "run", "tests/unit/email-token-lock-order-docs.test.ts"], { encoding: "utf8" });
  console.log("Exit code on base docs:", out.status);
  console.log(out.stdout);
} finally {
  fs.writeFileSync("docs/implementation/PHASE4_BETA_REPORT.md", currentDocs);
}
'

Exit code on base docs: 1

 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-303

 ❯ |unit| tests/unit/email-token-lock-order-docs.test.ts (2 tests | 2 failed) 5ms
   ❯ docs consistency: email-token-lock-order test execution status (2)
     × never marks tests/integration/email-token-lock-order.test.ts as unexecuted or not executed 4ms
     × consistently records email-token-lock-order.test.ts passed locally against PostgreSQL across docs 1ms

 Test Files  1 failed (1)
      Tests  2 failed (2)
   Duration  375ms
```

### 2. Regression Test Passing on Head (after fix)
```
$ pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts

 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-303

 ✓ |unit| tests/unit/email-token-lock-order-docs.test.ts (2 tests) 2ms
   ✓ docs consistency: email-token-lock-order test execution status (2)
     ✓ never marks tests/integration/email-token-lock-order.test.ts as unexecuted or not executed 1ms
     ✓ consistently records email-token-lock-order.test.ts passed locally against PostgreSQL across docs 0ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  153ms
```

### 3. Related Ledger & Documentation Unit Tests Passing
```
$ pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts tests/unit/email-token-lock-order.test.ts tests/unit/docs-index.test.ts

 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-303

 ✓ |unit| tests/unit/email-token-lock-order-docs.test.ts (2 tests) 2ms
 ✓ |unit| tests/unit/docs-index.test.ts (4 tests) 4ms
 ✓ |unit| tests/unit/email-token-lock-order.test.ts (11 tests) 5ms

 Test Files  3 passed (3)
      Tests  17 passed (17)
   Duration  447ms
```

### 4. TypeScript Typecheck
```
$ pnpm typecheck
> flowline@0.1.0 typecheck /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-303
> tsc --noEmit

Exit code: 0
```

### 5. ESLint
```
$ pnpm lint
> flowline@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-303
> eslint . --cache --cache-location node_modules/.cache/eslint/

Exit code: 0
```

### 6. CI Docs Check Simulation
```
$ node -e '
const cp = require("child_process");
const files = cp.execSync("git diff --name-only main..HEAD", { encoding: "utf8" }).trim().split("\n");
const pages = [files.map(f => ({ filename: f }))];
const res = cp.spawnSync(process.execPath, ["scripts/ci/docs-check.mjs"], { input: JSON.stringify(pages), encoding: "utf8", env: { ...process.env, WAIVED: "false", PR_BODY: "" } });
console.log("Exit:", res.status, "Output:\n" + res.stdout);
'

Exit: 0 Output:
## Docs check

Code files changed: 4
Docs changed: 3
- "docs/implementation/PHASE4_BETA_REPORT.md"
- "docs/security/FEDERATED_MFA.md"
- "NEXT_ACTION.md"
```

## QA Review Findings — Root-Cause Analysis and Verification

### QA Round 1 Finding (`494f1c201fd5`)
`tests/unit/email-token-lock-order-docs.test.ts:25-27` (on commit `4b78381`): the H3 assertion
`/tests\/integration\/email-token-lock-order\.test\.ts.*passed locally on 2026-10-08 against PostgreSQL/`
matched against the **entire** `betaReport` string, so it was also satisfied by the Reconciliation
paragraph (line 128 in `PHASE4_BETA_REPORT.md`), not only the H3 section (line 140).

### Root Cause
The original assertion used `expect(betaReport).toMatch(...)` — a whole-document match.
Because the Reconciliation paragraph (in `## Account deletion vs the user's own SSO sign-in`,
line 122) **also** contains `email-token-lock-order.test.ts … passed locally on 2026-10-08
against PostgreSQL`, the regex was ambiguous: it did not pin the H3 paragraph.

### Fix (commit `26c2e253`, file `tests/unit/email-token-lock-order-docs.test.ts:24-30`)
1. **Section scoping**: `betaReport.split("## H3 security readiness review")[1]?.split(/^## /m)[0]`
   extracts only the text between `## H3 security readiness review` and the next `## ` heading.
   The Reconciliation paragraph (in a different `##` section) is excluded.
2. **Unique anchor**: the regex now requires `two-connection PostgreSQL test` — a phrase present
   only in the H3 section, never in the Reconciliation paragraph.
3. Applied the same section-scoping to the `#108` and `#109` assertions (lines 33-47).

### QA Round 2 Verification (`742158b6c8c2` & `fb7fc4f024d6`)
On commit `26c2e253`:
- Finding `742158b6c8c2` (`docs/implementation/PHASE4_BETA_REPORT.md`): Verified that H3 review section (~line 140) states that `tests/integration/email-token-lock-order.test.ts` passed locally on 2026-10-08 against PostgreSQL (issue #45; also verified locally on #108 and #109), and CI is the gate, consistent with `docs/security/FEDERATED_MFA.md`.
- Finding `fb7fc4f024d6` (`tests/unit/email-token-lock-order-docs.test.ts`): Verified that `tests/unit/email-token-lock-order-docs.test.ts` asserts this status with scoped assertions that fail on base (`main`) and pass on head (`ai/303`).

### Proof the fix is correct
```
# H3 section does NOT include Reconciliation paragraph:
$ node -e "
const fs = require('fs');
const b = fs.readFileSync('docs/implementation/PHASE4_BETA_REPORT.md','utf8');
const h3 = b.split('## H3 security readiness review')[1]?.split(/^## /m)[0] ?? '';
console.log('H3 includes Reconciliation:', h3.includes('Reconciliation 2026-10-14'));
console.log('H3 matches regex:', /two-connection PostgreSQL test/.test(h3));
"
H3 includes Reconciliation: false
H3 matches regex: true
```

### Re-verification (session 2026-10-20T00:03 UTC+3)
```
# Regression on base (main docs):
Exit code on base docs: 1
 ❯ |unit| tests/unit/email-token-lock-order-docs.test.ts (2 tests | 2 failed) 6ms
     × never marks tests/integration/email-token-lock-order.test.ts as unexecuted or not executed 5ms
     × consistently records email-token-lock-order.test.ts passed locally against PostgreSQL across docs 1ms
 Test Files  1 failed (1)
      Tests  2 failed (2)

# All pass on head (ai/303 docs):
$ pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts
 ✓ |unit| tests/unit/email-token-lock-order-docs.test.ts (2 tests) 2ms
     ✓ never marks tests/integration/email-token-lock-order.test.ts as unexecuted or not executed 1ms
     ✓ consistently records email-token-lock-order.test.ts passed locally against PostgreSQL across docs 0ms
 Test Files  1 passed (1)
      Tests  2 passed (2)

# Related tests (17/17):
$ pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts tests/unit/email-token-lock-order.test.ts tests/unit/docs-index.test.ts --maxWorkers=2
 Test Files  3 passed (3)
      Tests  17 passed (17)

# Pre-push:
$ pnpm typecheck  -> Exit code 0
$ pnpm lint       -> Exit code 0
```

### Rebase & Merge Verification on Latest `origin/main` (2026-10-20T07:24 UTC+3)
Merged latest `origin/main` (commits up to `116935af` including #214 and `9a345f18` #316) into `ai/303`. Resolved all conflicts cleanly:
- `NEXT_ACTION.md`: Kept both issue #303 and issue #316 handoffs intact.
- `PHASE4_BETA_REPORT.md`: Preserved reconciled status for `email-token-lock-order.test.ts` (passed locally on 2026-10-08 against PostgreSQL, verified on #108 and #109) and incorporated new pilot-metrics section from main.
- `FEDERATED_MFA.md`: Kept evidence link and local-pass status from origin/main.
- `tests/integration/account-delete-sso-lock-order.test.ts`: Preserved clean concise history comment from main.

### CTO Rework Resolution on PR #308 (2026-10-20)
Addressed CTO rework review finding on PR #308 regarding internal contradiction in `docs/implementation/PHASE4_BETA_REPORT.md`:
1. In `docs/implementation/PHASE4_BETA_REPORT.md` line 124, restored attribution to issue #109 (PR #216, commit `d86fb7d7`) for account deletion vs SSO lock ordering ('lock the user row and write its account.deleted audit rows before locking workspaces FOR UPDATE').
2. In line 126, restored pre-fix references to consistently point to pre-d86fb7d7 / parent `83c7bb8e` rather than pre-#65.
3. Verified clean execution of `tests/unit/email-token-lock-order-docs.test.ts` (2/2 pass) and all pre-push checks (`pnpm typecheck`, `pnpm lint`).

Verification on merged working tree:
- `pnpm typecheck` -> Exit code 0
- `pnpm lint` -> Exit code 0
- `pnpm exec vitest run tests/unit/email-token-lock-order-docs.test.ts tests/unit/email-token-lock-order.test.ts` -> 2 files, 13 passed (13) -> Exit code 0
- `node scripts/ci/docs-check.mjs` (simulated CI check) -> Exit code 0

