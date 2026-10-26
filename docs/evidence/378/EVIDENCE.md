# Issue #378 — acceptance criteria and verification report

Supersedes part of #368. Refs #295. Origin: [QA finding](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/368#issuecomment-6311697618), not Sentry; no originating Sentry issue was supplied.

## Acceptance criteria

1. **AC1:** Reject malformed n8n node types, including `foo`, `.webhook`, `n8n-nodes-base.` and embedded whitespace, with HTTP 400 / `INVALID_N8N_JSON` before creating a flow.
2. **AC2:** Uploading valid JSON without a workflow shows the existing localized “not an n8n workflow” alert, leaves the textarea empty, and renders in English LTR and Arabic RTL. Capture Playwright screenshots with animations disabled.
3. **AC3:** Preserve supported node mapping and unsupported namespaced community-node placeholders, including safe token generation and label truncation. HTTP URLs containing n8n expressions or credential references remain blocked placeholders.
4. **AC4:** Run focused importer tests, typecheck and lint; distinguish the push-gate environment failure from product regressions and record all unavailable UI verification.

## Findings and callers

- Remaining validation gap: `workflowSchema` checked only string length for node types. Reuse installed Zod and add the manager-specified `package.node` regex; no new dependency.
- Existing fixes in `06760a09525d13729693c250bd2d114a86e09a98`: schema shape validation; dialog file-read, parse, non-workflow and server-error alerts; HTTP expression/credential placeholders. These were checked in current code, not inferred from review wording.
- Production caller: `src/server/flows.ts:createFlow` calls `n8nToFlow` before DB insertion. The workspace flows POST route calls `createFlow`; the dashboard sends pasted/uploaded JSON through that route. No worker or orchestrator calls the importer. The shared server boundary covers both submission paths without caller changes.
- Existing upload coverage lives in `e2e-army/117-flows-list-dashboard.e2e.ts`, not the unit file named in the finding. Unit coverage now has four additional malformed-type cases. Two prior fixtures now use valid namespaced types while preserving exact token/truncation assertions.
- Inherited history contains #295 implementation and unrelated main-merge differences; this rework is measured against starting commit `06760a09` and does not rewrite those commits.

## Verification report (2026-10-25)

Regression base: `06760a09525d13729693c250bd2d114a86e09a98`; the production importer was unchanged when the new tests ran red. Tested implementation commit: `1a3c9ae7a6fbd583c7d4978b981060972f2606f9` (typecheck, lint and 48 related tests rerun after committing, all exit 0). Importer and unit-test blobs: `354497ff932f37f04681498692c2f1cc7f199612` and `96ec534e5880cedee107b88dbc3c936144b0d61d`. Subsequent evidence-only edits do not change the tested code.

| AC | Tests / command | Exit | Observed result |
| --- | --- | --- | --- |
| AC1 base | `nice -n 10 pnpm exec vitest run --project unit tests/unit/n8n-import.test.ts --maxWorkers=2` with new regression tests and unchanged base importer | 1 | 4 failed, 24 passed: “expected function to throw an error, but it didn't”. All four malformed types reproduced the gap. |
| AC1, AC3 head | Same command after schema fix | 0 | 28 passed; includes malformed types, supported mapping, scoped community-node token, label truncation, URL expressions and credentials. |
| AC1, AC3, AC4 head | `nice -n 10 pnpm exec vitest related --run --project unit src/server/n8n-import.ts 'src/app/w/[slug]/flows/dashboard.tsx' --maxWorkers=2` | 0 | 4 files, 48 tests passed. |
| AC4 | `pnpm typecheck && pnpm lint` | 0 | Both completed without diagnostics. Actual script is `typecheck`, not `type-check`. |
| AC4 original gate repro | `nice -n 10 pnpm exec vitest related src/server/n8n-import.ts 'src/app/w/[slug]/flows/dashboard.tsx' --maxWorkers=2` | 1 | No tests executed; integration global setup throws “Integration tests must run against flowline_test (got )”. Selecting unit project avoids initializing DB projects. |
| AC2 | `pnpm e2e:army e2e-army/117-flows-list-dashboard.e2e.ts --grep '@issue-378'` | 2 | Runner refuses to start: `.env.test` absent and no `E2E_ARMY_URL`. No scenarios executed. |
| AC2 screenshots | `nice -n 10 pnpm exec playwright test e2e/n8n-import.spec.ts --project=chromium --workers=1` | 1 | Test server exits with ENOENT for `.env.test` before tests. No screenshots captured; EN/LTR and AR/RTL remain unverified. |

The earlier exploratory Playwright invocation named a nonexistent `117-flows-list-dashboard.spec.ts`; its server startup also failed with exit 1. The correct new spec above was subsequently attempted and is the covering screenshot test.

Changed covering tests: `tests/unit/n8n-import.test.ts` (AC1/AC3), `e2e-army/117-flows-list-dashboard.e2e.ts` (AC2, two localized scenarios), `e2e/n8n-import.spec.ts` (AC2, two tests attaching `378-error-en.png` / `378-error-ar.png` when run successfully). Raw screenshots belong in test artifacts, not Git.

## Remaining verification and PR handoff

AC2 execution/screenshots and the blocking `e2e-army` status require the harness's isolated test stack. This report is not an E2E pass. The original unscoped push-gate command remains an infrastructure blocker: CI configuration changes are prohibited by this issue. Full suite/build were deliberately left to hosted CI per owner instructions. Runtime here was Node 26.10.0; package engine requests Node 24.x. `nice` reported an unavailable priority adjustment in the sandbox; tests still executed.

PR body must include “Supersedes part of #368”, `Refs #295`, and link this report as the VERIFICATION REPORT. Dependencies, secrets and workflow permissions are unchanged. No push, PR creation or merge performed.

Skills used: model-effort-routing, diagnosing-bugs, systematic-debugging, tdd, test-driven-development, pstack-tdd, typescript-best-practices, principle-type-system-discipline, principle-boundary-discipline, principle-test-behavior-not-implementation, verification-before-completion, humanizer, pr, using-superpowers, opencode-delegate, ai-peak-hours. Free-test delegation returned NO AVAILABLE IMPLEMENTER; no delegate changes were accepted. Implementation used the hub-assigned Codex session; no new paid run was launched.
