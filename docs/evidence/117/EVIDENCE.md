# Evidence Report — Issue #117: Flows list and dashboard run summary

Issue: #117
PR: #139
Branch: `ai/117`
Base: `origin/main`

## Acceptance criteria & requirements

| REQ | Acceptance Criterion | Implementation (file:line) | Covering Test | Exit Code |
|-----|----------------------|----------------------------|---------------|-----------|
| REQ-117-AC1 | Cross-revision run counting: `runCount` aggregates all runs across all revisions (e.g. 2 runs across v1/v2/v3). | `src/server/flows.ts:52-61`: `LEFT JOIN LATERAL` counting `run.flowId = flow.id`. | `tests/integration/flows.test.ts:207-231`; `e2e-army/features/flows-api.e2e.ts:127` | 0 |
| REQ-117-AC2 | Latest finished run status: `lastRunStatus` reflects the status of the run with the greatest `finishedAt` (`succeeded`). | `src/server/flows.ts:62-72`: `ORDER BY finishedAt desc nulls last, startedAt desc nulls last, id desc LIMIT 1`. | `tests/integration/flows.test.ts:240-258`; `e2e-army/features/flows-api.e2e.ts:127` | 0 |
| REQ-117-AC3 | Timestamp accuracy: `lastRunAt` equals the latest run's `finishedAt` timestamp. | `src/server/flows.ts:70`: selected from `lastRun.finishedAt ?? lastRun.startedAt ?? lastRun.createdAt`. | `tests/integration/flows.test.ts:224,230,257,284`; `e2e-army/features/flows-api.e2e.ts:127` | 0 |
| REQ-117-AC4 | Zero-run defaults: flow with no runs emits `runCount: 0`, `lastRunStatus: null`, `lastRunAt: null` without row omission. | `src/app/api/v1/flows/route.ts:21-23`: explicit default keys emitted on every flow record. | `tests/integration/flows.test.ts:233-238`; `e2e-army/features/flows-api.e2e.ts:131-132` | 0 |
| REQ-117-AC5 | Paused flow preservation: pausing keeps `runCount`, `lastRunStatus`, and `lastRunAt` while reporting pause reason. | `src/server/flows.ts`: pause status does not clear or alter flow run statistics. | `tests/integration/flows.test.ts:295-308`; `e2e-army/features/flows-api.e2e.ts:134-136` | 0 |
| REQ-117-AC6 | E2E gate compliance: `e2e-army/117-flows-list-dashboard.e2e.ts` unmodified from `origin/main`. | `e2e-army/117-flows-list-dashboard.e2e.ts`: byte-identical to `origin/main`. | `git diff --quiet origin/main -- e2e-army/117-flows-list-dashboard.e2e.ts` | 0 |
| REQ-117-AC7 | UI visibility: flow statistics (`runCount`, `lastRunStatus`, `lastRunAt`) are visible in DOM with testids in LTR and RTL. | `src/app/w/[slug]/flows/dashboard.tsx:211,234-256`: explicit `data-testid` and visible text for `runCount`, `lastRunStatus`, and `lastRunAt`. | `e2e/flows-list.spec.ts` | 0 |
| REQ-117-AC8 | Dashboard route: `/w/[slug]/dashboard` renders with 200 OK without 404; navigation button works. | `src/app/w/[slug]/dashboard/page.tsx:1-11`; `src/app/w/[slug]/flows/dashboard.tsx:121-123`. | `e2e/flows-list.spec.ts` | 0 |

## Verification commands

- Typecheck:
  `pnpm typecheck` — exit code 0
- Linter:
  `pnpm lint` — exit code 0
- Unit tests:
  `pnpm exec vitest run --project unit tests/unit/no-conflict-markers.test.ts --maxWorkers=1` — exit code 0 (5 passed)
- Integration tests:
  `node scripts/with-env.mjs .env.test vitest run --project integration tests/integration/flows.test.ts --maxWorkers=1` — exit code 0 (16 passed)
- Regression demonstration:
  `node scripts/with-env.mjs .env.test vitest run --project integration tests/integration/flows.test.ts -t "in flight"` with `4fe2643` ordering fails (exit code 1); passes on head (exit code 0).
- E2E army feature test:
  `node scripts/e2e-army.mjs --shard-id flows-api --grep fl-flows-list` — exit code 0 (2 passed)
- Playwright E2E UI test:
  `pnpm exec playwright test e2e/flows-list.spec.ts` — exit code 0
