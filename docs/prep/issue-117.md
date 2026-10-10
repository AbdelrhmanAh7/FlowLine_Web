# Prep for #117: [e2e] Flows list and dashboard failing on main

> Offline floor prep (2026-10-10T16:04Z): capacity 0 — claude: claude daily budget spent (13% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (3 d 23 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stable-gate 2026-10-09 -->
**Stable release gate 2026-10-09:** `fl-flows-list` failed on `main` @ `d211653` — **pilot scope** (blocks today's stable tag).

> expected {"id":"c765a71e-dc36-422e-9d36-17e41126cf4e","name":"Listed good fl-list-good-758","updatedAt":"2026-10-09T03:44:05.529Z","revision":2,"nodeCount":3,"publishedVersion":3,"pausedReason":null,"trigger":"trigger.manual","hasTrigger":true,"lastRunAt":"2026-10-09 06:44:04.423993+03","lastRunStatus":"succeeded","runCount":2,"successRate":1} to match object {"runCount":2,"lastRunStatus":"succeed

Evidence of the run: hub logs `~/agents/logs/stable/FlowLine_Web/2026-10-09`.

Reproduce: `ops/verify/e2e-army/run-local.sh FlowLine_Web d211653 -- --tag feat:fl-flows-list` (hub repo). Fix the product, never weaken the test. The previous stable version stays deployed.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/workflows/ai-implementers.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:qwen3:8b)

**TEST PLAN**

1. **Test Case:** Verify flows list displays correct run count  
   **File:** `e2e/flows-list.spec.ts`  
   **Setup:** Navigate to flows list page  
   **Assertion:** Check run count matches expected value  
   **Edge Case:** Ensure data is fetched correctly from API

2. **Test Case:** Validate last run status is displayed as 'succeeded'  
   **File:** `e2e/flows-list.spec.ts`  
   **Setup:** Navigate to flows list page  
   **Assertion:** Confirm last run status is shown as 'succeeded'  
   **Edge Case:** Check status is updated in real-time

3. **Test Case:** Check flow details match expected values  
   **File:** `e2e/flow-details.spec.ts`  
   **Setup:** Click on a flow from the list  
   **Assertion:** Verify all flow details match the expected object  
   **Edge Case:** Ensure data is consistent across multiple views

4. **Test Case:** Ensure dashboard displays correct flow metrics  
   **File:** `e2e/dashboard.spec.ts`  
   **Setup:** Navigate to dashboard page  
   **Assertion:** Confirm metrics like run count and success rate are accurate  
   **Edge Case:** Validate dashboard updates on data change

5. **Test Case:** Verify flow status updates after manual trigger  
   **File:** `e2e/flow-trigger.spec.ts`  
   **Setup:** Trigger a flow manually  
   **Assertion:** Check status updates to 'succeeded' in real-time  
   **Edge Case:** Ensure status is reflected across all views

6. **Test Case:** Confirm flow details are correctly fetched from API  
   **File:** `e2e/api-flow-details.spec.ts`  
   **Setup:** Make API call to fetch flow details  
   **Assertion:** Validate response matches expected structure  
   **Edge Case:** Test with different flow IDs and statuses

7. **Test Case:** Ensure dashboard filters work for paused flows  
   **File:** `e2e/dashboard-filters.spec.ts`  
   **Setup:** Apply filter for paused flows  
   **Assertion:** Only paused flows are displayed  
   **Edge Case:** Test with multiple filter options

8. **Test Case:** Validate flow list sorting by last run date  
   **File:** `e2e/flows-list.spec.ts`  
   **Setup:** Sort flows by last run date  
   **Assertion:** Flows are ordered correctly by date  
   **Edge Case:** Test with both ascending and descending order
