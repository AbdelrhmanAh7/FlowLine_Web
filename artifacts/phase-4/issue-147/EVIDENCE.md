# Issue #147 — Mizano steps "Create customer" and "Create draft quote"

Candidate head when verified: `e7d96208` (branch `ai/147`, PR #219). The provider code landed on `main` with
subtask #239 (PR #246); this PR carries the fake Mizano API, the over-the-wire contract proof and the catalog guard.

Live calls to Mizano wait on the scoped API key task (MZ G5), so every check below is against a mocked Mizano API.

## AC1 — both steps appear in the builder under Mizano

- Actions registered: `src/integrations/providers/mizano.ts:129` (`mizano.create_customer`) and `:175`
  (`mizano.create_draft_quote`), each with an input schema (`name, company, email, phone, taxId?` and
  `customerId, currency, lines[{item, qty, unitPrice, taxRate}]` as decimal strings).
- The integrations page and the builder's node config resolve them through `listProviders()` →
  `src/i18n/integration-text.ts:31-37`; the builder lists `provider.actions` (`src/components/builder/node-config.tsx:534`).
- Catalog text in Arabic and English: `src/i18n/messages/en.json:1280`, `:1284`; `src/i18n/messages/ar.json:1328`, `:1332`.
- Test: `tests/unit/i18n-content-text.test.ts` (loop over `listProviders()` asserts, for every action,
  `has()` on **both** catalogues for title and description, plus the Arabic and English values).
- E2E: `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` (`@issue-147 AC1`, tags
  `feat:fl-integrations`, `feat:fl-integration-actions`) opens the workspace Integrations page and asserts both
  action names are visible.

## AC2 — re-running the same run does not create a second customer/quote

- The provider sends `Idempotency-Key: ctx.idempotencyKey` on both writes (`mizano.ts:155-162`, `:209-216`); the engine
  derives the key from the run id + node path and, because both actions are `sideEffect: "non_idempotent"`, it does not
  retry blindly after an unknown outcome (`worker/handlers.ts:410-429`).
- Over the wire, against the fake Mizano API: `tests/contract/mizano-http.test.ts` drives the real adapter
  (`createProviderHttp`) through `e2e/fakes/provider-server.ts`, which replays the stored record for an
  `Idempotency-Key` it has already seen for that path:
  - exact payload asserted (`req.body` equals the input; `taxId` omitted when absent),
  - header equals the run's key,
  - a second execution of the same run + node returns the identical record and leaves **one** customer / **one** quote,
  - a different run gets a new key and therefore a second record.
- In-process proof: `tests/contract/mizano.test.ts` ("… dedupes on Idempotency-Key") and
  `tests/contract/mizano-fake.test.ts` (handler contract).

## AC3 — integration test against a mocked Mizano API

- `e2e/fakes/provider-server.ts` (path prefix `/mizano`): `GET /api/health`, `GET /api/me`, `POST /api/customers`,
  `POST /api/quotes` (400 without `Idempotency-Key`; 201 insert; 200 replay for a repeated key), plus
  `GET /__fake/state/mizano` → `{ customers, quotes }`.
- Error path: `tests/contract/mizano.test.ts` (400 / 500) asserts the step fails with a clear message
  (`/Mizano: Bad Request: invalid input/`, `/Mizano error 500: Internal Server Error/`) and never logs the token.

## Commands run (fresh, on the candidate head)

```
pnpm typecheck                                                                    # clean
pnpm lint                                                                         # clean
npx vitest run --project unit    tests/unit/i18n-content-text.test.ts tests/unit/i18n.test.ts          # 2 files, 57 passed
npx vitest run --project contract tests/contract/mizano.test.ts tests/contract/mizano-http.test.ts \
                                  tests/contract/mizano-fake.test.ts               # 3 files, 54 passed
```

Red-then-green evidence for the catalog guard (review finding on `mizano.ts:133`): with
`integrationCatalog.mizano.actions.create_customer.description` removed from `en.json`, the new assertion at
`tests/unit/i18n-content-text.test.ts:118` fails (`mizano.create_customer en description: expected false to be true`);
restoring the file makes the suite pass. The previous assertions passed in that state, which is why the finding recurred.
