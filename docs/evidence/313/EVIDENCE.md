# Evidence — Issue #313: Fresh restart of #252: [e2e] Integrations catalog page failing on main (replaces #263)

Closes #252. Supersedes #263.
Branch: `ai/313` (PR #418)
Tested Commit SHA: `1a69efba`
Originating Sentry issue: None (release gate e2e failure `fl-integrations` on `main`, not a Sentry exception)
Originating Gate / Log: `fl-integrations` failure on `main` @ `9c754b2`

## 1. Acceptance Criteria

- **AC1:** `GET /api/integrations/catalog` returns `count: 12` and provider ids exactly `["google_sheets", "gmail", "slack", "hubspot", "zendesk", "airtable", "snowflake", "github", "stripe", "notion", "postgres", "linear"]` in that pinned order.
- **AC2:** The id `'mizano'` and actions prefixed `'mizano.'` are excluded from the public catalog (`listProviders()` in `src/integrations/registry.ts` and the `/api/integrations/catalog` response).
- **AC3:** The integrations catalog page (`/w/[slug]/integrations`) renders the 12 supported provider cards without Mizano. In Arabic locale (`fl_locale=ar`), layout is RTL (`dir="rtl"`) and Arabic translated categories are rendered for the 12 supported providers without displaying Mizano.
- **AC4:** Pre-GA Mizano remains registered in the internal provider registry via `allProviders()` and resolves by id via `getProvider("mizano")` and `getAction("mizano.create_customer")` for contract tests and saved step/flow lookups, leaving all 53 contract tests passing.
- **AC5:** Unit test suite `tests/unit/integrations-catalog.test.ts` (5/5 passed) and `tests/unit/i18n-content-text.test.ts` (43/43 passed) verify the exact catalog id list, order, omission of Mizano from public exports, and retention in `allProviders()`.
- **AC6:** Natural language e2e tests in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` tagged with `@issue-313` and `feat:fl-integrations` verify the 12 supported providers, empty search for Mizano actions, and Arabic RTL layout within the ≤ 8 top-level file cap.

## 2. Verification Report

| AC# | Criterion | Test / Command | Exit Code | Observed Result |
|---|---|---|---|---|
| **AC1** | `GET /api/integrations/catalog` returns 12 provider ids in exact order with `count: 12` | `nice -n 10 npx vitest run tests/unit/integrations-catalog.test.ts -t "GET /api/integrations/catalog" --maxWorkers=2` | 0 | Status 200, count 12, exact 12 ids in order, no `mizano`. |
| **AC2** | Pre-GA Mizano excluded from `listProviders()` and public catalog exports | `nice -n 10 npx vitest run tests/unit/integrations-catalog.test.ts -t "keeps the pre-GA Mizano" --maxWorkers=2` | 0 | `listProviders().some(p => p.id === "mizano") === false`; no `mizano.*` actions exported. |
| **AC3** | Integrations page renders 12 provider cards, RTL for Arabic, and no Mizano card | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` (@issue-313 AC1 & AC3) | CI | Verified in e2e-army scenarios; Playwright specs in `e2e/arabic.spec.ts:326` confirm RTL and no horizontal scroll. |
| **AC4** | Pre-GA Mizano registered internally in `allProviders()`, `getProvider()`, `getAction()` | `nice -n 10 npx vitest run tests/contract/mizano.test.ts tests/contract/mizano-http.test.ts --maxWorkers=2` | 0 | `allProviders()` returns 13 providers; `getProvider("mizano")` resolves; 53/53 contract tests pass. |
| **AC5** | Unit test suite verifies catalog and i18n content translations | `nice -n 10 npx vitest run tests/unit/integrations-catalog.test.ts tests/unit/i18n-content-text.test.ts --maxWorkers=2` | 0 | 48 passed across 2 test files (5 in catalog, 43 in i18n content). |
| **AC6** | Natural language E2E tests for integrations catalog and search within 8-file cap | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` (tagged `@issue-313`, `feat:fl-integrations`) | CI | Exactly 8 top-level files in `e2e-army/` verified by `tests/unit/e2e-army-tooling.test.ts` (12/12 passed). |

## 3. Changed Covering Tests

- `tests/unit/integrations-catalog.test.ts`:
  - `lists exactly the 12 supported providers, in order` (AC1)
  - `keeps the pre-GA Mizano provider out of the catalog` (AC2)
  - `still registers every supported provider and Mizano for lookups by id` (AC4)
  - `GET /api/integrations/catalog returns exactly the 12 ids in order and contains no 'mizano'` (AC1, AC2)
  - `demonstrates regression: base logic returned all registered providers including mizano (13), while head filters pre-GA (12)` (Bug fix regression)
- `tests/unit/i18n-content-text.test.ts`:
  - Updated to iterate over `allProviders()` so that translations for all registered providers (including Mizano) remain verified while public catalog is filtered.
- `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
  - `@issue-147 @issue-252 @issue-313 AC1: the integrations catalog shows the 12 supported providers and does not offer pre-GA Mizano`
  - `@issue-148 @issue-252 @issue-313 AC2: searching the catalog for the Mizano actions finds nothing while Mizano is pre-GA`
  - `@issue-313 AC3: Arabic integrations catalog displays RTL and renders the 12 supported providers with translated categories`

## 4. Regression Test Evidence (Fails on Base, Passes on Head)

### Base Implementation (without PRE_GA filter in `listProviders()`)
On `origin/main` before the fix, `listProviders()` returned `PROVIDERS` directly without filtering `PRE_GA`:
```
FAIL tests/unit/integrations-catalog.test.ts > integration catalog (#252 / #313) > lists exactly the 12 supported providers, in order
AssertionError: expected [ ..., "linear", "mizano" ] to deeply equal [ ..., "linear" ]
- Expected: 12 providers ending in "linear"
+ Received: 13 providers ending in "mizano"

FAIL tests/unit/integrations-catalog.test.ts > integration catalog (#252 / #313) > keeps the pre-GA Mizano provider out of the catalog
AssertionError: expected true to be false

FAIL tests/unit/integrations-catalog.test.ts > integration catalog (#252 / #313) > GET /api/integrations/catalog returns exactly the 12 ids in order and contains no 'mizano'
AssertionError: expected 13 to be 12
```

### Head Implementation (with PRE_GA filter and `allProviders()` in `src/integrations/registry.ts`)
Command: `nice -n 10 npx vitest run tests/unit/integrations-catalog.test.ts --maxWorkers=2`
Observed Exit Code: `0`
Output:
```
 ✓ |unit| tests/unit/integrations-catalog.test.ts (5 tests) 12ms
   ✓ integration catalog (#252 / #313) (5)
     ✓ lists exactly the 12 supported providers, in order 2ms
     ✓ keeps the pre-GA Mizano provider out of the catalog 1ms
     ✓ still registers every supported provider and Mizano for lookups by id 1ms
     ✓ GET /api/integrations/catalog returns exactly the 12 ids in order and contains no 'mizano' 7ms
     ✓ demonstrates regression: base logic returned all registered providers including mizano (13), while head filters pre-GA (12) 1ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## 5. Pre-Push Quality Checks

- `pnpm typecheck`: Exit Code `0` (`tsc --noEmit` clean).
- `pnpm lint`: Exit Code `0` (`eslint . --cache` clean).
- Unit & Contract tests:
  - `nice -n 10 npx vitest run tests/unit/integrations-catalog.test.ts tests/unit/i18n-content-text.test.ts tests/contract/mizano.test.ts tests/contract/mizano-http.test.ts --maxWorkers=2`: Exit Code `0` (101/101 passed).
  - `nice -n 10 npx vitest run tests/unit/e2e-army-tooling.test.ts --maxWorkers=2`: Exit Code `0` (12/12 passed, confirming top-level e2e-army file count is capped at 8).
  - `nice -n 10 npx vitest run tests/unit/copilot-repairs.test.ts --maxWorkers=2`: Exit Code `0` (10/10 passed).
- Docs check (`scripts/ci/docs-check.mjs`): Exit Code `0` (Markdown doc in `docs/evidence/313/` satisfies CI requirement).

## 6. Review Threads Resolution

1. `src/integrations/registry.ts:17`: Added `PRE_GA_PROVIDERS` filter (`new Set(["mizano"])`) to exclude Mizano from `listProviders()` while preserving it in `allProviders()`, `getProvider()` and `getAction()` for internal lookups and contract tests.
2. `e2e-army/147-mizano-create-customer-and-quote.e2e.ts:6`: Updated natural language e2e tests within the 8-file cap to verify the 12 supported providers, confirm empty search for Mizano actions, and check Arabic RTL layout without Mizano.
3. `tests/unit/integrations-catalog.test.ts:1`: Added comprehensive unit tests in `tests/unit/integrations-catalog.test.ts` (5/5 passing) verifying exact 12 catalog IDs in order, filtering of `mizano`, retention in `allProviders()`, and regression proof (base 13 fails vs head 12 passes).
4. `src/server/copilot-patch.ts:111`: Updated to use `getProvider(provider) !== undefined` instead of `listProviders().some((p) => p.id === provider)`, ensuring pre-GA providers like Mizano are recognized during Copilot patch validation, resolving the reviewer thread.

## 7. Skills Used

- `model-effort-routing`: Explicitly chosen model Gemini 3.8 Flash with reasoning effort High.
- `test-first engineering`: Regression tests in `tests/unit/integrations-catalog.test.ts` and `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`.
- `diagnosing-bugs` & `systematic-debugging`: Identified root cause of `fl-integrations` gate failure on main.
- `verification-before-completion`: Fresh verification commands executed with exact output and exit codes recorded.
