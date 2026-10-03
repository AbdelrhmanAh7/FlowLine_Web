# Security remediation validation — 2026-10-03

Worktree: `FL-wt-sec-redact`, branch `codex/sec-redaction-h4`. Synthetic values only; no environment-file contents or real credentials were read. No application/browser/database server, local gate, deployment, push or PR was started. The prescribed full unit suite uses the repository's existing test fixtures; the new tests use mocks and in-memory state.

Each regression was added and executed before its production fix, then rerun with the same security assertions after the fix. The SHA below is the actual pre-fix implementation tested with the new regression file(s) present as local changes.

| Finding | Pre-fix SHA | Focused command suffix after `pnpm -s test` | Before fix | After fix |
| --- | --- | --- | --- | --- |
| M2 | `ee70336` | `tests/unit/redact.test.ts` | 5 failures: depth overflow leaks and cyclic result | 9 passed |
| M3 | `76f71f6` | `tests/unit/redact.test.ts tests/unit/redact-api-logging.test.ts` | 3 failures: multiline credentials survive | 12 passed |
| M1 | `cda452d` | `tests/unit/egress-redirect-security.test.ts` | 7 failures: PUT/PATCH body and custom-header forwarding | 11 passed |
| M8 | `0c4b254` | `tests/unit/billing-webhook-retry.test.ts` | 2 failures: signed events return 200 instead of 503 | 2 passed |
| H4 | `71ca0ce` | `tests/unit/run-output-redaction.test.ts` | 4 failures: raw aggregate output in fresh/resumed/reused/legacy runs | 4 passed |
| M6 | `59b5e6f` | `tests/unit/beta-mode-security.test.ts` | 2 failures: missing beta/production mode becomes open | 5 passed |

Final combined validation: `pnpm -s lint && pnpm -s typecheck && pnpm -s test`, executed with equivalent PowerShell fail-fast sequencing. All three exited 0; unit result: **74 files passed, 791 tests passed, no skipped tests or unhandled errors**. The tested code was `59b5e6f` plus the final M6 beta implementation/test changes; only documentation/evidence was added after that successful run. The six remediation commits and their final SHA are recorded in git and the delivery summary.

One intermediate H4 run exposed a test-double defect: it returned a Drizzle SQL increment AST as a persisted numeric `attempts` field, causing recursive projection to exhaust memory. The double was corrected to model PostgreSQL's numeric result; production assertions were unchanged and all subsequent runs passed. An intermediate typecheck found one missing non-null assertion for the graph's known node definitions; it was corrected before the final validation.

Coverage limits: real DB integration assertions for M8 were strengthened but not executed; no provider, browser, CI or deployment proof is claimed. H4 uses existing encrypted step data (including its secret snapshot), not a new raw aggregate column. Legacy encrypted data lacking a snapshot uses its public copy, so old resumes may carry masked values. Already stored plaintext aggregates require a separate controlled remediation process. Other review findings remain open.
