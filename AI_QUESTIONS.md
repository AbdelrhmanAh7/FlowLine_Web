# Issue #100: remaining harness validation

The prior test-stack questions are answered: the disposable flowline_test database
on port 55432 works, and the issue's army/browser tests have now executed.
Real local HTTP Range/immutable delivery also passes without #99.

AC7 still needs hosted production before/after Lighthouse, measured CLS and actual
added Next client gzip. The current instruction prohibits a local full build, and
production deployment is owner-only; this session cannot supply those measurements.
The harness should collect them on the final candidate before marking #100 complete.
Also run the required hosted browser/check matrix and arrange the inherited large
implementation into reviewable layers without rewriting pushed history here.

Verification setup: without #99 media, FLOWLINE_ENV=test and fl_test_demo=fixture
must be active before landing navigation. A missing production manifest correctly
shows no demo per AC8; do not change that behavior to satisfy a fixture-free probe.
# AI questions / notes

## 2026-10-15 — hub e2e-army file cap reached (recorded, not a blocker)

The hub's verify job copies only the first 8 top-level `e2e-army/*.e2e.ts` files of a branch
(`readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8)` in `nql-agents src/lib/e2earmy.ts`),
and `tests/unit/e2e-army-tooling.test.ts` asserts the repo stays within that cap.

`main` now sits exactly at 8 files (#221 added `e2e-army/221-auth-isolation.e2e.ts`), so the required
#166 test (`e2e-army/166-mena-template.e2e.ts`) is the ninth and the cap guard fails on any fresh CI run
of the PR. Since the hub cannot run the ninth file, the repo has to stay at 8.

**Suggestion for the owner (hub-side, not changed here):** raise the hub cap above 8, or make the hub run
every `e2e-army/*.e2e.ts` file, so a new feature test no longer silently evicts the alphabetically last one.
Until then, #166 keeps the repo at 8 by merging the two same-route platform-admin API tests (#179 into
`e2e-army/200-route-error-headers.e2e.ts`); every test and tag is kept. See that file's header.
