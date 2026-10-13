# Evidence: issue #223, Mizano provider contract test (Test connection: OK, 401, unreachable, bad base URL)

Outcome: **already covered on the parent branch `ai/145`, so this branch adds no test code.** The parent (#145) built the Mizano "Test connection" check and its contract tests after it delegated this subtask. The tests are in `tests/contract/mizano-connection.test.ts` on `origin/ai/145` at head `9ae101e` (commit "Test connection calls Mizano /api/health then /api/me; test the error mapping, timeout and access rules (#145)"). They run against the fake provider server (real HTTP plus the shared error classification) and cover every case in this issue's title. The tests reach `main` when #145 merges. Adding a copy here would duplicate them, and the copy would conflict with #145.

Checked on 2026-10-13 with macOS, Node 26.10.0 and Vitest 5.0.2, against `origin/main` `9c754b2` and `origin/ai/145` `9ae101e`. An evidence file cannot name the commit that contains it, so the PR head SHA is on the PR.

## The brief and the parent's final interface
The issue body is cut off on GitHub ("returns `{ accountId: <URL(baseUrl).host>, label: "Miza`"). It describes a draft interface in which `identity()` calls only `GET /api/health` and derives the account from the base URL host. The parent then settled on a different design: `identity()` calls `GET /api/health` (a 200 alone is not trusted; the body must report a healthy status), then `GET /api/me`, and returns `{ accountId: me.id, label: me.workspaceName }`. It does this because the health probe alone does not prove the key (`src/integrations/providers/mizano.ts` on `ai/145`). A test written to the draft interface would fail against the parent's real provider. So the parent's tests are the authoritative contract, and this issue's acceptance criteria are checked against them below.

## Acceptance criteria (as met on `ai/145` `9ae101e`, `tests/contract/mizano-connection.test.ts`)
| Case | Where | Result |
|---|---|---|
| OK: provider `mizano`, `api_key` credentials `{ token, settings: { baseUrl } }`; `GET /api/health` with the key as `Bearer` | line 31: requests are `GET /api/health` then `GET /api/me`, and both carry the scheme `bearer`; identity is `{ accountId: "mizano-ws-a", label: "Alice A Mizano" }`. Line 65: `runConnectionTest` returns the label | Pass |
| 401 (wrong key) | line 39: `identity()` throws `ProviderError` of kind `auth` with status 401. Line 69: `runConnectionTest` gives 400 `AUTHENTICATION_FAILED` with the fixed text "Invalid API key" | Pass |
| Unreachable | line 75: a timeout on `/api/health` gives 502 `PROVIDER_UNREACHABLE` within the deadline. Line 83: a dropped connection gives 502 `PROVIDER_UNREACHABLE` | Pass |
| Bad base URL | line 44: an `http://` origin is refused as `client` before any request is sent (the fake server records none). Line 95: a private-network origin (`https://10.0.0.5`) gives 400 `EGRESS_BLOCKED` and is never sent | Pass |
| Extra, on the parent | line 49: a failing health check stops before `/api/me`. Line 55: an unhealthy, empty, HTML or null 200 health body is not trusted. Line 88: a 500 gives 502 `PROVIDER_ERROR` without echoing the provider's text. Line 101 onward: `testError` maps each error kind | Pass |

`tests/contract/helpers.ts` needs no change. The parent's tests use its existing `startFake`, `makeCtx`, `provider` and `expectProviderError`.

## Commands
The tree was `ai/145`'s 17 changed files, checked out temporarily into this worktree and then restored. The fake provider server binds a local port, so the run needs the sandbox off.
- `FLOWLINE_ENV=test nice -n 10 pnpm exec vitest run tests/contract/mizano-connection.test.ts tests/contract/mizano.test.ts --maxWorkers=2` gave `Test Files  2 passed (2)`, `Tests  40 passed (40)`.

On this branch, which is identical to `origin/main`:
- `nice -n 10 pnpm exec vitest run tests/contract/mizano.test.ts --maxWorkers=2` gave `Tests  17 passed (17)`.
- `pnpm type-check` and `pnpm lint` were not run, because this branch changes no code (this Markdown file only).

E2E: not needed. This change is evidence-only, with no product code and no user-facing flow. The parent covers the user flow in `e2e-army/145-mizano-connection-test.e2e.ts` on `ai/145`.
