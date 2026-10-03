Serializes retained raw-file admission across workspaces and supported insertion routes, counts actual stored bytes inside the transaction, and rolls back insertion atomically when configured workspace or installation caps would be exceeded. Defaults are operational storage circuit breakers, not subscription entitlements, pricing, or a guarantee of total provider/storage cost.

Validation: Eleven database tests and 24 unit tests passed with no skips; full TypeScript, targeted ESLint, and source whitespace checks passed. Race, actual-byte, deletion, rollback, invalid-config, and tenant-404 cases are covered. See [M5 evidence](artifacts/phase-4/paid-pilot-round1/upload-admission/README.md).

Limits: This is partial M5 only. It does not cap row count/overhead, chunk storage, indexing queue depth, global parser CPU/heap, all database use, stale retention, or physical disk headroom. CI/deployed acceptance remains unverified.

Exact candidate: `360078e9d3357267711f006888b578f5a0c6c434`; base `codex/pilot-security-resource-round1` at `a9f7597c90b98128a1cebf46a949810e0586c31d`; 21 changed paths. Requires fast CI and the final `gate`; no current CI or CodeRabbit result is claimed.
