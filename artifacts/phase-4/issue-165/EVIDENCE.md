# Issue #165 — outbound guardrails (first version): verification report

Tested code: commit `6187af58` on `ai/165` (merged with `origin/main` `39364b5d`). Local runs, 2026-10-16. CI results are not claimed here.

Scope delivered: per-connection/per-action send cap + node-config field + audit visibility. **Not delivered:** scoped node credentials, volume-threshold approval, per-destination caps (see `docs/security/OUTBOUND_GUARDRAILS.md`). Bug fixed on this branch: commit `8620b5d0` had deleted 182 unrelated tracked files (hooks, Dockerfile, docs, config); restored in `d0dc8024`.

## Acceptance criteria

| # | Criterion | Verified by | Result |
|---|---|---|---|
| AC1 | A side-effect action over `maxSendsPerMinute` per connection+action fails with retryable `SEND_RATE_LIMITED` and logs exactly one `outbound_capped` event | `tests/integration/p2-actions.test.ts` "…over its per-connection send cap…" | pass; **fails with `worker/handlers.ts` reverted to `origin/main`** (14/15), passes restored |
| AC2 | The cap is counted after connection validation: a cross-workspace connection fails with `CONNECTION_WORKSPACE` and logs no `outbound_capped` | same file, "rate limiting validates connection workspace…" | pass |
| AC3 | `maxSendsPerMinute` must be an integer 1..1000; otherwise the graph is invalid | `tests/unit/engine.test.ts` (0, 1.5, 1001 → `INVALID_SEND_LIMIT`; 60/undefined ok); integration "…refused at enqueue…" (422 `INVALID_FLOW`) | pass (13/13 unit; 15/15 integration) |
| AC4 | The node editor exposes the field; the run inspector shows `outbound_capped` with en/ar labels | `src/components/builder/node-config.tsx`, `src/i18n/messages/{en,ar}.json` (`runEvent.outbound_capped`, `config.action.maxSendsPerMinute*`); rendered by `inspector.tsx` via `runEvent.<type>` | code-reviewed; typecheck + i18n key parity; **no screenshot taken** (no browser run), so RTL/LTR rendering is not visually verified |
| AC5 | The branch changes no unrelated file | `git diff --name-status origin/main HEAD` lists 13 files (+ this one), no `D` | pass |

## Commands and exit codes

- `pnpm typecheck` (sandbox off) — exit 0
- `pnpm exec eslint worker/handlers.ts src/engine/{validate,types}.ts src/components/builder/node-config.tsx src/server/events.ts tests/unit/engine.test.ts tests/integration/p2-actions.test.ts e2e-army/165-outbound-send-cap.e2e.ts` — exit 0
- `vitest run --project unit tests/unit/engine.test.ts` — 13 passed
- `node scripts/with-env.mjs <synthetic .env> vitest run --project integration tests/integration/p2-actions.test.ts` on throwaway DB `flowline_test_165` — 15 passed, run twice. A first run on that reused DB showed 3 failures (two unrelated expiry cases and the clamp test); the expiry cases passed on every later run and are not touched by this change, the clamp test was wrong and replaced.
- e2e-army `e2e-army/165-outbound-send-cap.e2e.ts` (tag `feat:fl-integration-actions`): request-level guard only (anonymous run start refused). It does not exercise the cap; it was not run locally (runs in the hub verify job).

## Honesty notes

- Sentry: no originating Sentry issue exists for this feature request.
- Full suite, browser/Playwright and Arabic RTL screenshots were not run locally (CI runs the suite); AC4's UI part is therefore unverified visually.
