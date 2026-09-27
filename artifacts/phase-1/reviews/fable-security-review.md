# Critical security and correctness review: Claude Fable 5.1 (read-only)

- **Reviewed revision:** `39b2e7e` plus the in-flight per-user fault-injection change.
- **Reviewer:** a Fable 5.1 subagent, used for "critical situations" at the user's request. It had read-only access (no edits, runs, or network).
- **Dispositions:** Claude (lead). Each fix below has a regression test and landed in `c35485e`.

| ID | Sev | Finding (summary) | Disposition | Fix and regression test |
|---|---|---|---|---|
| F1 | high | Stale recovery re-queued a run, but the original worker's step and final writes were unguarded, so double execution could interleave results. | Valid, fixed | Every run and step write in `worker/runner.ts` is guarded by `locked_by = workerId AND status = 'running'`. A 0-row write raises `LeaseLostError`, and the worker stops without writing. Recovery clears `locked_by` to revoke the lease. Tests: int "a worker that lost its lease writes nothing" and "stale recovery revokes the lease and the run completes once". |
| F2 | high | JSONata hooks fire only between AST nodes, so one built-in (`$pad(…, 4e8)`, a ReDoS regex) runs synchronously and can OOM or stall the worker for every tenant. | Valid, fixed | Expressions now run in a **separate, heap-capped child process** (`src/engine/sandbox.ts`, `--max-old-space-size=128`), which is killed and respawned on timeout (1s) or crash. `$pad` is capped at 100k as defence in depth. A first attempt with `worker_threads` + `resourceLimits` still crashed the host with a fatal V8 OOM, so it was replaced. Tests: unit "stops a catastrophic-backtracking regex…" and "refuses a huge $pad and survives a memory blow-up…" (the host stays healthy afterwards). |
| F3 | med | Run `input` size was unbounded, so a huge body could exhaust the DB, worker, and browsers. | Valid, fixed | Request bodies over 256 KB, and inputs derived from the sample payload over 256 KB, are rejected with 413 `INPUT_TOO_LARGE` (route + `enqueueRun`). |
| F4 | med | The heartbeat update had no `.catch`, so a DB blip would crash the worker. | Valid, fixed | It now has a `.catch` and logs the error. |
| F5 | low | A negative or NaN `limit` returned a 500. | Valid, fixed | Clamped to 1–100. Test: int "listRuns clamps nonsense limits". |
| F6 | low | `__proto__` output key and silent duplicate output keys. | Valid, fixed | A null-prototype output map, `RESERVED_OUTPUT_KEY` and `DUPLICATE_OUTPUT_KEY` validation. Tests: unit "output keys". |
| F7 | low | Raw driver errors were shown to viewers; `lockedBy` (hostname-pid) was exposed. | Valid, fixed | A generic `WORKER_ERROR` message (details go to the worker log), and `lockedBy`/`attempts`/`heartbeatAt` are omitted from the run detail. Test: int "run detail hides worker internals". |
| F8 | low | The slug race returned a 500 on a concurrent create. | Valid, fixed | Retry on `23505` (up to 5 attempts). |
| F9 | low | No app-level rate limit on starting runs. | Valid, fixed for a single instance | 30 runs per minute per user on run and re-run (`src/server/rate-limit.ts`). A shared store and proxy IP config are tracked for the Phase 3 release (P3-12). Test: unit "run rate limit". |

**Areas the reviewer checked and found sound:** tenant isolation on every route (404 to non-members, workspace
derived from the DB row), role enforcement, save/version concurrency (`FOR UPDATE`, revision check, overwrite
version), `SKIP LOCKED` claiming, the test-only fault-injection gate, better-auth defaults (production secret check,
local-email-verified account linking, SameSite cookies), parameterized SQL, input limits, offline draft isolation
and conflict handling, and engine skip/rerun semantics.
