# Issue #252 — `fl-integrations` failing on main: the hub test is stale, not the product

**Failing assertion** (hub repo, `ops/verify/e2e-army/tests-dev/FlowLine_Web/platform-api.e2e.ts:21`, test `[fl-integrations.2]`):
`/api/integrations/catalog` is expected to list exactly the 12 SaaS providers and `cat.count` to be `12`.

**Root cause:** the catalog is computed from the registry (`src/integrations/registry.ts`). Mizano (`mizano`, #145–#148, last
change 8250808 / #208) is a deliberate, merged 13th provider in `PROVIDER_IDS`, with its own e2e-army test
(`e2e-army/148-mizano-list-overdue-invoices.e2e.ts`, which requires the catalog to list Mizano). The product behaves as designed;
the hub's expectation predates it.

**Why no product change:** removing/hiding Mizano from the catalog would undo merged work and break #148's own gate test.
The issue says "never weaken the test", so I did not touch the registry; the hub-owned test lives outside this repo and I cannot edit it.

**Needed from the owner/hub (follow-up in `nql-agents`):** update `platform-api.e2e.ts:21-22` to
`[... "linear", "mizano"]` and `count` `13` (the generic loop below it — actions non-empty, `verification.adapter`, id prefix — should be
checked against the Mizano provider too), then re-run
`ops/verify/e2e-army/run-local.sh FlowLine_Web <ref> -- --tag feat:fl-integrations`.

**In this repo:** only fixed the stale statements in `SCOPE_MATRIX.md` (P2-03, P2-07: "12 providers" → 13 incl. Mizano).
