> **SUPERSEDED:** this gate is for the earlier candidate `09a1fbe` (cp3). The final candidate is `refs/checkpoints/design-v2-closeout-12` (`596c470`); see `../final-cp10/GATE.md`.

# design-v2 automated gate: complete, on one frozen candidate

**Headless automated tests with test doubles only.** This is not live-provider verification. It does not replace
Chrome exploratory QA, which is still pending, and it is not a release approval.

## Frozen candidate
- **Code:** local checkpoint 3, `refs/checkpoints/design-v2-20260929-e2e-rerun-3` = `09a1fbe` (rebuilt from `7f98337`
  for DV2-02; code trees identical).
- **Code trees:**
  - `src` `8ae6b7a`, `e2e` `9f928be`, `tests` `b24fd40`, `scripts` `b2c2c44`, `worker` `fb714bf`, `drizzle` `8d3601b`
  - `package.json` `dd045fa`, `pnpm-lock.yaml` `233a1bc`, `playwright.config.ts` `971cb58`, `next.config.ts` `035378d`
- **Working tree check:** re-hashed through a temporary index before the gate; identical in every subtree.
- **Branch:** `design-v2` HEAD `fb563e5`. The candidate is uncommitted on the branch and preserved only in the local
  checkpoint refs. Nothing is pushed or merged.
- **Build:** `next build` + `next start` (`FLOWLINE_TEST_NEXT=start`), BUILD_ID `Nzpo9ICHJUYXqfrEtXerH`, built from
  `src` `8ae6b7a`. One stack, readiness checked, reused by every browser run.

## Results, same frozen code, run in sequence

| Gate | Command (see `commands.txt`) | Result | Log |
|---|---|---|---|
| Chromium (all 77 tests) | `playwright test --project=chromium --workers=1` | **77 / 77 passed**, one uninterrupted run, 0 flaky, 0 skipped, 3.8 min, "using 1 worker" | `chromium.txt`, `results-chromium.json` |
| Firefox (`@critical`/`@cross-browser`, 25 tests) | `playwright test --project=firefox --workers=1` | **25 / 25 passed**, 1.8 min, 1 worker | `firefox.txt`, `results-firefox.json` |
| WebKit (`@critical`/`@cross-browser`, 25 tests; Linux Playwright v1.63.0 container) | `bash e2e/tools/webkit-docker.sh --workers=1` | **25 / 25 passed**, 2.1 min, 1 worker | `webkit.txt` |
| Lint | `pnpm lint` | exit 0 | `lint.txt` |
| Typecheck | `pnpm typecheck` | exit 0 | `typecheck.txt` |
| Unit | `pnpm test` | **306 / 306** (34 files) | `unit.txt` |
| Contract | `pnpm test:contract` | **465 / 465** (22 files) | `contract.txt` |
| Integration (after `pnpm stop:test`; no test worker running) | `pnpm test:integration` | **460 / 460** (47 files) | `integration.txt` |

- **Coverage:** each browser ran its complete project as defined in `playwright.config.ts`. Chromium runs everything;
  Firefox and WebKit run the `@critical|@cross-browser` subset. Each was **one uninterrupted run** of that project, not
  stitched batches.
- **The targeted 29-test rerun** (`../rerun-20260929-2012/TARGETED-RERUN.md`) is a separate, earlier result. This
  gate doesn't depend on it.

## Resources (`../rerun-20260929-2012/memory.csv`, 189 samples, every 5 s, 0 sampler errors)

| Phase | Available memory | Committed memory |
|---|---|---|
| Overall minimum, during `next build` | 11.9 GB | 33.7 GB of 54.5 GB |
| During all browser runs, 20:14:20–20:28:25 | at least 13.8 GB (minimum at 20:26:24, WebKit container start) | at most 31.2 GB |

- **Peaks:** test-owned node 3.1 GB private (build), Playwright browser 1.1 GB private.
- **Docker VM:** 4.1 GB (`.wslconfig` memory=4GB). Containers used about 0.5 GB before WebKit.
- **After the run:** 0 test-owned node processes and 0 Playwright browsers left. Test ports free.

## Findings (`../../BUGS.md`)
- **DV2-01 (test defect, P2):** fixed in the test. See the targeted rerun.
- **DV2-02 (evidence hygiene, P2):** remediated. The test key was redacted from a helper log and the checkpoints were
  rebuilt; rotating the key is recommended.
- **No application defect found in this gate.**

## Still required / open
- **Google Chrome exploratory QA (Codex):** not run.
- **Visual review of the after-screenshots (Ollama):** not run.
- **Final `NOTES.md`:** still a draft.
- **Sonnet review items left open:**
  - P2-4: hero scrub only at pin release.
  - `e2e/landing.spec.ts` should assert `.hero-scrub` and reveal opacity.
  - The style-guide nested-theme tints.
  - The unused `@radix-ui/react-select`.
  - Toasts are hidden from screen readers while a modal is open.
  - Amber/orange are nearly identical in the light theme (documented trade-off).
- **Not committed on `design-v2`:** the owner decides; merging to `phase-4`/`ai-hub`/`main` needs owner approval.
