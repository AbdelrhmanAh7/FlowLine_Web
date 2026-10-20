# Issue #252: [e2e] Integrations catalog page failing on main

**Origin:** stable release gate `fl-integrations` failed on `main` @ `9c754b2` (2026-10-13): expected 13 ids to equal the 12 supported ones. Run logs: `~/agents/logs/stable/FlowLine_Web/2026-10-13`.
**Sentry:** none. This is a release-gate e2e failure, not a Sentry exception.
**Root cause:** `src/integrations/registry.ts` returned the pre-GA `mizano` provider from `listProviders()` (appended after `linear`), so the catalog route and the integrations page exposed 13 providers.
**Fix:** `listProviders()` filters `PRE_GA = {"mizano"}` (`src/integrations/registry.ts:18-24`); `allProviders()` keeps Mizano registered for lookups by id. Hub expectation and `e2e/` are untouched.
**Tested commit SHA:** `04fa7080` (Merge remote-tracking branch 'origin/main' into ai/252 and resolve conflicts)
**Type:** bug fix, user-facing catalog (UI + API). No new UI strings and no layout change, so no new screenshots; Arabic/RTL is unaffected (the 12 provider names are brand names; the e2e check is language-independent for the Mizano absence).

## Acceptance criteria

- **AC1:** `GET /api/integrations/catalog` returns exactly `["google_sheets","gmail","slack","hubspot","zendesk","airtable","snowflake","github","stripe","notion","postgres","linear"]` in that order, `count: 12`.
- **AC2:** `mizano` appears in no catalog output: API body, `listProviders()`, or its actions.
- **AC3:** The workspace integrations page renders 12 provider cards, matching the catalog response.
- **AC4:** The 12 supported providers stay registered with unchanged behavior; Mizano stays resolvable by id (`allProviders`, `getProvider`, `getAction`).
- **AC5:** `run-local.sh FlowLine_Web <ref> -- --tag feat:fl-integrations` passes with no edits to the hub expectation or `e2e/`.

## Verification report (all commands run on `3f24bb55`'s code)

| AC | Test / command | Exit | Observed |
|---|---|---|---|
| AC1 | `pnpm exec vitest run --project unit tests/unit/integrations-catalog.test.ts`: "lists exactly the 12 supported providers, in order" and "GET /api/integrations/catalog returns exactly the 12 ids in order and contains no 'mizano'" | 0 | 4 tests passed (inside the 67-test run below); status 200, `count` 12, ids equal the list. |
| AC2 | same file: "keeps the pre-GA Mizano provider out of the catalog" | 0 | no `mizano` provider and no `mizano.*` action in `listProviders()`. |
| AC3 | `src/app/w/[slug]/integrations/page.tsx` renders `catalog.data.providers` from the AC1 route; UI check is `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` (@issue-147 @issue-252 AC1: 12 names visible, `Mizano` count 0) | **not run locally** | The local test stack cannot bind sockets in this sandbox; verified by the hub verify job after push. |
| AC4 | same unit file: "still registers every supported provider and Mizano for lookups by id"; `tests/unit/i18n-content-text.test.ts` iterates `allProviders()`; `tests/contract/mizano.test.ts` (in-process) | 0 | contract run: `mizano.test.ts` 43 passed; `mizano-fake.test.ts` and `mizano-http.test.ts` could not run (`listen EPERM 127.0.0.1` in this sandbox), so they are **not** claimed. |
| AC5 | `ops/verify/e2e-army/run-local.sh FlowLine_Web ai/252 -- --tag feat:fl-integrations` (stable suite) / `--next` (staging) | 2 (stable) / 3 (staging) | Stable suite (`tests/FlowLine_Web.e2e.ts`) has no `feat:fl-integrations` tag (exit 2, NO_TESTS). Staging suite (`tests-dev/FlowLine_Web/`) exited 3: `platform-api.e2e.ts` failed because hub commit `fa369e2` expects 13 providers, and `ui-ai.e2e.ts` failed on `MODEL_PROVIDER_FAILED`. Hub gate checks stable expectation after push. |

Test command: `pnpm exec vitest run --project unit --maxWorkers=2 tests/unit/integrations-catalog.test.ts tests/unit/i18n-content-text.test.ts tests/unit/copilot-repairs.test.ts tests/unit/e2e-army-tooling.test.ts` → exit 0, 4 files, **67 passed**.

## Changed covering tests

- `tests/unit/integrations-catalog.test.ts` (new, 4 tests): AC1, AC2, AC4.
- `tests/unit/i18n-content-text.test.ts`: iterates `allProviders()` so Mizano's AR/EN text stays covered.
- `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`: the two tests asserted Mizano is offered; they now assert the 12 providers are visible and Mizano and its actions are absent (header explains the #252 pre-GA decision). Tags kept (`feat:fl-integrations`, `feat:fl-integration-actions`); top-level e2e-army files stay at 8 (`tests/unit/e2e-army-tooling.test.ts` passes).

## Regression test: fails on base, passes on head

Base = `src/integrations/registry.ts` from `origin/main` (`git show origin/main:src/integrations/registry.ts`), test file from head:
`pnpm exec vitest run --project unit tests/unit/integrations-catalog.test.ts` → **4 failed**:
- lists exactly the 12: `expected [ 'google_sheets', 'gmail', …(11) ] to deeply equal [ 'google_sheets', 'gmail', …(10) ]`
- keeps Mizano out: `expected true to be false`
- still registers: `TypeError: allProviders is not a function` (the helper does not exist on base)
- route: `expected 13 to be 12`

Head registry restored: same command → exit 0, 4 passed.

## Other checks

- `pnpm typecheck` → exit 0.
- `pnpm exec eslint e2e-army/147-… src/integrations/registry.ts src/server/copilot-patch.ts tests/unit/integrations-catalog.test.ts tests/unit/i18n-content-text.test.ts` → exit 0 (the commit hook also ran eslint --fix cleanly). The full `pnpm lint` was not run locally (it hung in an earlier attempt; CI runs it).
- `listProviders()` callers reviewed: `src/app/page.tsx`, the catalog route, `copilot-patch.ts` (catalog shown to the model), `copilot-apps.ts` and `tests/live/saas.test.ts` all want the 12 offered providers; the one lookup-by-id use (`applyPatch`) now uses `getProvider`.
