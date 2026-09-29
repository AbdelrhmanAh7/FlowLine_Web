# AI hub Wave C — BUGS (tested SHA 84f2cc1)

Sources: Codex gpt-6-astra independent review (`CODEX-REVIEW.md`, read-only, 2026-09-29), merged browser gate (`../merged-faec2a3-20260929-0459/GATE.md`). Original rows are kept; remediation is appended below each.

## From the merged browser gate

| ID | Severity | Area | Summary | Status |
|---|---|---|---|---|
| GATE-01 | P1 | Secret forms | Five SecretInput fields had no ref → typed secrets never submitted (setup code/email key/password, admin-panel secrets, workspace OAuth secret) | FIXED in `8b7c803` + unit guard; admin-panel E2E 3/3 |
| GATE-02 | P3 (test) | WebKit infra | admin-panel.spec imported product code not copied into the WebKit container | FIXED in `84f2cc1` (independent RFC 6238 emulator) |

## From the Codex review

| ID | Severity | Area | File:line | Concrete failure scenario | Minimal fix | Verified | Status |
|---|---|---|---|---|---|---|---|
| **CXH-01** | **P1** | OAuth revocation | `src/server/connections.ts:479`, `:496`, `:261`; `src/server/platform-secrets.ts:258` | A callback completes its final app check, then platform revocation commits and finishes its connection-expiry sweep. The callback subsequently inserts an active connection. Runtime validation skips platform issuing-app checks, so its unexpired access token remains usable despite revocation. | Finalize the callback under transactional app-status/epoch fencing. Check the platform issuing app during runtime credential access instead of relying solely on the expiry sweep. | **Yes — code** | OPEN |
| **CXH-02** | **P1** | Sign-in credential cache | `src/server/auth-dispatch.ts:32`, `:45`, `:77`; `src/lib/auth.ts:110`; `src/server/platform-secrets.ts:272` | Cache a Google sign-in instance at revision 1. Revoke, clear, and configure a different app: the new row starts at revision 1. Its cache key collides with the original, so `authFor` returns the instance containing the old client ID and secret. Newly initiated sign-ins can continue using cleared credentials until eviction or restart. | Include immutable app identity and revision in instance keys and sign-in attempt bindings; alternatively preserve a monotonic identity/version through clearing. | **Yes — code** | OPEN |
| **CXH-03** | **P1** | Recovery and duplicate billing | `src/ai/hub/execute.ts:153`, `:236`, `:259`; `src/server/usage.ts:57`, `:98`; `worker/handlers.ts:209` | A worker dies after an AI charge settles but before the step becomes terminal. Recovery reruns the AI node with the same request ID and resets its attempt counter. `reserveUsage` returns `reserved:false`, which the executor ignores, and another provider request is sent. Settlement cannot update the already-settled event, leaving the additional possible charge unrecorded and unreserved. | Persist attempt identity across recovery. Reuse a durably stored result, or allocate and reserve a distinct attempt before another send. Never treat an existing ledger key as authorization for a fresh request. | **Yes — code** | OPEN |
| **CXH-04** | **P1** | Agent spending limit | `worker/agent-runner.ts:420`, `:428`, `:437`; `src/ai/hub/execute.ts:78`, `:250`, `:304` | An agent checks its limit against one primary-route estimate. The hub can charge unsuccessful attempts and a fallback, but returns only the answering attempt’s cost. The agent omits earlier charges. Unknown estimates and returned unknown costs also become zero, allowing execution beyond an agent limit even when a workspace cap does not stop it. | Enforce the agent-run cap inside every hub reservation across retries and fallback routes. Aggregate its ledger charges and outstanding reservations; refuse unbounded costs when an agent cap applies. | **Yes — code** | OPEN |
| **CXH-05** | **P1** | Encryption compatibility | `src/server/crypto.ts:132`, `:169`, `:201`; `worker/runner.ts:207`; `src/server/runs.ts:120` | Run inputs may be up to 256 KiB, but the shared crypto format imposes a 64 KiB encoded-ciphertext limit. A 50,000-byte ASCII step payload already throws `Secret is too large` during persistence. The parser also rejects sufficiently large existing legacy ciphertext, breaking recovery/rewrap of previously accepted data. | Separate credential-size limits from run-data limits, accounting for combined input/output, UTF-8 and encoding expansion. Preserve readability of existing permitted records. | **Yes — probe + code** | OPEN |
| **CXH-06** | **P1** | Key rotation / social tokens | `src/server/rewrap.ts:118`; `src/server/auth-token-adapter.ts:36`, `:52` | Rotate the workspace KEK and run rewrap. Account rows whose tokens already use v2 envelopes are skipped; the encryption adapter also leaves envelopes unchanged. Rewrap can report no failures while those tokens still require the old key. Retiring that key makes token decryption fail and return null. | Rewrap every encrypted account-token field using its account/user/provider/field AAD. Fence updates against concurrent token changes and report remaining old-key envelopes before key retirement. | **Yes — code** | OPEN |
| **CXH-07** | P2 | Reservation accuracy | `src/ai/hub/execute.ts:84`; `src/ai/hub/protocols/openai-chat.ts:37`; `worker/agent-runner.ts:453` | A previous assistant turn contains large tool-call arguments. The next request serializes those arguments, but the reservation counts only message `content`, tools and schema. Consequently, substantial billable prompt content is absent from the supposed maximum reservation. | Account for the complete protocol request, including historical tool calls and arguments, using a conservative token bound or supported token-count operation. Use the same calculation for routing and agent limits. | **Yes — code** | OPEN |
| **CXH-08** | P2 | Unknown usage becomes zero | `src/ai/hub/protocols/openai-chat.ts:65`; `src/ai/hub/execute.ts:269`, `:275` | A successful response contains `usage:{}` or incomplete token fields. Missing values become zero, the response is considered usage-reported, and settlement replaces the reservation with a zero or understated cost. The focused empty-usage probe returned reported usage and estimated cost zero. | Validate required usage fields. Preserve unknown/partial usage explicitly and retain the reservation when a reliable cost cannot be established. Apply this consistently across adapters. | **Yes — probe + code** | OPEN |
| **CXH-09** | P2 | FREE_ONLY price integrity | `src/ai/hub/protocols/listings.ts:17`; `src/ai/hub/pricing.ts:39`; `src/ai/hub/routing.ts:208` | Listing prices `prompt:""` and `completion:" "` pass through `Number()` as zero. They become a sourced catalogue quote accepted as verified free, making the model eligible for FREE_ONLY and zero-cost reservation despite the response not supplying valid prices. | Require a nonempty, valid numeric representation before conversion. Treat malformed prices as unknown and ineligible for verified-free routing. | **Yes — probe + code** | OPEN |
| **CXH-10** | P2 | Workspace OAuth concurrency | `src/server/oauth-apps.ts:232`, `:248`, `:267`, `:283` | Two rotations read revision 1 before either acquires the lock. After the first commits revision 2, the second acquires the lock but checks its stale object, also passes expected revision 1, and overwrites the first rotation with revision 2. The new secret and grace history are lost. Deletion has the same stale-revision pattern. | Read the full authoritative row under the lock, or use a conditional revision/status update and require one returned row. | **Yes — code** | OPEN |
| **CXH-11** | P2 | False credential verification | `src/ai/hub/protocols/index.ts:114`; `src/ai/hub/connections.ts:196`; `docs/ai/PROVIDERS.md:48`, `:51` | `canCheckKey` treats every non-static listing endpoint as an authentication check. The repository explicitly documents DeepInfra and Vercel listings as public. An invalid key can therefore accompany a successful public listing and produce CONNECTED / “connection works” feedback without authenticated proof. | Separate public discovery from authenticated credential checks. Use an authenticated nonbillable endpoint where supported; otherwise report the key as unverified until an explicitly disclosed inference succeeds. | **Yes — code and repository endpoint contract; no live check** | OPEN |
| **CXH-12** | P2 | Stale health/catalogue writes | `src/ai/hub/connections.ts:198`, `:270`; `src/ai/hub/discovery.ts:29`; `src/ai/hub/execute.ts:299` | Start a metadata test, disconnect while its network request is pending, then release the response. The unfenced completion writes CONNECTED over REVOKED. Similarly, an old-key discovery response can overwrite catalogue data after rotation. Secrets remain wiped in the disconnect case, but the displayed state is false and subsequent execution fails. | Condition post-network health and catalogue writes on the captured credential version and allowed status. Commit catalogue changes with that fence; discard stale results. | **Yes — code** | OPEN |
| **CXH-13** | P2 | FALLBACK availability | `src/ai/hub/routing.ts:56`, `:249`; `worker/handlers.ts:196` | A pinned primary model is marked removed by discovery, while an approved fallback is available. Initial route resolution throws `AI_MODEL_REMOVED` before the fallback planner runs, although that error is explicitly fallback-eligible. The run fails without trying the fallback. | Let planning handle eligible primary-resolution failures while preserving the immediate refusal rules for authorization, missing/revoked connections, safety, cancellation and budget. | **Yes — code** | OPEN |
| **CXH-14** | P2 | OAuth transient failures | `src/server/oauth-client.ts:78`; `src/server/connections.ts:326` | A refresh endpoint returns HTTP 429 with a JSON error such as `rate_limited`. It is classified as a grant failure, causing a valid connection to expire and dependent flows to pause. A temporary provider limit becomes a reconnect requirement. | Classify 429 and other transient statuses separately. Expire grants only for recognized permanent grant failures; preserve credentials on temporary failures. | **Yes — code** | OPEN |
| **CXH-15** | P2 | Stream and tool-call integrity | `src/ai/hub/protocols/openai-chat.ts:159`, `:191`; `src/ai/hub/protocols/shared.ts:16` | A stream emits valid content, then a malformed JSON data chunk, then a valid finish event. The malformed chunk is ignored and the surviving text is returned as success. Separately, incomplete tool-argument JSON silently becomes `{}`, losing the distinction between valid empty arguments and corrupt output. | Reject malformed protocol data chunks, while retaining support for documented keepalives. Reject invalid tool JSON instead of manufacturing empty arguments; discard incomplete streamed results. | **Yes — probes + code** | OPEN |
| **CXH-16** | P2 | Provider error disclosure | `src/ai/hub/protocols/shared.ts:175`, `:207`, `:223` | A provider returns HTTP 400 with a lowercase alphanumeric secret canary in `error.code`. The regex considers it safe and inserts it verbatim into the user-facing error. A synthetic probe confirmed this reflection. Arbitrary safety-reason text is also copied into errors. | Render allowlisted identifiers through fixed messages. Omit unknown provider codes/reasons and scrub submitted credentials before any error is returned or persisted. | **Yes — probe + code** | OPEN |

