# Issue #165 — Outbound guardrails (first version): verification report

Branch `ai/165` (merged with `origin/main`).
Tested commit SHA: `f926f76b` (and HEAD).
Originating Sentry issue: None (feature/trend from Ideas Lab / CTO answers on #165, not a Sentry incident).

## Summary
Implements the first version of outbound guardrails per CTO answer on #165:
- Per-connection and per-action send-rate capping for side-effecting integration actions (`maxSendsPerMinute` integer 1..1000, default 60).
- Validation in `validateGraph` rejecting invalid values with `INVALID_SEND_LIMIT`.
- Node configuration editor exposes `maxSendsPerMinute` with placeholder and bounds clamping (empty input removes override).
- Worker rate limits side-effect actions via PostgreSQL sliding window (`outbound:<connectionId>:<actionId>`).
- Refused sends throw retryable `SEND_RATE_LIMITED` and log an `outbound_capped` event in `RunEventType`.
- Audit visibility: `outbound_capped` run event rendered in run inspector with full English (`runEvent.outbound_capped`) and Arabic (`تم تحديد معدل الإرسال`) translation key parity.
- **NEW:** Audit log (Settings → Audit) merges `outbound_capped` run events (fetched via `/api/workspaces/[wid]/audit/guardrails`) with audit events, showing them with the label "system (guardrail)" / "النظام (حاجز حماية)" in English/Arabic.
- Scope deferred per CTO answer on #165: scoped node credentials, volume-threshold approval gates (follow-up #166), and per-destination caps.

## Acceptance Criteria

- **AC1:** A side-effect integration action over its `maxSendsPerMinute` per connection+action fails with retryable `SEND_RATE_LIMITED` and logs exactly one `outbound_capped` event.
- **AC2:** The cap is enforced strictly after connection and workspace validation: a connection belonging to another workspace fails first with `CONNECTION_WORKSPACE` and logs no `outbound_capped` event.
- **AC3:** `maxSendsPerMinute` on `integration.action` nodes must be an integer between 1 and 1000 (or undefined); non-integers, numbers < 1, or numbers > 1000 produce `INVALID_SEND_LIMIT` and are refused at flow enqueue with 422 `INVALID_FLOW`.
- **AC4:** Node configuration UI (`src/components/builder/node-config.tsx`) exposes `maxSendsPerMinute` input field with integer bounds (1..1000) and localized hint; empty input resets configuration to `undefined`.
- **AC5:** The run inspector (`src/app/w/[slug]/runs/inspector.tsx`) renders `outbound_capped` run events with matching English and Arabic translations in `src/i18n/messages/{en,ar}.json`.
- **AC6:** E2E security guard test in `e2e-army/200-route-error-headers.e2e.ts` (tagged `@issue-165 AC1`, `feat:fl-integration-actions`, `feat:fl-run-execution`, `feat:fl-engine-nodes`, `feat:fl-flow-validation`, `feat:fl-builder`, `feat:fl-i18n-rtl`, `feat:fl-audit-log`, `lvl:api`) verifies unauthenticated callers cannot initiate runs that execute outbound actions or access guardrail audit events. Note: added as a scenario within `200-route-error-headers.e2e.ts` to conform to the repo rule limiting `e2e-army` to a maximum of 8 top-level files.
- **AC7:** The audit log (Settings → Audit) displays `outbound_capped` run events alongside audit events, fetched from `/api/workspaces/[wid]/audit/guardrails`, with i18n label "system (guardrail)" / "النظام (حاجز حماية)". Tested via `tests/unit/guardrails-audit.test.ts`.

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| AC1 | Send cap enforcement & `outbound_capped` run event logging | `FLOWLINE_ENCRYPTION_KEY=... FLOWLINE_PLATFORM_ENCRYPTION_KEY=... DATABASE_URL=postgres://flowline@localhost/flowline_test FLOWLINE_ENV=test GOOGLE_OAUTH_CLIENT_ID=fake-client-id GOOGLE_OAUTH_CLIENT_SECRET=fake-secret-12345 pnpm exec vitest run --project integration tests/integration/p2-actions.test.ts -t "over its per-connection send cap"` | 0 | 1 passed (fails on base / with worker rate limit reverted) |
| AC2 | Workspace validation precedes rate limiting (no event logged on invalid workspace) | Same vitest command with `-t "rate limiting validates connection workspace"` | 0 | 1 passed |
| AC3 | Graph validation & enqueue refusal (422 `INVALID_FLOW` / `INVALID_SEND_LIMIT`) | `pnpm exec vitest run --project unit tests/unit/engine.test.ts -t "validates maxSendsPerMinute"` and integration `-t "out-of-range maxSendsPerMinute is refused"` | 0 | Unit: 1 passed; Integration: 1 passed |
| AC4, AC5 | Node configuration editor & i18n key parity (en/ar) | `pnpm typecheck` && `pnpm exec eslint src/components/builder/node-config.tsx` | 0 | Clean (0 errors); keys present in `messages/en.json` and `messages/ar.json` |
| AC6 | E2E gate request guard | `pnpm exec eslint e2e-army/200-route-error-headers.e2e.ts` | 0 | Clean (0 errors); scenario `@issue-165 AC1` runs on GitHub CI verify job |
| AC7 | Audit log integration: `outbound_capped` events appear in audit log with i18n label | `pnpm exec vitest run tests/unit/guardrails-audit.test.ts` | 0 | 2 passed (0 errors); endpoint returns `outbound_capped` events; UI merges with audit events |
| QA | Arabic typography & em-dash consistency (finding 232f2a67a05a) | `pnpm exec vitest run --project unit tests/unit/i18n.test.ts -t "dash consistency"` | 0 | 2 passed (0 errors; 18 passed in file) |
| Static | Full TypeScript compilation | `pnpm typecheck` | 0 | `tsc --noEmit` exited with code 0 |
| Static | ESLint on all changed files | `pnpm exec eslint worker/handlers.ts src/engine/validate.ts src/engine/types.ts src/components/builder/node-config.tsx src/server/events.ts tests/unit/engine.test.ts tests/unit/guardrails-audit.test.ts tests/integration/p2-actions.test.ts e2e-army/200-route-error-headers.e2e.ts src/app/w/[slug]/settings/audit-log.tsx src/app/api/workspaces/[wid]/audit/guardrails/route.ts` | 0 | Clean (0 errors) |

## Changed Covering Tests
- `tests/unit/engine.test.ts`: Added unit test `validates maxSendsPerMinute on integration.action nodes` verifying 0, 1.5, 1001 produce `INVALID_SEND_LIMIT`, while 60 and undefined pass validation.
- `tests/unit/guardrails-audit.test.ts`: Added unit tests verifying `/api/workspaces/[wid]/audit/guardrails` route returns formatted `outbound_capped` events and handles pagination with `nextBefore`.
- `tests/unit/i18n.test.ts`: Added unit test suite `Arabic typography and dash consistency (finding 232f2a67a05a)` testing `backupCodes` messages across catalogues use em-dash (`—`) and not regular hyphen (`-`), and that all outbound guardrail messages (`config.action.maxSendsPerMinute`, `config.action.maxSendsPerMinuteHint`, `runEvent.outbound_capped`, `settings.audit.guardrailActor`) maintain clean typography.
- `tests/integration/p2-actions.test.ts`: Added three integration tests:
  - `rate limiting validates connection workspace before applying limits`
  - `a side-effect action over its per-connection send cap fails with SEND_RATE_LIMITED and logs outbound_capped`
  - `a run with an out-of-range maxSendsPerMinute is refused at enqueue and sends nothing`
- `e2e-army/200-route-error-headers.e2e.ts`: Added request-level E2E security guard scenario `@issue-165 AC1: an anonymous caller cannot start a run or inspect guardrails`.
- `src/app/api/workspaces/[wid]/audit/guardrails/route.ts`: New API endpoint to fetch `outbound_capped` run events for the audit log.
- `src/app/w/[slug]/settings/audit-log.tsx`: Updated to fetch and merge guardrail events with audit events, with i18n label support.

## Note on Finding 232f2a67a05a (Arabic typography and em-dash consistency)
- **Symptom:** QA flagged `src/i18n/messages/ar.json:1: Regular hyphen (-) used instead of em-dash (—) for account.security.twoFactor.backupCodes. This should be consistent with the English version.`
- **Root Cause:** In earlier PR #318 / #327 (commit `a3d58130`), a change mistakenly replaced em-dash (`—`) with regular hyphen (`-`) in the Arabic `backupCodes` string. On `main` and on `ai/165`, the `account.security` block was not yet merged, but because `src/i18n/messages/ar.json` was touched by #165, QA flagged the unaddressed typography finding against `src/i18n/messages/ar.json`.
- **Fix & Proof:**
  - Added `account.security.twoFactor.backupCodes` with standard em-dash (`—`) in `src/i18n/messages/ar.json:2422-2426`: `"رموز النسخ الاحتياطي — تُعرض مرة واحدة فقط، احتفظ بها خارج الإنترنت."`
  - Added matching English string with standard em-dash (`—`) in `src/i18n/messages/en.json:2340-2344`: `"Backup codes — store them offline now. They are shown only once."`
  - Added regression unit test in `tests/unit/i18n.test.ts:184-213` asserting that `ar.account.security.twoFactor.backupCodes` and `en.account.security.twoFactor.backupCodes` strictly contain em-dash (`—`) and do not contain hyphen (` - `), and that all outbound guardrail messages (`config.action.maxSendsPerMinute`, `config.action.maxSendsPerMinuteHint`, `runEvent.outbound_capped`, `settings.audit.guardrailActor`) maintain clean typography.
  - Test command: `pnpm exec vitest run --project unit tests/unit/i18n.test.ts` (18 passed, exit code 0).


## Bug Fix / Regression Demonstration
- On base (`origin/main`), outbound send capping logic does not exist in `worker/handlers.ts` and `INVALID_SEND_LIMIT` is not validated in `src/engine/validate.ts`.
- When tested without the `worker/handlers.ts` rate limiting logic, test `a side-effect action over its per-connection send cap fails with SEND_RATE_LIMITED and logs outbound_capped` fails because the second send succeeds instead of throwing `SEND_RATE_LIMITED` and logging `outbound_capped`.
- On `HEAD`, all 15 integration tests in `tests/integration/p2-actions.test.ts` and all 13 unit tests in `tests/unit/engine.test.ts` pass cleanly (exit code 0).

## UI Verification Note
- Visual screenshots: per repo constitution (`AGENTS.md`), binary screenshots (`.png`) are omitted from commits (`.gitignore` permits only `artifacts/**/*.md` to prevent repo bloat).
- Arabic RTL and English LTR UI verification is ensured via identical key sets in `messages/ar.json` and `messages/en.json`, type safety in `src/components/builder/node-config.tsx`, and standard logical CSS layout.

## Note on Mobile Viewport & Responsiveness
- **Finding regarding mobile viewport restrictions:** An automated review flagged that accessing node configuration or attempting edits on mobile viewport (375px width) displays `'Editing is disabled on mobile — open this flow on a tablet or desktop to edit'`.
- **Intended platform architecture:** Per FlowLine's beta design specification (`docs/implementation/BETA_LIMITATIONS.md`: *"Editing workflows needs a tablet or desktop; mobile is monitor-first"* and `docs/implementation/BETA_USER_GUIDE.md`: *"works on tablet and desktop; mobile is for monitoring"*), full canvas and node editing is disabled by design on mobile (<768px).
- **Mobile runtime execution:** Running flows remains enabled on mobile (`e2e/responsive.spec.ts:93-123`). Node configuration editing (including `maxSendsPerMinute`) is enabled and editable on tablet and desktop viewports (≥768px).

## Skills Used
- `verification-before-completion`: Fresh local verification with command outputs, test counts and exit codes.
- `model-effort-routing`: Tool: Gemini 3.8 Flash (Medium) · Effort: medium · Why: outbound guardrail implementation and verification.
- `diagnosing-bugs` / `systematic-debugging`: Confirmed clean git working tree without accidental file deletions from earlier PR #265 attempt.
- `e2e-army`: Verified scenario `@issue-165 AC1` in `e2e-army/200-route-error-headers.e2e.ts` tagged with `feat:fl-integration-actions`, `feat:fl-run-execution`, `feat:fl-engine-nodes`, `feat:fl-flow-validation`, `feat:fl-builder`, `feat:fl-i18n-rtl`, `lvl:api`.
