# Issue #474 — AC4 evidence correction

Refs #474. Supersedes part of #385.

## Acceptance criteria

1. **AC1:** Identify the repository's `e2e:army` workflow for the three historical `@issue-301` scenarios, replacing Vitest as their verification method.
2. **AC2:** Record AC4 as **UNVERIFIED** unless those scenarios actually run and pass; include the reason and distinguish an unrun command from exit 0.
3. **AC3:** Record first-hand local evidence-check, lint, typecheck and focused docs-check results, including exit codes and limitations.

## Finding and scope

[Originating review on #385](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/385#discussion_r4354079804).
Originating Sentry issue: none supplied; this is a documentation defect.

Inspected application/base commit: `cd7bad12fb0f816ee04b525b82e2fee0bd8b83e2` (`origin/main` and initial HEAD).
Inspected historical evidence: `origin/ai/301` at `e5e510db81ac97bc935a433fd387fdc0e65a5cf0`, `docs/evidence/301/EVIDENCE.md`, AC4 verification row.
Verification date: 2026-10-26. Environment: macOS, Node 26.10.0, pnpm 10.32.1 (package requires Node 24.x; local pnpm warns).
Local checks below cover that application commit plus this documentation-only change.

The historical row claims PASS from `pnpm vitest related --run --passWithNoTests ...` and a reference to an e2e file. Vitest does not execute the e2e-army scenarios. That command and exit code cannot establish AC4.

`git ls-tree origin/main docs/evidence/301/EVIDENCE.md` returned no entry (exit 0). The source document is absent from main: this issue records the correction here without importing the parent branch or recreating its document. The original row still needs updating on #385 before that document lands.

## Corrected historical AC4 entry

**AC4: UNVERIFIED.** Required scenarios in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:

- API: saved scoped key stays server-side; Test connection uses only the saved URL (`feat:fl-connections`).
- English UI: Test connection reports the account (`feat:fl-integrations`, `feat:fl-sign-in`).
- Arabic UI: translated control/result and RTL direction (`feat:fl-i18n-rtl`, `feat:fl-integrations`).

Use the existing repository runner, with no new dependency:

```sh
nice -n 10 pnpm e2e:army e2e-army/147-mizano-create-customer-and-quote.e2e.ts --grep @issue-301 --workers=1
```

**NOT RUN; exit code: N/A.** `rg -n '@issue-301' e2e-army` returned no matches (exit 1). The file exists, but those three scenarios are absent from this checkout. `.env.test` is also absent (`test -f .env.test`, exit 1). An e2e run here cannot verify the historical scenarios. No API, LTR, RTL or screenshot pass is claimed. After the scenarios are available, run the workflow and require all three to execute without skips before changing AC4's status.

## VERIFICATION REPORT

| Criterion | Tests / command / inspection | Observed result | Exit code |
| --- | --- | --- | --- |
| AC1 | Inspect `package.json`, `scripts/e2e-army.mjs` and `docs/DEVELOPER_GUIDE.md`; workflow command above | Repository runner identified; workflow not run | N/A (inspection) |
| AC2 | `git show origin/ai/301:docs/evidence/301/EVIDENCE.md` | Historical Vitest-based PASS found; superseded here by UNVERIFIED | 0 |
| AC2 | `git ls-tree origin/main docs/evidence/301/EVIDENCE.md` | No document on main | 0 |
| AC2 | `rg -n '@issue-301' e2e-army` | No historical scenarios found | 1 |
| AC2 | `test -f .env.test` | Test environment file absent | 1 |
| AC3 | `pnpm check:evidence -- docs/evidence/474/EVIDENCE.md docs/implementation/PHASE4_BETA_REPORT.md` | 179 files scanned, 0 hits; 0 local secret values available, so no real-secret validation | 0 |
| AC3 | `pnpm lint` | Completed with no lint diagnostics | 0 |
| AC3 | `pnpm typecheck` | Completed with no TypeScript errors | 0 |
| AC3 | `nice -n 10 pnpm exec vitest run tests/unit/docs-check-script.test.ts --maxWorkers=2` | 1 file passed; 95 tests passed, 0 failed | 0 |

Changed covering tests: none (docs-only exemption). The existing docs-check suite was run; it does not verify historical product behavior. No product regression test or base-fail/head-pass evidence is claimed: the offending document is absent on base. UI screenshots and RTL/LTR execution are inapplicable to this docs-only change; historical UI verification remains unverified. Full suite/build were not run locally under the owner load rule.

## PR handoff

E2E: not needed — documentation-only correction of historical verification claims.

Attach this VERIFICATION REPORT to the harness-created PR. Preserve “Supersedes part of #385” and “Refs #474”; do not claim that the missing parent document was edited.

Security posture: no dependencies added/upgraded, no secrets added/read, no permissions or workflow tokens changed. No application or CI changes.

Skills used: using-superpowers, model-effort-routing, diagnosing-bugs, systematic-debugging, verification-before-completion, humanizer, opencode-delegate, principle-explain-the-number. Free delegation produced no accepted patch; the pinned GLM retry was unavailable. The implementer authored and checked this report locally.
