# Prep for #400: fix: failing check `chromium` (split from #330)

> Offline floor prep (2026-10-24T07:48Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#330 item=check:chromium -->
Split from PR #330 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/330), which reached the fix-round cap (6/6) without going green. Parent issue: #320.

### Scope (one item)
- failing check `chromium`

Red on da62dde of PR #330.

**5 more item(s) from the parent, for the same task:**
- qa finding: The PR correctly implements the fix for measuring actual duplicate ru…: The PR correctly implements the fix for measuring actual duplicate runs by counting duplicate `run` rows grouped by `(flow_id, trigger_ref)` where `trigger_kind = 'webhook'` instead of querying rejected event rows (scripts/pilot-metrics.ts:199-207).

https://github.com/AbdelrhmanAh7/FlowLine_Web/pu…
- qa finding: The PR correctly adds getScheduledRuns to query runs where triggerkin…: The PR correctly adds `getScheduledRuns` to query runs where `trigger_kind = 'schedule'` and includes this in the `PilotMetrics` and Markdown report (scripts/pilot-metrics.ts:189-197).

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/330#issuecomment-6282569678
- qa finding: The PR correctly adds staging uptime criterion with NOTTRACKEDUPTIME …: The PR correctly adds staging uptime criterion with `NOT_TRACKED_UPTIME` documenting external `/api/health` probe monitoring (scripts/pilot-metrics.ts:263-265).

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/330#issuecomment-6282569678
- qa finding: All 18 unit tests pass (tests/unit/pilot-metrics.test.ts).: All 18 unit tests pass (tests/unit/pilot-metrics.test.ts).

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/330#issuecomment-6282569678
- qa finding: (non-blocking) [minor] Typecheck passes with exit code 0.: (non-blocking) [minor] Typecheck passes with exit code 0.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/330#issuecomment-6282569678

### Done when
- this check passes / this finding is resolved on a fresh branch off `main`, with a test that covers it;
- the PR body says "Supersedes part of #330". Keep the change small; do not reuse the parent branch `ai/320`.

## Acceptance checklist

- (none in the issue — derive from the brief)

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
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`

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

## Test Plan: Fix - Failing Chromium Check (#400)

**Goal:** Verify the fix for the failing `chromium` check in PR #330.

**1. Chromium Run Verification:**
   * **Name:** Chromium Run Success
   * **Setup:** Trigger a Chromium run through the UI or CI.
   * **Assertion:**  The Chromium check passes in the dashboard.
   * **File:** `scripts/pilot-metrics.ts` (verify the fix implemented here)
   * **Edge Case:** Simulate a high-load Chromium run to ensure stability.

**2. Duplicate Run Counting - Trigger Kind:**
   * **Name:** Duplicate Run - Webhook Trigger
   * **Setup:** Create runs with `trigger_kind = 'webhook'`.
   * **Assertion:** The `run` rows are correctly grouped by `(flow_id, trigger_ref)` as intended.
   * **File:** `scripts/pilot-metrics.ts` (lines 199-207)
   * **Edge Case:**  Large number of runs with the same `flow_id` and `trigger_ref`.

**3. Scheduled Run Querying:**
   * **Name:** Scheduled Run Inclusion
   * **Setup:** Create runs with `trigger_kind = 'schedule'`.
   * **Assertion:**  `getScheduledRuns` correctly queries and includes these runs in the PilotMetrics report.
   * **File:** `scripts/pilot-metrics.ts` (lines 189-197)
   * **Edge Case:**  Runs scheduled with varying intervals.

**4. Staging Uptime Criterion:**
   * **Name:** Staging Uptime Monitoring
   * **Setup:**  Ensure the `/api/health` probe is configured and running.
   * **Assertion:** The `NOT_TRACKED_UPTIME` criterion is correctly added to the staging metrics.
   * **File:** `scripts/pilot-metrics.ts` (lines 263-265)
   * **Edge Case:** Simulate a brief outage of the `/api/health` probe.

**5. Unit Test Coverage:**
   * **Name:** Unit Test Pass Rate
   * **Setup:**  Run the existing unit tests.
   * **Assertion:** All 18 unit tests pass.
   * **File:** `tests/unit/pilot-metrics.test.ts`
   * **Edge Case:** Introduce a small, isolated change to the `pilot-metrics.ts` file and re-run the tests.
