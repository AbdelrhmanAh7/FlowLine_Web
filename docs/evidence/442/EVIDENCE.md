# Evidence for PR #490: test review follow-ups #442 #439 #433 #437

Branch: `ai/442`  
Head: `113de531`  
Parent PRs / Issues: #442, #439, #433, #437  

## Summary

Resolves bundled non-blocking review follow-up items from previously merged parent PRs:
1. **#442 (`e2e-army/200-route-error-headers.e2e.ts`)**: Added assertion for `dir="rtl"` on Arabic 404 HTML responses for `/admin/copy` access when non-admin users request localized Arabic content.
2. **#439 (`e2e-army/147-mizano-create-customer-and-quote.e2e.ts`, `docs/evidence/370/EVIDENCE.md`)**: Replaced regex literal `?` in agent natural-language assertion with real expected Arabic text `"إنشاء عرض أسعار مسودّة"`, retaining diacritic-resilient matching in DOM assertions and updating EVIDENCE 370.
3. **#433 (`tests/unit/template-actions.test.ts`)**: Refactored missing action error message validation to directly exercise `createFlow` with mock design templates rather than verifying against a re-implemented local string formatter.
4. **#437 (`tests/unit/i18n.test.ts`)**: Removed redundant duplicate assertion for `"صفقة مكسوبة — عرض سعر Mizano"` in `i18n.test.ts`, preserving the canonical assertion in `tests/unit/i18n-content-text.test.ts`.

## Explicit Acceptance Criteria

- **AC1 (#442)**: `e2e-army/200-route-error-headers.e2e.ts` verifies that the Arabic 404 response body includes `dir="rtl"` in addition to `"لم نعثر على هذه الصفحة"`.
- **AC2 (#439)**: `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` asserts `"the Mizano integration lists an action named إنشاء عرض أسعار مسودّة"` without regex quantifier characters in the agent prompt.
- **AC3 (#433)**: `tests/unit/template-actions.test.ts` exercises `createFlow` throwing `HttpError` 409 `TEMPLATE_UNAVAILABLE` with exact expected messages for single and multiple missing actions.
- **AC4 (#437)**: `tests/unit/i18n.test.ts` tests template localization without duplicate exact-name equality assertions covered in `tests/unit/i18n-content-text.test.ts`.
- **AC5**: Clean typecheck, lint, and full unit/contract suites with zero regressions.

## Verification Report

| Check | Command | Exit Code | Result |
|---|---|---|---|
| Unit tests (near changes) | `pnpm vitest run tests/unit/template-actions.test.ts tests/unit/i18n.test.ts` | 0 | 2 files passed, 33/33 tests passed |
| Full unit test suite | `pnpm test` | 0 | 152 files passed, 1946 tests passed (1 skipped) |
| Full contract test suite | `pnpm test:contract` | 0 | 26 files passed, 548 tests passed |
| TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` clean |
| ESLint code hygiene | `pnpm lint` | 0 | `eslint` clean |
| Secret check | `pnpm check:evidence` | 0 | 0 secrets hit |

## Model and Effort Routing
- **Model**: agy gemini-3.8-flash-high
- **Effort**: High
- **Why**: Resolve PR #490 review follow-ups and gate compliance under the owner's bar.

## Skills Used
- `model-effort-routing`
- `systematic-debugging`
- `verification-before-completion`
