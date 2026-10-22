# Evidence — Issue #375: fix flow list invariance verification and malformed URI handling in 117-flows-list-dashboard.e2e.ts (split from #362)

**Model:** Gemini 3.8 Flash · **Effort:** High · **Why:** Fix CodeRabbit review threads and verify gate failures on PR #380 (issue #375), prove flow list invariance contract, harden workspace slug validation, safely handle malformed URI escapes with middleware and not-found routes (HTTP 404), and record verification evidence.

## Overview & Scope
- **Issue**: #375 (`fix: 117-flows-list-dashboard.e2e.ts: blocker (Claude Sonnet 5.5·medium): Not fixed from CodeRabbit (AC2): … (split from #362)`)
- **PR**: PR #380 (Rounds 1 & 2 Review and Verification Resolution)
- **Originating CodeRabbit Discussion**: [discussion_r4337196672](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/362#discussion_r4337196672)
- **Originating Sentry Issue**: None (CodeRabbit review blocker finding on PR #362, review threads on PR #380, and verification 500 finding on malformed slug escapes)
- **Parent Issues**: #295, #164
- **Supersedes**: part of PR #362
- **Branch**: `ai/375` (clean branch off `origin/main`)
- **Tested Commit SHA**: ced79bda530fe30089ffb5749c95d82054ff140c
- **User-Facing UI Changed**: No (middleware URI/slug interception, backend validation, URL parsing, E2E request-level test assertions, unit test guards). Playwright screenshots and RTL/LTR Arabic visual captures are exempt for backend/middleware/test-only changes; Arabic strings and RTL layout are verified in `e2e/arabic.spec.ts`.

## Review Threads & Finding Resolutions

### 1. `e2e-army/117-flows-list-dashboard.e2e.ts:144` — Substitute for unmerged n8n import test
- **Finding**: The original blocker in #362 was in an n8n import test. Because n8n import was not merged, explain why the API test in `117-flows-list-dashboard.e2e.ts` is a valid substitute.
- **Resolution & Explanation**: PR #362 attempted to add n8n import along with an E2E test that lacked before/after flow snapshotting. PR #362 was closed unmerged after 6 fix rounds; n8n import was restarted on issue #368. Because the n8n import UI and endpoint do not exist on `main`, an E2E test interacting with "Import from n8n" cannot run on `main`. On `main`, `117-flows-list-dashboard.e2e.ts` is the canonical test suite for `feat:fl-flows-list`, and flow creation occurs via `POST /api/workspaces/:wid/flows`. The `@issue-375 AC1` test directly proves the flow list invariance contract on `main`: before/after capture of flow count and flow IDs when creation requests fail. Furthermore, unit test guard `tests/unit/flows-list-ac2-guard.test.ts` analyzes historical PR #362 code snippets (AC2, AC5, AC8) to prove that the old patterns fail the guard and that proper pre/post snapshotting and button wiring are enforced.

### 2. `e2e-army/117-flows-list-dashboard.e2e.ts:166` — Confirmation of HTTP 400 status codes
- **Finding**: Hard-coded status 400 for `{ templateId: 'non-existent-template-id' }` and `{ name: 12345 }` needed verification against the route handler.
- **Resolution & Proof**: Verified against the route handler and server logic:
  - Unknown template: `createFlow` throws `HttpError(400, "UNKNOWN_TEMPLATE", "That template isn't available")`, returning HTTP 400.
  - Non-string name (`{ name: 12345 }`): `parseBody` runs `z.object({ name: z.string().optional(), templateId: z.string().optional() })`, failing Zod validation and throwing `HttpError(400, "VALIDATION", "Invalid request")`, returning HTTP 400.
  - Whitespace-only name (`{ name: "   " }`): `parseBody` passes `{ name: "   " }`, but `createFlow` validates via `flowNameSchema.parse("   ")` (`min(1)`), which throws `ZodError`. The `route()` wrapper catches `ZodError` and serializes it as HTTP 400 `VALIDATION`.
  - Added unit test `AC15` in `tests/unit/flows-list-ac2-guard.test.ts` that directly invokes `POST /api/workspaces/[wid]/flows` and proves that all three payloads return real HTTP 400 responses with the exact expected error codes.

### 3. `src/server/access.ts` & `src/lib/slug.ts` — Placeholder slug validation without blocking valid tenant slugs
- **Finding**: `isPlaceholderSlug` previously blocked plain strings like `"slug"` or `"wid"`, making legitimate workspaces named "Slug" or "Wid" unreachable.
- **Resolution**: Extracted `isPlaceholderSlug` into pure module `src/lib/slug.ts` (re-exported by `src/server/access.ts`): `(trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")) || trimmed.startsWith(":")`. This rejects template placeholders (`{slug}`, `[slug]`, `:slug`, `{wid}`, `[wid]`, `:wid`) while safely allowing real tenant slugs like `slug` and `wid`. In `requireWorkspace`, non-UUIDs are already rejected with 404 HttpError, and ambiguous placeholders are rejected as well.

### 4. `tests/unit/flows-list-ac2-guard.test.ts:9` — Robust Drizzle query mock with fluent chaining
- **Finding**: The database mock in `flows-list-ac2-guard.test.ts` returned rigid arrays where chained `.limit(1)` or `.returning()` or `.then` could throw TypeErrors.
- **Resolution**: Built `createDrizzleQueryMock` which implements a fluent thenable query chain supporting `.select()`, `.insert()`, `.update()`, `.delete()`, `.where()`, `.innerJoin()`, `.leftJoin()`, `.from()`, `.limit()`, `.offset()`, `.orderBy()`, `.values()`, `.returning()`, `.for()`, `.then()`, `.catch()`, and `.finally()`. Tested explicitly in `AC14` to guarantee no TypeErrors occur.

### 5. `src/middleware.ts` & `src/app/not-found/page.tsx` — Handling malformed URL escape sequences and placeholder slugs before route matching
- **Finding**: In Next.js App Router, dynamic route parameter matching executes `decodeURIComponent` inside Next.js's internal `route-matcher.ts`. When a malformed escape sequence (such as `%E0%A4%A`) is requested at `/w/%E0%A4%A/flows` or `/w/%E0%A4%A/runs`, Next.js throws an internal `DecodeError` before `WorkspaceLayout` is reached. In App Router without a pages `_error` handler, Next.js rendered a 500 Internal Server Error page.
- **Resolution**: Implemented `src/middleware.ts` which runs prior to Next.js route matching. Middleware safely attempts `decodeURIComponent` on `request.nextUrl.pathname` and `request.nextUrl.search`. If malformed percent-encoding is detected or an ambiguous placeholder slug (`{slug}`, `[slug]`, `:slug`) is present in the workspace segment:
  - For page routes, middleware rewrites the request to `/not-found` (`src/app/not-found/page.tsx`, which renders `src/app/not-found.tsx`) with HTTP status 404.
  - For API routes, middleware immediately returns a JSON HTTP 404 response (`{ error: { code: "NOT_FOUND", message: "..." } }`).
  - Valid tenant slugs (`slug`, `wid`, `my-workspace`) pass through clean without rewrite.
  - Added test `@issue-375 AC2` to `e2e-army/117-flows-list-dashboard.e2e.ts` and unit tests `AC16` and `AC17` to `tests/unit/flows-list-ac2-guard.test.ts`.

### 6. `vitest.config.mts` — Guard integration globalSetup and file inclusion when test database is not configured
- **Finding**: Pre-push verification runs `vitest related` across files touched in the push without `--project unit`. When source files imported by integration tests (e.g. `src/server/access.ts`) are changed, Vitest initialized the `integration` project, running `tests/integration/global-setup.ts` which threw `Error: Integration tests must run against flowline_test (got ). Use pnpm test:integration.` because no PostgreSQL instance is configured in pre-push environments.
- **Resolution**: In `vitest.config.mts`, guarded `integration` and `nightly` projects with `hasTestDb = Boolean(process.env.DATABASE_URL && /\/flowline_test(_[a-z0-9]+)?(\?|$)/.test(process.env.DATABASE_URL))`. When `DATABASE_URL` is configured for `flowline_test` (e.g. `pnpm test:integration` via `with-env.mjs .env.test`, or CI integration shards), integration tests and global setup run normally. In database-free unit and pre-push runs, integration global setup is not executed and integration test files are not erroneously triggered without a database. Tested in `AC18`.

---

## Numbered Acceptance Criteria

| AC | Requirement | Implementation / Verification File |
|---|---|---|
| **AC1** | When an invalid flow creation request is rejected, the workspace flow count and flow IDs are proven unchanged by capturing count and IDs before and comparing after; asserts HTTP 400 and specific error codes (UNKNOWN_TEMPLATE, VALIDATION) | `e2e-army/117-flows-list-dashboard.e2e.ts` test `@issue-375 AC1` |
| **AC2** | Negative control regression: historical PR #362 AC2 snippet with alert-only assertion is detected and flagged by `analyzeFlowInvarianceAssertion` | `tests/unit/flows-list-ac2-guard.test.ts` test `AC2` |
| **AC3** | All active tests asserting flow invariance capture before/after state and compare IDs and count | `tests/unit/flows-list-ac2-guard.test.ts` test `AC3` |
| **AC4** | Total top-level files in `e2e-army/` does not exceed the hub limit of 8 files | `tests/unit/flows-list-ac2-guard.test.ts` test `AC4` |
| **AC5** | Ambiguous placeholder slugs (e.g. `{slug}`, `[slug]`, `:slug`, `{wid}`) are identified while valid tenant slugs (`slug`, `wid`) are allowed | `tests/unit/flows-list-ac2-guard.test.ts` test `AC5` |
| **AC6** | `requireWorkspace` rejects placeholder wids and non-UUIDs with 404 HttpError | `tests/unit/flows-list-ac2-guard.test.ts` test `AC6` |
| **AC7** | `requireWorkspaceBySlug` returns `null` for ambiguous placeholder slugs and queries real slugs against the database | `tests/unit/flows-list-ac2-guard.test.ts` test `AC7` |
| **AC8** | Malformed URL escape sequences in workspace layout slug (e.g. `%E0%A4%A`) are caught and handled with 404 `notFound()` rather than throwing 500 `URIError` | `tests/unit/flows-list-ac2-guard.test.ts` test `AC8` |
| **AC9** | Flow creation rejects unknown template with HTTP 400 and code `UNKNOWN_TEMPLATE` | `tests/unit/flows-list-ac2-guard.test.ts` test `AC9` |
| **AC10** | `flowNameSchema` rejects invalid names (whitespace-only, numeric/non-string) | `tests/unit/flows-list-ac2-guard.test.ts` test `AC10` |
| **AC11** | Flow creation route schema rejects non-string name and invalid payloads with validation error | `tests/unit/flows-list-ac2-guard.test.ts` test `AC11` |
| **AC12** | File upload button wiring: tests must trigger `waitForEvent('filechooser')` and click visible upload button rather than calling `setInputFiles` directly on hidden inputs | `tests/unit/flows-list-ac2-guard.test.ts` test `AC12` |
| **AC13** | Placeholder node execution guard: tests must assert both `INVALID_FLOW` status and `SETUP_REQUIRED` issue codes rather than generic status alone | `tests/unit/flows-list-ac2-guard.test.ts` test `AC13` |
| **AC14** | Mock query builder supports fluent Drizzle chaining (`.where`, `.limit`, `.returning`, `.for`) without TypeError | `tests/unit/flows-list-ac2-guard.test.ts` test `AC14` |
| **AC15** | `POST /api/workspaces/[wid]/flows` route handler returns real HTTP 400 status codes for invalid payloads (unknown template, numeric name, whitespace name) | `tests/unit/flows-list-ac2-guard.test.ts` test `AC15` |
| **AC16** | Middleware intercepts malformed URI percent-escape sequences (e.g. `%E0%A4%A`) in page and query paths, rewriting them to `/not-found` with HTTP 404, and returns JSON 404 for API routes | `src/middleware.ts`, `tests/unit/flows-list-ac2-guard.test.ts` test `AC16`, `e2e-army/117-flows-list-dashboard.e2e.ts` test `@issue-375 AC2` |
| **AC17** | Middleware intercepts placeholder slugs (`{slug}`, `[slug]`, `:slug`) in workspace routes, rewriting them to `/not-found` with HTTP 404 (and JSON 404 for API routes), while allowing valid tenant slugs (`slug`, `wid`, `my-workspace`) without rewrite | `src/middleware.ts`, `tests/unit/flows-list-ac2-guard.test.ts` test `AC17`, `e2e-army/117-flows-list-dashboard.e2e.ts` test `@issue-375 AC2` |
| **AC18** | `vitest.config.mts` guards `integration` and `nightly` test execution and `globalSetup` behind `hasTestDb`, allowing `vitest related` to run cleanly without database errors | `vitest.config.mts`, `tests/unit/flows-list-ac2-guard.test.ts` test `AC18` |

---

## Verification Report

| ID | Test / Command | Expected | Observed Result | Exit Code |
|---|---|---|---|---|
| **AC1** | `e2e-army/117-flows-list-dashboard.e2e.ts` `@issue-375 AC1` | Request-level API test captures before/after rows and IDs and verifies equality and error codes | Validated; tagged `feat:fl-flows-list`, `lvl:api` | 0 |
| **AC2** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 1) | Historical PR #362 snippet flags missing pre-action snapshot, missing comparison, alert-only | 3 violations flagged on historical snippet | 0 |
| **AC3** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 2 & 3) | Head test `117-flows-list-dashboard.e2e.ts` passes guard with 0 violations | All active tests pass with 0 violations | 0 |
| **AC4** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 4) | Top-level `e2e-army/*.e2e.ts` count <= 8 | 8 files present (hub cap respected) | 0 |
| **AC5** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 5) | `isPlaceholderSlug` flags ambiguous placeholders (`{slug}`, `[slug]`, `:slug`) and allows `slug`, `wid` | Passed clean | 0 |
| **AC6** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 6) | `requireWorkspace` rejects placeholder wids and non-UUIDs with 404 HttpError | Passed clean (HTTP 404 NOT_FOUND returned) | 0 |
| **AC7** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 7) | `requireWorkspaceBySlug` returns `null` for ambiguous placeholders and queries real slugs | Passed clean | 0 |
| **AC8** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 8) | `decodeURIComponent` malformed escape is caught and triggers `notFound()` | Passed clean (URIError caught, notFound invoked) | 0 |
| **AC9** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 9) | Unknown template rejected with 400 UNKNOWN_TEMPLATE | Passed clean (HTTP 400 returned) | 0 |
| **AC10** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 10) | `flowNameSchema` rejects whitespace and non-string types | Passed clean (Zod validation throws) | 0 |
| **AC11** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 11) | Flow creation schema rejects numeric name/template | Passed clean | 0 |
| **AC12** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 12) | Historical PR #362 AC5 snippet flags direct setInputFiles bypassing button wiring | 1 violation flagged on historical snippet | 0 |
| **AC13** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 13) | Historical PR #362 AC8 snippet flags missing SETUP_REQUIRED assertion | 1 violation flagged on historical snippet | 0 |
| **AC14** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 14) | Drizzle mock supports chained `.where`, `.limit(1)`, `.returning()`, `.for()` without TypeError | Passed clean | 0 |
| **AC15** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 15) | Real `POST /api/workspaces/[wid]/flows` route returns 400 for unknown template and validation errors | Passed clean (HTTP 400 UNKNOWN_TEMPLATE, VALIDATION) | 0 |
| **AC16** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 16) | Middleware rewrites malformed URI escapes in page/query to `/not-found` with 404, and JSON 404 for API | Passed clean (HTTP 404, rewrite to /not-found) | 0 |
| **AC17** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 17) | Middleware rewrites placeholder slugs to `/not-found` with 404, passes valid tenant slugs | Passed clean (HTTP 404 on placeholders, allowed on valid slugs) | 0 |
| **AC18** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` (test 18) | `vitest.config.mts` guards integration/nightly projects behind `hasTestDb`, enabling clean `vitest related` | Passed clean (18/18 passed) | 0 |
| **Unit Suite** | `pnpm vitest run tests/unit/flows-list-ac2-guard.test.ts` | All 18 tests in suite pass | 18/18 passed | 0 |
| **Lint** | `pnpm lint` (`eslint .`) | Clean lint with 0 errors/warnings across repo | Passed clean | 0 |
| **Typecheck** | `pnpm typecheck` (`tsc --noEmit`) | TypeScript compiles with 0 errors across repo | Passed clean | 0 |

---

## Covering Tests Changed
- `e2e-army/117-flows-list-dashboard.e2e.ts` (`@issue-375 AC1`, `@issue-375 AC2`)
- `tests/unit/flows-list-ac2-guard.test.ts` (AC1 - AC17)

---

## Regression Negative Control Proof
1. Running `analyzeFlowInvarianceAssertion(HISTORICAL_PR362_AC2_SNIPPET)` demonstrates that the flawed test pattern from PR #362 produces:
   - `MISSING_PRE_ACTION_SNAPSHOT: Flow list invariance assertion lacks pre-action flow snapshot (flow count or IDs not captured before attempt)`
   - `MISSING_POST_ACTION_COMPARISON: Flow list invariance assertion does not compare post-action flow list (count/IDs) against pre-action state`
   - `ALERT_ONLY_ASSERTION: Test relies solely on alert visibility to claim no flow was created, leaving flows created despite error undetected`
2. Next.js App Router without middleware threw `DecodeError` in internal `route-matcher.ts` on `GET /w/%E0%A4%A/flows`, returning 500 Internal Server Error. With `src/middleware.ts` intercepting malformed URI escapes and rewriting to `/not-found`, HTTP 404 Not Found is reliably returned.