## Remediation (implementation lead, 2026-09-29): pending Codex retest

The original rows above are unchanged, and their status column still reads OPEN. That status is superseded by this
table.

| ID | Fix | Regression test (fails before the fix unless noted) | Status |
|---|---|---|---|
| CXH-01 | OAuth callback finalised in one transaction that SHARE-locks the issuing app (status, client id, epoch) and re-checks membership. New `connection.oauth_app_epoch`, and a runtime issuing-app check for platform apps. Commit `15c4f57` | `sec-wavec-fixes` (PostgreSQL interleaving, runtime check) | FIXED, retest pending |
| CXH-02 | Auth instance and sign-in attempt keys carry the `platform_secret` id + revision (`signin_attempt.secret_id`); a mismatched callback is refused | `sec-wavec-fixes` | FIXED, retest pending |
| CXH-05 | Per-purpose crypto caps: credentials 64 KiB; step data 8 MiB write / 40 MiB read; legacy v1 32 MiB read | `crypto-limits` (unit, includes the 50 000-byte probe) + integration run with 60 000 three-byte characters | FIXED, retest pending |
| CXH-06 | Rewrap covers every envelope, including account tokens, with compare-and-swap writes; per-table `remaining` count; rotation complete only at 0 remaining | `sec-wavec-fixes` + `sec-upgrade` (phase-4 → 0015 + rewrap + key retirement) | FIXED, retest pending |
| CXH-10 | Authoritative row read `FOR UPDATE` + conditional revision updates (409 `REVISION_CONFLICT`) | `sec-wavec-fixes` (two rotations; rotation vs delete) | FIXED, retest pending |
| CXH-14 | Refresh failures classified transient / grant / client_auth / unavailable; transient keeps credentials, honours Retry-After, pauses nothing. **Limitation:** the step fails as retryable; there is no in-step retry yet | `oauth-client` (contract) + `sec-wavec-fixes` (429, 500, invalid_grant) | FIXED (no in-step retry), retest pending |
| CXH-03 | Attempt numbering continues across recovery; every send reserves a new key (an existing key never authorises a send); abandoned reservations are settled as `interrupted` + possible charge. New index `ai_attempt(workspace_id, request_id)` in migration 0016. Commit `9d39a0c`. **Limitation:** no stored-result reuse (answer text isn't stored), so a recovered request is re-sent and both charges are ledgered | `ai-review-wavec` (integration: real rewind + recovery; concurrent same request id on PostgreSQL) | FIXED (no result reuse), retest pending |
| CXH-04 | The agent cap is enforced inside every locked reservation (retries, fallback, tool steps); unknown cost under a cap is refused unless `allowUnknownCost` is set; agent spend = ledger total | `ai-review-wavec` (integration ×2) | FIXED, retest pending |
| CXH-07 | `requestInputChars` sizes the full serialised request, used by the executor, routing and agent limits | `ai-review-wavec` (integration + unit) | FIXED, retest pending |
| CXH-08 | Core token counts are required in all adapters; missing or inconsistent counts mean unknown usage, the reservation is kept, and null tokens are written | `ai-review-wavec` (contract, every adapter + integration) | FIXED, retest pending |
| CXH-09 | Strict numeric listing prices; `validPrice` enforced wherever a verified-zero decision is made. **Note:** malformed prices stored before this fix read as 0 until the next discovery refresh | `ai-review-wavec` (contract) | FIXED, retest pending |
| CXH-11 | Registry `listingAuth` per provider (DeepInfra/Vercel public, OpenRouter uses its authenticated `/key`); unverified keys are labelled "Key not verified" (ar + en) | `ai-review-wavec` (integration ×2 + unit) | FIXED, retest pending |
| CXH-12 | `stillCurrent` / `fencedWrite` guard every write after a network call (cred_version + not revoked) | `ai-review-wavec` (integration ×2) | FIXED, retest pending |
| CXH-13 | A removed or unlisted primary is deferred to the planner under FALLBACK / FREE_ONLY / LOW_COST; MANUAL and auth/revoked/safety/cancel/budget still refuse immediately | `ai-review-wavec` (integration + guard) | FIXED, retest pending |
| CXH-15 | Malformed `data:` chunks are rejected (keep-alives allowed); strict tool-argument JSON; a Chat stream needs a finish reason | `ai-review-wavec` (contract, all five adapters) | FIXED, retest pending |
| CXH-16 | Allowlisted error ids and safety vocabulary only; the submitted key is scrubbed from every hub error | `ai-review-wavec` (contract) | FIXED, retest pending |

**Gates after merging both fix branches + 0016 (product code not yet browser-gated):**
- lint and typecheck: clean.
- Unit 245, contract 465, integration 430.
- 17 migrations apply on an empty database.

## Codex retest of `cceeb5d` (`CODEX-RETEST-cceeb5d.md`)
**FIXED (10):** CXH-02, 03, 05, 06, 07, 08, 10, 14, 15, 16. Limitations accepted: CXH-03 (no result reuse) and
CXH-14 (no in-step retry). Correction: Retry-After is exposed, not scheduled, and the step handler drops the retry
fields.

**PARTIALLY FIXED (6), reopened:**
- **CXH-01:** clearing and recreating a platform app resets the epoch; an in-flight callback can pass.
- **CXH-04:** the workspace `allowUnknownCost` setting bypasses an agent's hard cap.
- **CXH-09:** stored false-zero prices survive, and a malformed refresh keeps the old zero.
- **CXH-11:** pre-fix public-listing rows stay `keyVerified`.
- **CXH-12:** shared catalogue writes are outside the fence.
- **CXH-13:** the index-based primary identity after filtering (see CXH-19).

**NEW:**

| ID | Severity | Area | Summary | Status |
|---|---|---|---|---|
| CXH-17 | P2 | Recovery | A live attempt older than 60 s is declared abandoned without checking ownership or lease; its later success can't settle | OPEN |
| CXH-18 | P2 | Agent cap | A resumed agent tool's reservation is counted twice (precheck + completion) | OPEN |
| CXH-19 | P2 | FALLBACK | After a removed primary is filtered out, the first fallback inherits primary-refusal semantics, so an allowed second fallback is never tried | OPEN |

## Round 2 remediation (merged; pending Codex retest)

| ID | Fix (commit) | Status |
|---|---|---|
| CXH-01 | Immutable platform app identity (`platform_secret` row id) in oauth_state, connection provenance, callback fence, runtime check and refresh; provable-only legacy backfill (`7dd5192`, migration 0017) | FIXED, retest pending |
| CXH-04 | An agent cap holds under the workspace unknown-cost override; agent-level opt-in (default off, labelled); guard in `reserveUsage` (`8f9d8cc`) | FIXED, retest pending |
| CXH-09 | `pricingInvalid` clears stored prices; data step invalidates listing-sourced false zeros (migration 0019) | FIXED, retest pending |
| CXH-11 | `key_check_method` + `key_checked_cred_version`; data step invalidates pre-fix public-listing verification (0018/0019) | FIXED, retest pending |
| CXH-12 | Shared catalogue writes inside the fenced transaction + `observed_at` condition | FIXED, retest pending |
| CXH-13 / CXH-19 | Explicit `role: primary\|fallback` in planned routes | FIXED, retest pending |
| CXH-17 | Abandonment fenced on the owning run/agent-run lease (`usage_event.holder`); late success reconciles | FIXED, retest pending |
| CXH-18 | Resumed tool reservations decided by the locked `reserveUsage`; spend read from the ledger | FIXED, retest pending |
| CXH-14 (wiring) | `NodeError` keeps `retryable` / `retryAfterMs`; `integrationAction` retries `CONNECTION_UNAVAILABLE` within `maxAttempts`, honouring Retry-After ≤ 60 s | FIXED, retest pending |

**Merge:** the round-2 migrations were renumbered to 0017 (CXH-01), 0018 (hub columns, regenerated DDL identical to the
original) and 0019 (hub data steps, verbatim).

**Gates on the merge:**
- lint and typecheck clean; unit 247, contract 465, integration **453** (full suite passed twice in a row).

**INTERMITTENT-01 (open, cause unknown):**
- **Failures seen:**
  1. The first full integration run on the merge failed 1 test: `ai-review-wavec` CXH-03 "a worker that died…".
  2. The first standalone re-run of that file then failed 2: CXH-04 `expected 'queued' to be 'succeeded'` at
     `ai-review-wavec.test.ts:203`, and another assertion `expected 1 to be +0`.
- **Since then:** 5 standalone runs of the file and 2 full-suite runs all passed (7 runs).
- **Ruled out:**
  - No stray workers or queued leftovers were found in the test DB.
  - Fakes use ephemeral ports, so no port cross-talk.
- **Not saved:** full logs of the two failing runs; only the extracted assertion lines were kept.
- **Hypothesis (unconfirmed):** `claimNextAgentRun` (`for update skip locked`) returned null while another
  transaction briefly held the row, so `runAgent` gave up early.
- **Kept open;** not hidden and not "fixed".

## Codex retest 2 of `f74a5a1` (`CODEX-RETEST2-f74a5a1.md`)
- **FIXED (17):** CXH-01…11, 13, 14, 15, 16, 18, 19.
- **PARTIALLY FIXED (2), reopened:**
  - **CXH-12:** omitted pricing is inherited from an unlocked earlier read, so a stale zero can overwrite a newer
    price.
  - **CXH-17:** the lease check, the abandonment settlement + placeholder, and late-success reconciliation are not
    atomic.
- **NEW:**

| ID | Severity | Area | Summary | Status |
|---|---|---|---|---|
| CXH-20 | P2 | Catalogue | Shared catalogue rows are locked in provider order inside one transaction, so concurrent refreshes with opposite orders deadlock | OPEN |

- **INTERMITTENT-01:** the mechanism (`SKIP LOCKED` null claim → the helper breaks early) is plausible, not confirmed.
  Codex recommends a bounded claim loop plus diagnostics.

## Round 3 remediation (commit `a0b92df`, merged; pending Codex retest)

| ID | Fix | Regression test | Status |
|---|---|---|---|
| CXH-12 | Omitted pricing is inherited in the upsert from the row current at update time (never an earlier unlocked read); an explicitly invalid price still clears | `ai-retest-fx3` CXH-12 ×2 | FIXED, retest pending |
| CXH-17 | Lease re-check, abandonment settlement + interrupted placeholder, and late-success reconciliation are serialized on the locked `usage_event` row | `ai-retest-fx3` CXH-17 ×3 | FIXED, retest pending |
| CXH-20 | Shared catalogue rows are written in deterministic model-id order; bounded retry on 40P01/40001 | `ai-retest-fx3` CXH-20 ×2 | FIXED, retest pending |
| INTERMITTENT-01 | `claimUntil` test helper: a null claim while the target is queued is retried (5 × 100 ms), then throws with diagnostics (row state, NOWAIT lock probe, locking sessions). Root cause still not identified | Integration suite passed 460/460 three times in a row | MITIGATED (diagnostics), cause unknown |

**Caveat, stated honestly:** the 7 new tests fail on the old product code, but only because the interleaving hooks they
use (`catalogueTestHooks`, `discoveryTestHooks.onRetry`, `recoveryTestHooks`) were introduced together with the fixes.
That is `TypeError`, not a demonstration of the original behaviour. Whether the tests exercise the scenarios is left to
the Codex retest.

**Gates:**
- lint and typecheck: clean.
- Unit 247, contract 465, integration 460 (×3).
