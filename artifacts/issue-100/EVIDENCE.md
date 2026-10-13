# Issue #100 acceptance evidence — 2026-10-13

Part of #96. Product SHA tested: `daa1a0d0b7f100bc11e847a012211644dfce664b`.
The only functional diff in this verification commit is the AC1 test correction in
`e2e-army/100-landing-demo.e2e.ts`: poster requests are permitted; video requests
for all four below-fold tiles must be absent. No product code changed.

## First-hand runs in this session

- `nice -n 10 pnpm exec playwright test e2e/landing-demo.spec.ts e2e/landing.spec.ts --project=chromium --workers=1`:
  **46 passed, 1 skipped**, exit 0. The skip is the real-media immutable/Range test;
  `public/media/demo/manifest.json` is absent. Browser assertions cover EN and AR.
- `E2E_ARMY_CLI=none E2E_ARMY_NOAGENT=1 nice -n 10 pnpm e2e:army e2e-army/100-landing-demo.e2e.ts`:
  **4 passed, 0 skipped**, exit 0; run `01a13558-8993-7242-96c5-2271ae0d5836`.
  No model credentials needed: all four issue tests use browser assertions.
- `nice -n 10 pnpm exec vitest run --project unit tests/unit/demo-media.test.ts tests/unit/demo-markup.test.ts tests/unit/gate-groups.test.ts --maxWorkers=2`:
  **35 passed**, exit 0. The sandbox refused `nice`; the tests executed normally.
- `pnpm lint`: exit 0.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0 after restoring declared
  dependencies with `pnpm install --frozen-lockfile --ignore-scripts` (no lockfile changes).
  `pnpm typecheck` was stopped because its machine-wide wrapper could not remove
  a lock under `agents/locks/`; this direct command runs the repo's underlying check.

## Root cause of missing browser evidence

The original stack failed before running tests because `.env.test` was absent.
After supplying disposable settings, the sandbox's TCP restriction required an
approved execution; port 5432 was reachable but its PostgreSQL server had no
`test` role. Instead of changing that server, this session initialized a disposable
UTF-8 cluster under `/private/tmp/flowline-100-pg`, port 55432, user `test`,
database `flowline_test`. The existing test-stack launcher migrated and seeded it.
App port remained 3100. No development DB or production credentials were used.

The first e2e-army run executed four tests: three passed and AC1 failed because
its `/templates.` predicate also matched the eagerly loaded poster. The corrected
predicate matches `.mp4` for **all four tiles**; the rerun passed all four tests.
Existing pause/retry regression tests were exercised, rather than inferred from code.

| REQ / AC | Evidence | Result |
|---|---|---|
| AC1 hero markup, preload, mute, lazy start, codec and one video | Chromium demo tests + army AC1; unit source/markup tests | Passed behavior assertions; actual production LCP unmeasured |
| AC2 reduced motion, Save-Data, 2g, explicit single play, live toggle | Chromium demo tests | Passed |
| AC3 keyboard Pause/Play, size, session, rejected play | Chromium demo tests + army AC3 + unit stub | Passed |
| AC4 dialog, captions, stepper, RTL keys, stills, media-error retry | Chromium EN/AR demo tests + army AC4 | Passed |
| AC5 bento layout, copy and lazy video | Chromium desktop/phone tests + army AC5 | Passed |
| AC6 EN/AR overflow 360/768/1024/1440, keys | Chromium demo/landing tests + unit i18n test | Passed |
| AC7 production Lighthouse before/after, measured CLS, actual added gzip, immutable/Range delivery | Header configuration unit test only | **Pending production measurements and real-media HTTP test** |
| AC8 missing manifest | Chromium fallback test + reader unit tests | Passed |
| AC9 relevant tests | 46 browser + 4 army + 35 unit passed; 1 real-media browser test skipped | Focused runs passed; complete matrix pending skipped test and hosted CI |
| AC10 docs | Consumption guide, this report, active phase ledger and NEXT_ACTION | Updated; completion remains pending |

Fixtures total **14,772 bytes** (sum of file sizes, not filesystem allocation), below
150 KB. Prior esbuild estimates on `0578080` are **not** evidence for the current
Next production bundle. No full suite/build ran locally, per owner instruction.
No Lighthouse score, CLS=0, production LCP, Range=206 or CI success is claimed.

## Remaining handoff

The harness must supply production before/after Lighthouse and added-client-gzip
measurements, then test immutable headers and Range against #99's content-hashed
media. Only after those and required hosted checks pass can #100 be complete.
The inherited implementation predates layer planning and exceeds the small-PR
limit. This session does not rewrite pushed history or claim to have split it;
the harness/owner must arrange reviewable layers before merge.
