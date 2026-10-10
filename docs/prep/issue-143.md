# Prep for #143: Pilot metrics script: print the 8 week-1 success criteria from the staging DB

> Offline floor prep (2026-10-10T20:22Z): capacity 0 — claude: claude daily budget spent (14% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 20:43Z (opencode rate-limited 7× in a r; agy: held until 10-14 14:35Z (3 d 18 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Needed by goal G4 (week-1 review). Small, read-only.

## Scope
Add `scripts/pilot-metrics.ts` (read-only SQL against the configured DB) that prints, for a date range: sign-ups and median time to verified; users who finished onboarding + created a workspace on day 1; users who published >= 1 flow within 3 days; run success rate and p95 queue-to-start; webhook runs + approvals and duplicate-run count; cross-workspace access denials logged; share of users who switched to Arabic. Output: a Markdown table.

## Acceptance
- [ ] Runs against the test DB in CI-free local mode with seeded data and prints every metric (0 when no data).
- [ ] Read-only (no INSERT/UPDATE), no secrets in output.
- [ ] One unit test with seeded rows checks two metrics.

## How to test manually
1. Seed a few users and runs (`pnpm db:seed`), run `pnpm tsx scripts/pilot-metrics.ts --from 2026-10-16 --to 2026-10-23`.
2. Check the table rows match what you created.


## Acceptance checklist

- [ ] Runs against the test DB in CI-free local mode with seeded data and prints every metric (0 when no data).
- [ ] Read-only (no INSERT/UPDATE), no secrets in output.
- [ ] One unit test with seeded rows checks two metrics.

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:qwen3:8b)

**TEST PLAN**

1. **Test: Sign-ups and Median Time to Verified**  
   - Setup: Seed 5 users with verified dates.  
   - Assertion: Script outputs correct count and median.  
   - File: `tests/unit/gate-groups.test.ts`  
   - Edge: No data → 0.

2. **Test: Onboarding Completion + Workspace Creation**  
   - Setup: Seed 3 users with onboarding and workspace.  
   - Assertion: Metric reflects correct count.  
   - File: `tests/unit/gate-selection.test.ts`  
   - Edge: No data → 0.

3. **Test: Flow Publication within 3 Days**  
   - Setup: Seed 2 users with flows published on day 1 and 2.  
   - Assertion: Metric counts correctly.  
   - File: `tests/unit/run-output-redaction.test.ts`  
   - Edge: No data → 0.

4. **Test: Run Success Rate and P95 Queue-to-Start**  
   - Setup: Seed 10 runs with varying durations.  
   - Assertion: Metrics match expected values.  
   - File: `tests/unit/gate-groups.test.ts`  
   - Edge: All runs fail → 0.

5. **Test: Webhook Runs + Approvals and Duplicates**  
   - Setup: Seed 4 webhook runs (2 duplicates).  
   - Assertion: Counts and duplicates are accurate.  
   - File: `tests/unit/gate-selection.test.ts`  
   - Edge: No runs → 0.

6. **Test: Cross-Workspace Access Denials**  
   - Setup: Seed 3 access denial logs.  
   - Assertion: Count matches seeded data.  
   - File: `tests/unit/run-output-redaction.test.ts`  
   - Edge: No logs → 0.

7. **Test: Arabic Switchers**  
   - Setup: Seed 2 users who switched to Arabic.  
   - Assertion: Metric reflects correct count.  
   - File: `tests/unit/gate-groups.test.ts`  
   - Edge: No switches → 0.

8. **Test: Script Runs Locally with Seeded Data**  
   - Setup: Seed data and run script.  
   - Assertion: Outputs Markdown table with all metrics.  
   - File: `tests/unit/docs-check-script.test.ts`  
   - Edge: No data → 0.
