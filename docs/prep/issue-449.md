# Prep for #449: [blocker] check "gate" is red on 3 PRs (one shared cause?)

> Offline floor prep (2026-10-24T19:34Z): capacity 0 — claude: claude is text-only for coding (coding success 27%; codex: Codex 5-h window 70% ≥ 70% (30% buffer) — next win; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-blocker bb-002c831c14 -->
### Blocker: check "gate" is red on 3 PRs (one shared cause?)

Small task from the blocker breaker (src/lib/blockerbreaker.ts): one PR or one cause in one repo.

**Evidence**
- PRs #360 #330 #308

**Acceptance**
- [ ] Check "gate" is green on fewer than the group threshold of open PRs (the shared cause is fixed on main or in the shared code)
- [ ] No CI workflow, test, review or merge gate is removed, skipped or weakened (no `.github/workflows` edit, no deleted or skipped test)
- [ ] The blocker breaker's next run no longer detects `cigroup:AbdelrhmanAh7/FlowLine_Web:gate`

**Verify**
```
gh pr checks 360 -R AbdelrhmanAh7/FlowLine_Web
```

## Acceptance checklist

- [ ] Check "gate" is green on fewer than the group threshold of open PRs (the shared cause is fixed on main or in the shared code)
- [ ] No CI workflow, test, review or merge gate is removed, skipped or weakened (no `.github/workflows` edit, no deleted or skipped test)
- [ ] The blocker breaker's next run no longer detects `cigroup:AbdelrhmanAh7/FlowLine_Web:gate`

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `CLAUDE.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan: Issue #449 - Gate Red Color

**Goal:** Verify the fix for the repeated "gate" red color issue across PRs.

**1. Gate Group Verification (tests/unit/gate-groups.test.ts)**
   * **Name:** Gate Group Status - Single PR
   * **Setup:** Create a new PR mirroring PR #360.
   * **Assertion:** Verify the gate group status is green.
   * **Edge Case:**  PR with no changes to the affected code.

**2. CI/CD Gate Integrity (tests/unit/gate-selection.test.ts)**
   * **Name:** CI Workflow - Gate Status
   * **Setup:** Trigger a PR that should trigger the gate.
   * **Assertion:** Verify the CI workflow remains active and the gate is green.
   * **Edge Case:**  PR with a minor change that *shouldn't* trigger the gate.

**3. Gate Report Review (tests/unit/run-output-redaction.test.ts)**
   * **Name:** Gate Report Output
   * **Setup:**  Run the gate report.
   * **Assertion:** Verify the report output doesn't show the red "gate" status.
   * **Edge Case:**  Run the report multiple times to confirm consistency.

**4. .github/workflows/gate.yml Validation (Manual)**
   * **Name:** Workflow Configuration
   * **Setup:** Inspect the `gate.yml` workflow file.
   * **Assertion:** Verify no changes were made to the workflow that could reintroduce the issue.

**5. PR Template Review (tests/unit/docs-check-script.test.ts)**
   * **Name:** PR Template Consistency
   * **Setup:** Review the PR template for any gate-related instructions.
   * **Assertion:** Verify the template instructions are accurate and haven’t been altered.

**6.  Agent Configuration (AGENTS.md)**
   * **Name:** Agent Configuration
   * **Setup:**  Inspect the agent configuration file.
   * **Assertion:** Verify no changes were made to the agent configuration that could reintroduce the issue.
