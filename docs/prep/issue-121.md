# Prep for #121: Docs: add lock-order worked examples for #41 (account/session/user) and #42 (member role vs SSO audit)

> Offline floor prep (2026-10-10T20:01Z): capacity 0 — claude: claude daily budget spent (14% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 20:43Z (opencode rate-limited 7× in a r; agy: held until 10-14 14:35Z (3 d 19 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

## Scope
In `docs/engineering/lock-order.md`, under `## Worked examples`, add two short examples, each linking to its issue: #41 account/session/user and #42 member role vs SSO audit.

## Instructions
1. Start after the skeleton part has merged. Rebase on main.
2. For each example give: the hazard (two interleaved transactions), the ordering rule consistent with the entity table, and the cited file path and function that implements it, or 'pending #N' if the fix is not yet in code.
3. Keep each example to about 10 lines. Keep the whole page under 150 lines.
4. Do not change the table or checklist except to fix an inconsistency you find, and note it in the PR.
5. Do not touch .github/.

## Acceptance criteria
- [ ] #41 and #42 are each referenced with their ordering rule and a link to the issue.
- [ ] Every ordering statement cites a file path verified against current main.
- [ ] Link check or lint passes and CI is green.
- [ ] No .github/ files are touched.

Part 2/3 of #89 (split by the CTO: Docs-only PR #93 has valid CodeRabbit accuracy defects, and CTO, rescue and model-raise rounds produced no commit. Split into three narrow, code-verified docs tasks, each small enough for one pass.)

<!-- nql-cto-split parent=89 -->

## Acceptance checklist

- [ ] #41 and #42 are each referenced with their ordering rule and a link to the issue.
- [ ] Every ordering statement cites a file path verified against current main.
- [ ] Link check or lint passes and CI is green.
- [ ] No .github/ files are touched.

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/02-connect-en.txt`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:qwen3:8b)

TEST PLAN

1. Test lock-order rule for account/session/user - e2e/landing-interaction.spec.ts  
   Setup: Two concurrent transactions modifying user session  
   Assertion: Ensure lock-order rule from docs/engineering/lock-order.md is enforced  

2. Test member role vs SSO audit lock-order - tests/integration/p2-actions.test.ts  
   Setup: Concurrent transactions modifying member roles and SSO audit logs  
   Assertion: Verify ordering rule from docs/engineering/lock-order.md is applied  

3. Check docs link to #41 - tests/unit/docs-check-script.test.ts  
   Setup: Validate markdown links in docs/engineering/lock-order.md  
   Assertion: Link to #41 is valid and points to correct issue  

4. Check docs link to #42 - tests/unit/docs-check-script.test.ts  
   Setup: Validate markdown links in docs/engineering/lock-order.md  
   Assertion: Link to #42 is valid and points to correct issue  

5. Validate file path for #41 fix - tests/unit/gate-groups.test.ts  
   Setup: Check if file path in docs matches current main  
   Assertion: File path for #41 fix is verified and correct  

6. Validate file path for #42 fix - tests/unit/gate-groups.test.ts  
   Setup: Check if file path in docs matches current main  
   Assertion: File path for #42 fix is verified and correct  

7. Check .github/ files untouched - tests/unit/run-output-redaction.test.ts  
   Setup: Scan for changes in .github/ directory  
   Assertion: No .github/ files were modified  

8. Verify CI green after PR - tests/unit/docs-check-script.test.ts  
   Setup: Run CI checks after PR submission  
   Assertion: CI passes and link check is successful  

9. Check for table inconsistencies - tests/unit/gate-selection.test.ts  
   Setup: Review table in docs/engineering/lock-order.md  
   Assertion: No inconsistencies found, PR notes any issues  

10. Validate PR meets acceptance criteria - tests/unit/docs-check-script.test.ts  
    Setup: Review PR against acceptance criteria  
    Assertion: All criteria are met and PR is ready for merge
