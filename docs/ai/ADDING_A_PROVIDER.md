# Adding an AI provider

Adding a provider is mostly data. You fill in a registry entry, reuse one of the five protocols, and add contract
tests. Read `docs/ai/PROVIDERS.md` first.

## 0. Research first (no guessing)

Record the provider in the research log (`artifacts/ai-hub/research/`), from **official** sources only, with the
check date. The log needs:

- status;
- base URL and paths;
- auth header;
- model list and pagination;
- streaming, tools and structured output;
- usage fields, including cache and reasoning tokens, and whether they overlap;
- the error table, including the out-of-balance signal and Retry-After;
- pricing and free-tier type;
- data-training terms;
- BYOK and credential-sharing clauses;
- eligibility.

Anything you can't confirm is **UNKNOWN** and stays unknown in code.

## 1. Registry entry (`src/ai/hub/registry.ts`)

- **`status: "IMPLEMENTED"`, `verdict`, `verdictEvidence`.** Quote the clause that decides it.
  - If the terms forbid use for third parties, the verdict is `UNSUITABLE` with no base URL, hosts or protocols. It
    stays listed.
  - Deferred scope uses `DEFERRED`.
- **`baseUrl` and `allowedHosts`:** exact documented hosts only. `{field}` placeholders are allowed, but only for
  `connectionFields` whose `pattern` is an anchored regex that can't express a host or path separator (see Alibaba's
  `workspaceId` / `region`).
- **`auth`:** `bearer`, `x-api-key` or `x-goog-api-key`. The key is never put in a URL. `staticHeaders` holds fixed
  headers such as `anthropic-version`.
- **`protocols`, `defaultProtocol`, `paths`:** pick an existing protocol. If the provider offers several equivalent
  ones, add a `protocol` connection field with `options`.
- **`maxTokensParam`** (OpenAI-compatible only): `max_completion_tokens` for OpenAI; `max_tokens` for the others,
  unless their docs say otherwise.
- **`discovery`:** one of the implemented methods, with `discoveryPath` / `discoveryFromOrigin`.
  - With no list endpoint, use `static-catalogue` and add the models to `catalogue.ts` with `static: true`. The key
    then can't be checked without an inference; the UI says so.
  - Set `listingIsPublic: true` only when the docs say the list is the public catalogue, not per credential.
  - **`listingAuth`** (required with a list endpoint): `"key-required"` only when the docs say the list needs the key;
    `"public"` when they say it doesn't; `"unverified"` when the sources conflict. Only `"key-required"` counts as a
    key check. If the provider documents an authenticated, non-billable key endpoint, set **`keyCheckPath`** (e.g.
    OpenRouter `/key`); otherwise the key stays **unverified** until a disclosed paid test succeeds.
- **`capabilityFloor`:** only documented provider-wide **UNSUPPORTED** facts (e.g. "no json_schema"). SUPPORTED comes
  per model from the listing or the catalogue.
- **Plan and privacy fields:**
  - `planWarning`, plus `requiresPlanAttestation` if coding or subscription keys exist that the provider restricts.
  - `freeTier` (none / permanent_zero_price / limited_free_tier / trial_credits / monthly_credit / unknown).
  - `privacy.training` (no / yes / depends / unknown).
  - `termsNotes` for clauses that need legal review.
- **`sources`, `termsUrl`, `verifiedAt`:** every URL you relied on.

## 2. Protocol quirks (`src/ai/hub/protocols/`)

Most providers need no new code. Add quirks where they belong:

- **Error mapping:** `shared.ts` `mapProviderError` holds the per-provider codes (`QUOTA_CODES`, `PLAN_CODES`,
  `AUTH_CODES`, …).
  - Out-of-balance is never retryable.
  - Provider error text is never passed through.
- **Usage fields:** `normaliseChatUsage` (OpenAI-compatible) or the protocol's own normaliser. Map to
  **non-overlapping** fields, and leave unreported fields `null`.
- **Provider-reported cost:** only where the unit is documented, as micro-USD.
- **Stream options:** only if documented (`STREAM_USAGE_OPTION` in `openai-chat.ts`).

A genuinely new protocol needs `build`, `parse`, `stream` (SSE accumulator), `endpoint`, and a listing parser. Add it
to `ADAPTERS` and `IMPLEMENTED_PROTOCOLS` in `protocols/index.ts`, and to the `Protocol` union in `registry.ts`.

## 3. Prices (`src/ai/hub/catalogue.ts`)

- Only from the official pricing page (or a documented list API with a documented unit), in the documented currency,
  with `sourceUrl` and `verifiedAt`.
- Set `idSource: "display-name"` when the API id isn't printed on the source.
- `zeroPriced: true` only when the page lists the model as free.
- Bump `CATALOGUE_VERSION` when you edit prices.

## 4. Tests (all required)

- **Test double (`e2e/fakes/ai-protocols.ts`):**
  - The provider's documented base path must be answered: OpenAI-compatible chat is delegated automatically; custom
    list shapes go in `listModels`.
  - If model ids come from its own list, add the provider to `OWN_MODEL_IDS`.
- **`tests/contract/ai-adapters.test.ts`:** add a `CASES` row (the "covers every implemented adapter" test fails
  without one). The row runs discovery and pagination, request/response, streaming, tool calls, structured output,
  schema rejection, invalid key, 429/5xx/timeout, removed model and cut streams. Add the provider's quirks under
  "provider-specific quirks".
- **`tests/contract/ai-protocols.test.ts`:** add rows to the error-quirk table from the research.
- **`tests/unit/ai-hub-wave-b.test.ts`:** catalogue provenance checks run automatically.
- **Integration:** add a row to "every protocol end-to-end" if the provider adds a new protocol or connection field.

## 5. Why hand-written clients, not vendor SDKs

Every byte goes through `safeFetch`:

- public addresses only, with DNS pinned at connect time;
- size caps and timeouts;
- no redirects, so credentials are never forwarded;
- the per-provider host allowlist.

The tests exercise the same code as production. Vendor SDKs would bypass all of this.

## 6. Going live

Contract verification is not a live claim.

- `LIVE_VERIFIED` is a reserved per-connection verification value, not an automatic inference-test result. Current
  code creates connections as IMPLEMENTED/CONTRACT_VERIFIED and updates key proof after a successful test; it has
  no automatic promotion to LIVE_VERIFIED. Any future promotion needs an authorized real call and evidence under
  `artifacts/ai-hub/live/` (an intended output directory, not current live proof).
- Until then, the UI shows "Contract-tested (not live-verified)".
