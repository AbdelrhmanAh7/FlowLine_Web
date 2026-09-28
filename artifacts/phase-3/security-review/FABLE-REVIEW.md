# Phase 3 security review — capability × role matrix, IDOR, XSS, CSRF, secret projections

- **Reviewer:** Claude Fable 5.1 subagent (independent of the implementing session; same vendor, not a human review).
- **Revision reviewed:** `6013a56` (branch `phase-3`), isolated worktree; landed in `d3dc3fa`.
- **Output:** `tests/integration/p3-matrix.test.ts` (73 tests). Only `next/headers` is mocked; sessions are real
  better-auth session rows resolved by `auth.api.getSession`.

## Results

| Command | Result |
|---|---|
| `vitest --project integration tests/integration/p3-matrix.test.ts` (at review) | 72 passed, 1 failed (the intentional SR-01 defect test) |
| same, after the SR-01 fix (`d3dc3fa`) | 73 passed |
| `pnpm typecheck`, `pnpm lint` | pass |

### Capability → route matrix (owner / editor / viewer / non-member) — all match `src/lib/permissions.ts`

| Capability | Routes exercised | O | E | V | Non-member |
|---|---|---|---|---|---|
| flow.view | GET flows/[fid], versions, versions/[vid], runs, publish, copilot; runs/[rid], rerun-preview; ws flows/runs/overview/approvals/files | 200 | 200 | 200 | 404 |
| flow.edit | PUT flows/[fid]; POST ws/flows; restore (draft); copilot propose/decide; ws/files upload | 2xx | 2xx | 403 | 404 |
| flow.run | POST flows/[fid]/runs; runs/[rid]/cancel; runs/[rid]/rerun (409 = run still queued, after the permission check) | 2xx/409 | same | 403 | 404 |
| flow.publish | POST/DELETE publish; restore & publish | 2xx | 2xx | 403 | 404 |
| flow.share | POST flows/[fid]/share | 201 | 201 | 403 | 404 |
| flow.delete | DELETE flows/[fid] | 200 | 200 | 403 | 404 |
| approval.decide | POST approvals/[aid]/decide | 200 | 200 | 403 | 404 |
| integration.manage | PATCH/DELETE connections/[cid] | 200 | 200 | 403 | 404 |
| integration.use | no route (SR-04) | – | – | – | – |
| knowledge.view / .manage | GET knowledge, search / POST, PATCH, DELETE | 2xx | 2xx | view only | 404 |
| agent.view / .edit / .run | GET agents…, agent-runs / POST, PUT, DELETE / start, cancel | 2xx | 2xx | view only | 404 |
| usage.view, member.view | GET usage / members, connections (implicit "viewer" default) | 200 | 200 | 200 | 404 |
| member.manage | invites GET/POST/DELETE, members PATCH/DELETE | 2xx | 403 | 403 | 404 |
| apikey.manage | api-keys GET/POST/DELETE | 2xx | 403 | 403 | 404 |
| billing.view | GET billing | 200 | 200 | 403 | 404 |
| billing.manage | checkout/change/cancel (400 BILLING_NOT_CONFIGURED after the permission check in tests), reconcile | 400/200 | 403 | 403 | 404 |
| audit.view | GET audit | 200 | 403 | 403 | 404 |
| workspace.settings | PATCH ws | 200 | 403 | 403 | 404 |
| sso.manage | PUT sso | 200 | 403 | 403 | 404 |

No 5xx anywhere in the matrix; signed-out → 401. Not covered by the matrix (same guard helper as covered routes): webhook
secret rotate, connection create (verifies credentials at the provider).

**IDOR** (workspace B's owner using A's ids, directly and under B's URLs): agents, agent runs, runs, connections,
approvals, knowledge sources, API keys, invites, members, flow versions, Copilot proposals → all 404, with DB state
verified unchanged. **Secret projections:** connection / API key / invite / SSO / audit / agent responses contain no
ciphertext, key hash, token hash, client secret, invite token or API key secret.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| SR-01 | Low | A non-UUID id on `DELETE api-keys/[kid]` and `DELETE invites/[iid]` (owner-only) reached a uuid WHERE → Postgres 22P02 → 500 | **Fixed** in `d3dc3fa` (`isUuid` → 404); regression test in the matrix file |
| SR-02 | Info | Any member can read the SSO config (no secret; `hasSecret` only) so non-owners see the real status | Intentional (settings page shows real state); kept |
| SR-03 | Info | `usage.view` / `member.view` are enforced through the default "viewer" level, not by name | Pinned by the matrix test |
| SR-04 | Info | `integration.use` has no enforcing route (private connections are enforced by ownership in `assertConnectionsUsable`) | Open — dead capability; recorded in the release report |

## Probes with no finding
- **XSS:** no `dangerouslySetInnerHTML` / `innerHTML` / `javascript:` in `src`; agent answers, citations, knowledge hits,
  source names, audit data, invite page and `sso_error` render as React text; no markdown renderer; no open redirect.
- **CSRF:** every cookie-authenticated unsafe handler goes through `route()` → `assertSameOrigin`. Exceptions are
  cookie-less or state-bound (webhooks, billing webhook, OAuth/SSO callbacks, better-auth's own handler).
- Items fixed earlier and not re-reported: SSO takeover, approval/version binding, cross-origin 307 body, upload cap,
  agent tool cost cap. Billing internals were out of scope (fixed separately, CX3-04/05).
