# Issue #292 — Follow-up from #271: review findings outside its scope

Branch `ai/292`.
Originating Sentry issue: None (audit and triage of out-of-scope review findings moved from PR #271 by the review-loop breaker).

## Summary
Issue #292 tracks review findings that the automated review-loop breaker moved out of PR #271's scope (which was strictly `AI_QUESTIONS.md`). A CTO delegate re-audit on 2026-10-18 established explicit acceptance criteria covering:
1. Rejection of invalid money and quantity inputs in `src/integrations/providers/mizano.ts` without rounding, covered by unit and contract tests.
2. Triage, resolution tracking, and linking of all review finding comments moved to this issue.
3. Documentation of legacy n8n-import HTTP parameters and e2e textarea assertions handled on the #164 feature branch (`ai/164`, commits `e7ca0a3b` and `41ccaf6f`).

## Acceptance Criteria

- **AC1:** `src/integrations/providers/mizano.ts` input schema rejects money and quantity inputs (`qty`, `unitPrice`, `taxRate`) that do not match `^\d+(\.\d{1,2})?$`, non-finite numbers, and numbers with more than 2 decimals, without rounding them.
- **AC2:** Unit tests in `tests/unit/mizano-inputs.test.ts` (13 tests) and contract tests in `tests/contract/mizano.test.ts` (57 tests) explicitly cover `"1.005"`, `0.001`, `"abc"`, `" 5 "`, `"1e3"`, `NaN`, and `Infinity` across `qty`, `unitPrice`, and `taxRate`.
- **AC3:** Triage and mapping of all out-of-scope review findings collected from PRs #291, #210, #263, #170, #184, and #267 to their respective fixing commits, PRs, or resolution rationales:
  1. *From #291 (`e2e/account-security.spec.ts:268` MFA test coverage & race condition)*: Narrowed on #291; comprehensive MFA journey, error states, and RTL tests were scheduled into subtasks #304, #319, and #373 (commit `98daf46a` on `ai/319` and `ce755835` on `ai/304-p3`).
  2. *From #210 (`tests/unit/docs-index.test.ts:55` brittle prose test)*: Resolved on #159 landing (`664ebce8`), replacing brittle prose checks with clean table column and draft status validation.
  3. *From #210 (`docs/evidence/107/EVIDENCE.md:115` developer absolute paths)*: Resolved; absolute paths prohibited, repo-relative paths enforced across evidence docs.
  4. *From #263 (`tests/unit/integrations-catalog.test.ts:44` Mizano exclusion rationale)*: Resolved; Mizano is intentionally an internal/unannounced beta connector (G5 deferred scope) excluded from public marketing catalog until live auth is ready.
  5. *From #263 (`docs/evidence/252/EVIDENCE.md:28` unobserved release gate)*: Resolved; unobserved browser gate passes are marked pending CI rather than claiming exit code 0.
  6. *From #170 (`docs/evidence/143/EVIDENCE.md:3` conflicting evidence files)*: Reconciled in PR #316 / #324.
  7. *From #170 (`docs/implementation/PHASE4_BETA_REPORT.md:355` unresolved metrics status)*: Resolved in commit `9a345f18` (#316 / #324) and commit `01f48999` (#143 / #320).
  8. *From #170 (`docs/evidence/143/EVIDENCE.md:31` developer absolute paths)*: Fixed in commit `01f48999` / #320 using repo-relative paths.
  9. *From #184 (`artifacts/phase-4/issue-181/VERIFI...`)*: Resolved in commit `ff8a0148` (`test(#181): assert the whole save/publish request in every copy-editor write-error test`).
  10. *From #267 (`e2e-army/164-import-n8n.e2e.ts` textarea value assertion)*: Resolved on `ai/164` branch in commit `e7ca0a3b` (`expect(screen.getByRole("textbox", { name: "n8n workflow JSON" })).toHaveValue(/Webhook/)`), and later folded into `e2e-army/166-mena-template.e2e.ts` in commit `947daf74` to respect the 8 top-level e2e-army file limit.
  11. *From #170 (`scripts/pilot-metrics.ts` staging uptime metric)*: Resolved in commit `01f48999` (`Report scheduled runs, uptime and all-failed 0.0% rate for pilot metrics (#143)`).
  12. *Audit AC3 (`src/server/n8n-import.ts` legacy v1 HTTP Request params)*: Resolved on `ai/164` branch in commit `41ccaf6f` (`n8n import: legacy v1 HTTP body/header/query params become placeholders (#164)`), converting unpreserved legacy parameters (`bodyParametersUi`, `headerParametersUi`, `queryParametersUi`, and `*ParametersJson`) into placeholders with 8 fixture unit tests.
  13. *From #308 (`docs/implementation/PHASE4_BETA_REPORT.md:140` H3 paragraph contradiction)*: Reconciled in `docs/implementation/PHASE4_BETA_REPORT.md:138` by removing the conflicting clause `; the other integration files were not run locally and CI runs them.`, ensuring consistency with recorded local runs of `federated-lock-order.test.ts`.
  14. *From #46 (`docs/engineering/lock-order.md:27, 18` V1 lock sequence & user FOR SHARE ordering fence)*: Resolved in PR #46 Round 14 (commit `a5e267c2` on main); `lock-order.md` corrected V1 sequence to `Member (6) → Workspace key-share (5)` and documented that user `FOR SHARE` is not a complete ordering fence.
  15. *From #328 (`src/i18n/messages/ar.json` & `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` Localization Reviewer)*: Non-blocking QA feedback affirming correct arrow symbol ('→'), Modern Standard Arabic phrasing, and RTL validation (`document.documentElement.dir === "rtl"`).
- **AC4:** Documentation and verification evidence recorded under `docs/evidence/292/EVIDENCE.md` and `docs/implementation/PHASE4_BETA_REPORT.md`. All local checks (`pnpm typecheck`, `pnpm lint`, focused vitest tests) pass clean with exit code 0.

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1, AC2 | Unit test covering invalid money/qty input rejection ("1.005", 0.001, "abc", " 5 ", "1e3", NaN, Infinity) without rounding | `pnpm vitest run tests/unit/mizano-inputs.test.ts` | 0 | 13 passed, 0 failed (253ms) |
| AC1, AC2 | Contract tests verifying Mizano create_draft_quote action input rejection without calling Mizano API | `pnpm vitest run tests/contract/mizano.test.ts` | 0 | 57 passed, 0 failed (323ms) |
| AC1, AC2 | Combined suite of changed test files | `pnpm vitest run tests/unit/mizano-inputs.test.ts tests/contract/mizano.test.ts` | 0 | 70 passed, 0 failed (321ms) |
| AC3, AC4 | Review findings triage & resolution mapping documented | `cat docs/evidence/292/EVIDENCE.md` | 0 | Complete mapping with SHAs and rationales |
| Static | TypeScript typecheck | `pnpm typecheck` | 0 | `tsc --noEmit` clean |
| Static | ESLint check | `pnpm lint` | 0 | `eslint` clean (0 errors, 0 warnings) |

## Changed Covering Tests
- `tests/unit/mizano-inputs.test.ts`: Added unit tests covering `decimalString` and `mizano.create_draft_quote` action input validation for `"1.005"`, `0.001`, `"abc"`, `" 5 "`, `"1e3"`, `NaN`, and `Infinity` across `qty`, `unitPrice`, and `taxRate`.
- `tests/contract/mizano.test.ts`: Added contract test verifying that `mizano.create_draft_quote` rejects invalid inputs without rounding and without dispatching HTTP requests to the Mizano backend.

## E2E Gate Note
`E2E: not needed — internal provider input schema validation and review findings audit report; no user-facing UI flow changed.`

## Skills Used
- `model-effort-routing`: Antigravity Agent · Gemini 3.8 Flash · High · Review findings triage and connector validation.
- `test-first-engineering` / `tdd`: unit and contract tests verifying input rejection and no-rounding behavior.
- `verification-before-completion`: verified every command with real exit codes and observed outputs.
