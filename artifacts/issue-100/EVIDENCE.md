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

Post-commit confirmation on `ff1933d`: the same army command passed **4/4** again
(run `01a1355b-b435-7cbd-9405-2f1f5d03987b`); lint and direct typecheck exited 0.
Subsequent changes only correct documentation claims.

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
| AC7 production Lighthouse before/after, measured CLS, actual added gzip, immutable/Range delivery | Header configuration unit test only | **Pending production measurements and real-media HTTP test** (AC7 is marked unverified) |
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

## Rework validation — 2026-10-14

Product under test: `2c88acbe254f0bfa13bc86f569c951f57e86b900` (landing application code unchanged in this rework).
Test blobs: `e2e/landing-demo.spec.ts` = `cb9a143782b3788bcdb8ed40fb0f61e94ec05037`;
`e2e-army/100-landing-demo.e2e.ts` = `ffa3972242ac95af7f530dc9ba4413964a64c9c3`.
Test launcher blob: `b07ced1f6ef90921da7a27ebb511afcef66f76aa`.
The disposable PostgreSQL cluster on 55432 and test app on 3100 were used again; the stack was restarted after the launcher change, and the 22-case demo run and six-case army run passed again.

- AC1–6, AC8: `E2E_ARMY_URL=http://localhost:3100 E2E_ARMY_NOAGENT=1 nice -n 10 pnpm e2e:army e2e-army/100-landing-demo.e2e.ts` — **6 passed, 0 skipped**, final run `01a139b1-4729-7e2b-9d39-467b23214cbd`.
- AC1–6, AC8–9: `nice -n 10 pnpm exec playwright test e2e/landing-demo.spec.ts --project=chromium --workers=1` — **22 passed, 0 skipped**.
- Existing landing regression: first combined demo/landing run executed 47 tests, with **all 25 existing landing tests passing** and one demo preload assertion failing. The corrected demo spec was rerun in full and passed all 22.
- AC7 static delivery: the browser spec now creates a temporary MP4 fixture in `public/media/demo/` and checks real Next HTTP delivery (no `page.route`): **206**, `public, max-age=31536000, immutable`, `Content-Range: bytes 0-1023/<fixture size>`, 1024-byte body. The test cleans up files it creates; the test launcher pre-registers its fixture before Next starts and removes it on exit (Next production indexes public files once). No production fixture is committed.
- AC9 units: `nice -n 10 pnpm exec vitest run --project unit tests/unit/demo-media.test.ts tests/unit/demo-markup.test.ts --maxWorkers=2` — **26 passed**. The sandbox rejected changing process priority; the tests themselves executed and exited 0.
- Final `pnpm typecheck` and `pnpm lint` — **exit 0**, run with access to the shared compiler lock.

Root cause of the reproduced preload failure: the test inspected enhanced markup after playback began, when `DemoVideo` intentionally changes preload to `auto`. It now checks `preload="none"` in server HTML, preserving the no-JS assertion and all playback timing assertions.
The reported missing-demo scenario passes with the fixture manifest; without a manifest, absence of the demo is explicitly required by AC8. New army cases verify both states, including reduced-motion Play, walkthrough and four tiles. Browser interception of a manifest cannot affect the filesystem reader; the consumption guide documents the required server/test-cookie setup.

AC7 production Lighthouse before/after, measured CLS and actual Next client gzip remain **unverified**.
Firefox/WebKit and hosted CI were not run in this session. This is not a completion claim.
Reuse: existing native dialog/media APIs and helpers; no dependencies added. PR context: **Part of #96**;
the harness must check which sibling merges second before adding `Closes #96`.
