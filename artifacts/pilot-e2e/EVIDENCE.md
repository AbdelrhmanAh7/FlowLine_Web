# Pilot E2E corrections — 2026-10-15

Branch: `fix/pilot-e2e-failures`. Base SHA: `e646a041c9239f9fa1bb431bf320c3d6613cdf9a`.
Evidence applies to the product/test tree in the commit adding this report (final SHA available in git log).
Owner scope: this worktree only; local commit; no push, PR, hub edits, merge or deployment.

## Findings

1. **Versions: deliberate contract, no product fix.** `src/server/flows.ts` selects the actual `version`,
   `revision` and `reason` columns; no serializer rename is missing. `insertVersion` assigns a number
   only for publications. CTO decision #204 is documented in `docs/implementation/PHASE4_BETA_REPORT.md`
   and enforced by migrations 0025/0026 and existing tests. Two saves therefore correctly produce
   null version numbers, reasons `save` and increasing revisions. Extended the integration test to two
   saves and corrected the repository feature test to assert the documented contract and newest-first
   revision order. The read-only hub test's `[2,1]` assertion still needs its owner's correction.
2. **CSV: durable queue changed key order.** PapaParse already follows first-row insertion order.
   The trigger's sample JSON is a string in the graph and parses in the intended order; `run.input`
   was then stored in PostgreSQL JSONB, reordering `name,qty` to `qty,name`. Migration 0027 changes
   only run input to JSON. Sample and explicit input now retain order after enqueue/read/worker.
   Existing rows' original insertion order is unrecoverable. Other JSONB columns stay unchanged.
3. **Admin: metadata escaped the content guard.** Original `/admin/copy` returned HTTP 404 but
   its embedded metadata contained `Copy editor · Flowline`. Page content already used `notFound()`.
   Metadata now checks the platform-admin boundary before producing a privileged title; `/admin`
   also withholds its title on denial. Auth/TOTP/session-MFA requirements are unchanged. HTTP tests
   cover anonymous and signed-in non-admin requests plus unknown admin paths. Integration tests
   include API-key bearers and beta-allowlisted/workspace-owner users. Next.js's `__next_error__`
   envelope can accompany a legitimate `notFound()` 404; its presence alone is not a product error.

## Environment and commands

Node 24 selected with `export PATH=/opt/homebrew/opt/node@24/bin:$PATH` for checks.
Dependencies installed with `pnpm install --frozen-lockfile` (initial default Node 26 emitted an
engine warning; all checks used Node 24). Local ignored `.env.test` uses an isolated
`flowline_test_pilot` database, synthetic test settings and separate test encryption keys.
Web server on port 3100; no integration run overlapped the worker.

| Command | Result |
| --- | --- |
| `pnpm db:generate` | Pass; generated migration 0027 and schema snapshot/journal |
| `pnpm typecheck` | Pass, exit 0 |
| `pnpm lint` | Pass, exit 0 |
| `pnpm test tests/unit/engine.test.ts tests/unit/engine-v2.test.ts tests/unit/flow-version-label.test.ts` | 27 passed, 0 failed (3 files) |
| `pnpm test:integration tests/integration/flows.test.ts tests/integration/runs.test.ts tests/integration/sec-platform.test.ts` | 45 passed, 0 failed (3 files) after supplying the synthetic Google OAuth fixture expected by sec-platform |
| `pnpm test:integration tests/integration/flows.test.ts tests/integration/runs.test.ts tests/integration/sec-platform.test.ts tests/integration/p2-engine.test.ts tests/integration/platform-copy.test.ts` | 52 passed, 0 failed (5 files), including migration/global setup |
| `pnpm test:integration tests/integration/runs.test.ts -t 'CSV input column order'` with old JSONB column restored temporarily in the isolated test DB | Expected red reproduction: both new cases failed, keys were `qty,name`; 2 failed, 29 filtered/skipped. Column restored to JSON before final passing suite |
| `E2E_ARMY_URL=http://localhost:3100 pnpm e2e:army --tag feat:fl-flow-versions,feat:fl-csv-data-node,feat:fl-platform-admin` | 9 passed, 2 failed; UI tests failed with `MODEL_UNAVAILABLE` (optional `ai` peer absent), no model tokens used. Run `01a140fb-8f2e-7929-b049-8bb5693650a7` |
| `E2E_ARMY_URL=http://localhost:3100 pnpm e2e:army e2e-army/features/flows-api.e2e.ts e2e-army/features/runs.e2e.ts e2e-army/features/platform-api.e2e.ts --tag feat:fl-flow-versions,feat:fl-csv-data-node,feat:fl-platform-admin` | 5 passed, 0 failed (3 files). Run `01a140fc-0eaa-7e61-9e22-cd9faf052250`; no model calls |
| `git diff --check` | Pass |

E2E used `TMPDIR="$PWD/.e2e/tmp"` so helper actor caches stay in the worktree.
Before-fix HTTP reproduction temporarily restored the original copy-page file, requested the English
page, observed 404 plus its restricted metadata title, then restored the fix in a `finally` block.
After-fix HTTP checks returned 404 with no `authenticator|setup code|copy editor` match on `/admin`,
`/admin/copy`, and `/admin/unknown`; the feature E2E also verifies signed-in denials.
The initial integration attempt had 44 passed / 1 failed because the generated local test environment
omitted `GOOGLE_OAUTH_CLIENT_SECRET`; supplying a synthetic fixture fixed setup without changing tests.

## Handoff / security posture

No dependency changes, secret reads/additions to tracked files, permissions or workflow-token changes.
No GitHub tracking writes were made under the owner's explicit local-worktree scope. Harness must
link the tracking issue, run CI and obtain review before any merge. Full CI/browser tier and the two
model-backed UI cases remain unverified; no assertion, retry, timeout, auth or 2FA check was weakened.
