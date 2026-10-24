# Prep for #395: Follow-up from #330: non-blocking review findings

> Offline floor prep (2026-10-24T06:46Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=330 -->
Follow-up from #330 (fix: pilot-metrics.ts: ![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat) Measur… (split from #170) (#320) [1/2] (#320)).

P2/P3 findings from the reviewers. They do not block #330 and do not start a fix round; they are tracked here, one issue per PR.

- QA Second Opinion: [p2] scripts/pilot-metrics.ts:172: The only production-code change in this PR is adding `export` to `getScheduledRuns` and `getDuplicateWebhookRuns`; the query bodies are unchanged context. However, the evidence claims the base still counted `webhook_event.status = 'rejected'` and that this PR introduced the run-grouping logic, which the diff contradicts. Rebase on current `main` and reconcile the evidence: if the branch is based on the parent branch (which the issue forbids) the fix will not reach main, and if main already contains it the PR should not present these queries
- QA Second Opinion: [p2] tests/integration/global-setup.ts:7: Defaulting `DATABASE_URL` to the shared localhost `flowline_test` (and `FLOWLINE_ENV` to `test`) silently bypasses the explicit guard on the next line: a caller who forgot to export `DATABASE_URL` now runs against a shared database instead of failing fast with the actionable error. This also breaks the documented `flowline_test_<worktree>` isolation for parallel agents that omit the env var, letting concurrent runs collide. This change is unrelated to #320; remove the defaults and keep the guard, or derive a worktree-specific default
- QA Second Opinion: [p2] tests/unit/pilot-metrics.test.ts:151: The new `getDuplicateWebhookRuns`/`getScheduledRuns` unit tests stub `execute` to return `{ count: 3 }`/`{ count: 7 }` and only assert that same object comes back — they never inspect the generated SQL or parameters. They would still pass if the metric reverted to querying rejected `webhook_event` rows or filtered the wrong `trigger_kind`, so they provide no regression protection for AC1/AC2 and give false confidence. Assert the emitted SQL/params or remove these in favour of the integration coverage.
- QA Second Opinion: [p3] docs/implementation/PHASE4_BETA_REPORT.md:361: The new section's final `Covered by unit tests ...` paragraph is immediately followed by the `## i18n: ...` heading with no blank line. Every other section in this report separates paragraphs from headings with a blank line; add one for consistency and to avoid markdown-lint failures.
- QA Second Opinion: [p3] docs/evidence/320/EVIDENCE.md:1: This file largely duplicates `artifacts/phase-4/issue-320/EVIDENCE.md` (both add the same acceptance-criteria narratives, command outputs, and local absolute workspace paths). Two near-identical evidence copies will drift out of sync and add maintenance noise; keep one canonical evidence file.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan - FlowLine_Web Issue #395

**Overall Goal:** Verify the resolution of P2/P3 findings related to `pilot-metrics.ts` and `PHASE4_BETA_REPORT.md`.

**1. `pilot-metrics.ts` - Unit Tests (tests/unit/pilot-metrics.test.ts)**
   * **Name:** SQL Parameter Assertion
   * **Setup:** Run unit tests with the new `getDuplicateWebhookRuns`/`getScheduledRuns` stub.
   * **Assertion:** Verify the emitted SQL and parameters are correctly constructed (e.g., parameter values match expected values).
   * **Edge Case:** Test with different `webhook_event.status` values to ensure filtering logic is robust.

**2. `pilot-metrics.ts` - Integration Tests (tests/integration/global-setup.ts)**
   * **Name:** Database URL Guard Test
   * **Setup:** Configure `DATABASE_URL` to *not* be exported, then run the application.
   * **Assertion:** Verify the expected error is thrown, indicating the guard is active.
   * **Edge Case:** Test with different database configurations to ensure guard works across environments.

**3. `PHASE4_BETA_REPORT.md` - Documentation Consistency**
   * **Name:** Paragraph/Heading Spacing
   * **Setup:** Manually inspect the document.
   * **Assertion:** Verify a blank line separates the final paragraph from the `## i18n: ...` heading.
   * **Edge Case:**  Check multiple sections to ensure consistent formatting.

**4. `EVIDENCE.md` - Evidence File Duplication**
   * **Name:** Canonical Evidence File Check
   * **Setup:** Compare `EVIDENCE.md` with `artifacts/phase-4/issue-320/EVIDENCE.md`.
   * **Assertion:** Verify the files are identical.
   * **Edge Case:**  Ensure the files remain synchronized during future updates.

**5.  Regression Test (Pilot Metrics - General)**
   * **Name:** Metric Query Regression
   * **Setup:** Run existing pilot metrics queries.
   * **Assertion:** Verify the queries return the expected results, even with the new logic.
   * **Edge Case:** Test with a large dataset to ensure performance isn't impacted.
