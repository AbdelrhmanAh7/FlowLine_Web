# HubSpot contact listing and connection journey

HubSpot is the first provider in the seven-provider deferred list in `SCOPE_MATRIX.md` P4-09.
The existing provider already registered API-key connections, contact upsert/read and deal creation.
This change adds `hubspot.list_contacts` through that registry and the existing encrypted, workspace-scoped
connection framework, plus dedicated connection/worker/UI coverage. No database schema change is needed.

## Behavior

- Read one page of 1–100 contacts (default 25), selecting up to 50 property names.
- Pass the returned `nextAfter` as the next call's `after`; `null` ends pagination.
- Preserve nullable property values; validate provider responses and never follow provider paging links.
- Publish both input and output schemas in the existing catalogue API.
- Keep HubSpot's `betaScope: deferred` and `live: blocked` flags. Connecting a token or passing fake tests
  does not establish live verification. Arabic is the source of truth, with matching English keys.
- Use existing AES-256-GCM envelope encryption with row/workspace/provider binding. Flows store connection IDs.
- Strip reflected provider error text while retaining failure kind/status/Retry-After. Validate numeric portal identity.
- Keep the upsert email key consistent when additional properties include an email value.

API behavior was checked against [HubSpot's official contacts guide](https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide),
especially bounded listing, requested properties and next-record-ID pagination. This is documentation verification,
not a request to a live HubSpot account.

## Local verification

Base SHA: `e690de6d7197abcc4e905dad831721448e8525ec`. Tests ran on that base plus this change's staged tree;
the resulting commit records that tree (including this report), without claiming CI or provider certification.

- `pnpm -s lint`: PASS.
- `pnpm -s typecheck`: PASS.
- Focused HubSpot + integration translations + locale unit tests: 86 PASS across 3 files.
- `pnpm -s test --exclude tests/unit/egress.test.ts --exclude tests/unit/codex-poc-egress-redirect.test.ts --maxWorkers 1`:
  759 PASS across 68 files; PARTIAL compared with the full requested unit command. The two excluded files
  start loopback HTTP servers and were not run under the owner's no-local-server constraint.
- Contract, DB integration, Chromium E2E, live provider tests and gates: NOT RUN locally. The authored contract,
  integration and E2E tests await CI. No application/provider server or browser was started; no `.env*` file was read.

The new E2E file has no critical or cross-browser tag and is assigned to the platform spec group. It runs in the
full Chromium tier (or an explicit platform group run), not the fast tier's tagged subset. It connects through the
real dialog, checks masked/LTR credentials and honest badges, configures the action and connection in the builder,
reloads, executes through the worker, and checks persisted outputs and absence of the fake token in client data.

Integration coverage includes catalogue schemas/honesty, encrypted credentials and safe projections,
viewer/outsider denial, rejected credentials, paginated worker output with a 429 retry, cross-workspace/private
connection denial, revocation isolation, same-portal reconnect and no automatic execution after reconnect.

## Files

- `src/integrations/providers/hubspot.ts`
- `src/app/api/integrations/catalog/route.ts`
- `src/lib/catalog.ts`
- `src/i18n/messages/ar.json`, `src/i18n/messages/en.json`
- `e2e/fakes/provider-server.ts`
- `tests/unit/hubspot.test.ts`
- `tests/contract/hubspot.test.ts`
- `tests/integration/hubspot.test.ts`
- `e2e/hubspot.spec.ts`
- `scripts/gate-groups.mjs`
- This report.

The pre-existing untracked `codex-lane.log` is outside this change. No push, PR, deployment or live provider call
is part of this task.

## Follow-up coverage on the paid-pilot candidate

The earlier local partial-unit run above omitted two loopback-listener unit files. On the prepared paid-pilot
candidate, they were each run separately and passed: `tests/unit/egress.test.ts` (31 tests) and
`tests/unit/codex-poc-egress-redirect.test.ts` (1 test). The HubSpot unit file passed 31 tests and the HubSpot
contract file passed 13 tests. These are focused local results; integration DB tests, browser E2E, CI and live
HubSpot verification remain unrun. No tests were skipped or retried.
