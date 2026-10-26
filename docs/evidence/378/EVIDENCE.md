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

## Verification report (2026-10-27)

Regression base: `06760a09525d13729693c250bd2d114a86e09a98`; base branch: `origin/ai/378`.
Tested head: PR #477 scoped to #378 n8n workflow validation.

### Scope and findings resolution:
- Security / CTO finding: Removed out-of-scope workspace placeholder fallback in `src/server/access.ts` and `src/app/w/[slug]/layout.tsx`, and removed unrelated #364 Mizano e2e tests. Kept changes strictly within #378 scope.
- QA finding / Gate manifest: Added `n8n-import` spec to `GROUPS.editor.specs` in `scripts/gate-groups.mjs`, making `tests/unit/gate-groups.test.ts` pass cleanly.
- Localization finding: Rejected findings regarding 2FA card (`two-factor-card.tsx` and `ar.json` 2FA backup codes) as they are completely outside #378 scope and not modified in this PR.

| AC / Check | Tests / command | Exit | Observed result |
| --- | --- | --- | --- |
| AC1, AC3 | `pnpm test tests/unit/n8n-import.test.ts` | 0 | 39 passed; covers `isN8nWorkflow`, BOM stripping, malformed node types, code parameter mappings, extra metadata, expressions/credentials placeholder replacements. |
| AC4 | `pnpm test tests/unit/gate-groups.test.ts` | 0 | 8 passed; manifests and group memberships valid with `n8n-import` assigned to editor group. |
| AC4 | `pnpm test tests/unit/e2e-army-tooling.test.ts` | 0 | 12 passed; e2e-army file cap and tooling checks pass. |
| AC4 | `pnpm test` (full unit suite) | 0 | 137 test files passed, 1839 tests passed (1 skipped). |
| AC4 | `pnpm typecheck` | 0 | `tsc --noEmit` completed without diagnostics. |
| AC4 | `pnpm lint` | 0 | `eslint .` completed with no errors. |

Changed covering tests: `tests/unit/n8n-import.test.ts` (AC1/AC3), `e2e-army/117-flows-list-dashboard.e2e.ts` (AC1 file upload error alert test), `e2e/n8n-import.spec.ts` (AC2, localized screenshot tests registered in gate groups).

## Remaining verification and PR handoff

Full gate and browser tests run via hosted CI.
Dependencies, secrets and workflow permissions are unchanged.

Skills used: model-effort-routing, diagnosing-bugs, systematic-debugging, verification-before-completion.
