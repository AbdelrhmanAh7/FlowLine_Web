# AI Hub Wave C — retest at `cceeb5d`

**Verdict: changes required.** Of the 16 original findings, **10 are FIXED and 6 are PARTIALLY FIXED**. Three additional P2 issues were identified.

Reviewed `84f2cc1..cceeb5d` across `src`, `worker`, `drizzle`, and `scripts`, plus every named regression test. All locations below refer to **`cceeb5d`**.

No files were modified. No servers, browsers, Docker, databases, or live providers were started or contacted. Named test suites were **inspected, not executed**. Focused in-memory probes loaded target-commit code with isolated dependencies; their results are distinguished below from database verification.

| ID | Original severity | Verdict | Notes |
|---|---|---|---|
| CXH-01 | P1 | PARTIALLY FIXED | Normal revocation race fenced; clear/recreate can reuse the platform epoch. |
| CXH-02 | P1 | FIXED | Sign-in cache and callback bindings include immutable app identity. |
| CXH-03 | P1 | FIXED | Fresh sends require fresh reservations; recovery continues attempt numbering. See new CXH-17. |
| CXH-04 | P1 | PARTIALLY FIXED | Known-cost retries are capped; unknown-cost override bypasses the agent cap. |
| CXH-05 | P1 | FIXED | Step-data limits separated from credential limits; large legacy records supported. |
| CXH-06 | P1 | FIXED | Account envelopes rewrapped with conditional writes and remaining counts. |
| CXH-07 | P2 | FIXED | Historical tool-call arguments now enter reservation sizing. |
| CXH-08 | P2 | FIXED | Missing core usage counts remain unknown; reservation retained. |
| CXH-09 | P2 | PARTIALLY FIXED | New malformed prices rejected; previously stored false-zero prices survive. |
| CXH-10 | P2 | FIXED | Revision checked against the authoritative locked row. |
| CXH-11 | P2 | PARTIALLY FIXED | Fresh public-list connections remain unverified; existing false verification survives upgrade. |
| CXH-12 | P2 | PARTIALLY FIXED | Connection writes fenced; shared catalogue writes remain outside the fence. |
| CXH-13 | P2 | PARTIALLY FIXED | Removed-primary fallback works, but filtering changes which route receives primary refusal semantics. |
| CXH-14 | P2 | FIXED | Temporary refresh failures preserve credentials and flow state. |
| CXH-15 | P2 | FIXED | Malformed stream JSON and incomplete tool arguments rejected. |
| CXH-16 | P2 | FIXED | Arbitrary provider identifiers/reasons no longer reflected. |

## Original findings

### CXH-01 — PARTIALLY FIXED

`src/server/connections.ts:523` finalizes connections transactionally, using the app SHARE lock before persistence. Runtime access now checks the platform app at `:282`. These changes close the ordinary revoke-versus-insert race.

However, platform identity remains **purpose + client ID + epoch**: `src/server/oauth-apps.ts:145` does not compare the platform row ID. Clearing deletes that row (`src/server/platform-secrets.ts:272`), and recreating it resets the epoch to `1` (`:189`).

A callback can consume its state, exchange tokens, then pause while the owner revokes, clears, and recreates the same client ID. An original epoch-1 callback passes the replacement row’s fence; the expiry sweep has already finished. Its new connection also passes the runtime comparison. An isolated probe confirmed that the replacement row passes `appStillValid`.

**Regression coverage:** `tests/integration/sec-wavec-fixes.test.ts:125` exercises the original interleaving using PostgreSQL locks. The runtime test at `:155` exercises revoke/reconfigure, but does **not** clear and recreate the platform row.

**Remaining fix:** Carry immutable platform app identity through authorization state, connection provenance, callback fencing, and runtime validation—or preserve a generation that cannot reset after clearing.

### CXH-02 — FIXED

`src/server/auth-dispatch.ts:42` includes app ID and revision in cache keys. Callback dispatch rejects mismatched `secretId` at `:84`, and attempt persistence records it at `:111`.

**Regression coverage:** `tests/integration/sec-wavec-fixes.test.ts:193` directly exercises the original scenario: old instance cached, revoke/clear, replacement app at the same revision, then new sign-in. It checks both client ID/secret selection and rejection of an old identity-bound callback. This is substantive coverage, not merely a key-format assertion.

### CXH-03 — FIXED

`src/ai/hub/execute.ts:106` resumes numbering from persisted attempts and ledger entries. At `:328`, reservation results are checked; an existing key causes another attempt number to be allocated, never a send on that key.

**Regression coverage:** `tests/integration/ai-review-wavec.test.ts:133` rewinds a completed run into the recovery window, retains its settled charge, adds an abandoned reservation, and invokes actual worker recovery. It asserts one additional send and distinct ledger records. This simulates the crash state rather than killing a process, but reaches the original failure path. The concurrent same-request test at `:177` additionally checks distinct reservations.

**Limitation accepted — no stored-result reuse.** The original finding permitted a separately reserved attempt. Recovery may legitimately incur another charge if that charge is separately reserved and recorded. This is not exactly-once provider execution. The new abandonment-detection problem is reported separately as CXH-17.

### CXH-04 — PARTIALLY FIXED

`src/server/usage.ts:72` checks agent spending inside the locked reservation transaction, including settled charges and outstanding reservations. The agent passes its cap into the hub at `worker/agent-runner.ts:431`.

The unknown-cost path remains unsafe for a claimed hard agent cap. `src/ai/hub/execute.ts:308` skips refusal whenever workspace policy enables `allowUnknownCost`; `:336` then reserves zero for an unknown estimate. Such calls can exceed the agent’s numeric limit without appearing in its numeric spend.

**Regression coverage:** `tests/integration/ai-review-wavec.test.ts:197` exercises a charged failed attempt followed by a retry under the agent limit. At `:217`, the unknown-cost test explicitly expects execution to succeed with the override—it preserves this gap. Neither test exercises fallback charging or resumed tool reservations; both create agents with `tools: []`.

**Remaining fix:** Enforce an agent’s hard cap independently of the workspace unknown-cost override, or require an explicit agent-level choice that clearly relinquishes that guarantee. See also CXH-18.

### CXH-05 — FIXED

`src/server/crypto.ts:142` separates credential and step-data limits. Encryption uses the write limit at `:220`; parsing uses the read limit at `:270`; legacy rewrap uses the larger compatible read allowance at `:308`.

**Regression coverage:** `tests/unit/crypto-limits.test.ts:21` repeats the original 50,000-byte failure. Tests at `:29` and `:60` cover combined multibyte input/output and large legacy rewrap. `tests/integration/sec-wavec-fixes.test.ts:227` exercises actual run persistence with 60,000 three-byte characters.

**Probe:** The original payload and larger multibyte/legacy round trips passed in memory. Database persistence was not rerun.

### CXH-06 — FIXED

`src/server/rewrap.ts:107` processes existing account envelopes using field-specific account AAD. Conditional writes at `:283` prevent concurrent token updates being overwritten, with reread/retry on conflict. Remaining values are counted at `:360`; completion requires zero failures and zero remaining values at `:40`.

**Regression coverage:** `tests/integration/sec-wavec-fixes.test.ts:382` starts with encrypted account tokens, rotates, rewraps, removes the old key, and checks readability. It also checks an unreadable row prevents completion. The race test at `:417` covers concurrent token replacement.

`tests/integration/sec-upgrade.test.ts:60` additionally covers a Phase 4 database upgrade, legacy rewrap, another rotation, and old-key retirement. These tests reach the original scenario, although they were not executed during this retest.

### CXH-07 — FIXED

`src/ai/hub/pricing.ts:92` includes complete message objects, including historical tool calls and arguments. Execution and planning use this shared calculation at `src/ai/hub/execute.ts:306` and `src/ai/hub/routing.ts:226`.

**Regression coverage:** `tests/integration/ai-review-wavec.test.ts:239` compares actual ledger estimates for empty versus 20,000-character historical arguments. `tests/unit/ai-review-wavec.test.ts:23` covers arguments, tool results, and identifiers.

**Probe:** Adding 20,000 argument characters increased request sizing by 20,000. This closes the omitted-field failure; it does not establish that the existing characters-to-tokens heuristic is a strict bound for every model.

### CXH-08 — FIXED

Required input/output usage counts are validated in every adapter—for example, `src/ai/hub/protocols/openai-chat.ts:71`. Missing counts produce unknown usage. Settlement at `src/ai/hub/execute.ts:388` retains the reservation when cost cannot be established, and `:395` avoids writing invented zero token counts.

**Regression coverage:** `tests/contract/ai-review-wavec.test.ts:36` covers empty/partial usage across all five adapters. The integration case at `tests/integration/ai-review-wavec.test.ts:261` exercises the original `usage:{}` response and checks retained cost plus null tokens.

**Probe:** Empty/partial usage remained unknown across all five adapters.

### CXH-09 — PARTIALLY FIXED

`src/ai/hub/protocols/listings.ts:17` rejects blank and malformed numeric strings. The original fresh-listing probe now passes.

Previously persisted false-zero prices are not invalidated. Worse, the remediation note’s “until the next discovery refresh” is insufficient: `src/ai/hub/catalogue.ts:168` retains `existing.pricing` when the refreshed listing produces null pricing. A previously corrupted zero can therefore survive repeated malformed refreshes and remain verified-free.

**Regression coverage:** `tests/contract/ai-review-wavec.test.ts:69` and `:76` exercise fresh parsing and price resolution. They never seed a pre-fix catalogue row or refresh it.

**Probe:** New blank prices were rejected; a stored numeric zero was still accepted as verified-free.

**Remaining fix:** Invalidate affected historical listing prices and distinguish malformed authoritative pricing from an endpoint that supplies no pricing. Do not preserve a known-untrustworthy zero.

### CXH-10 — FIXED

`src/server/oauth-apps.ts:73` reads the complete active row under `FOR UPDATE`. Rotation and deletion compare revisions against that locked row, with conditional updates at `:295` and `:323`.

**Regression coverage:** `tests/integration/sec-wavec-fixes.test.ts:251` blocks two rotations on an actual PostgreSQL lock, then asserts one winner and one conflict, including preserved grace-secret history. The rotation/delete test at `:281` exercises the corresponding deletion race. Both reach the original failure conditions.

### CXH-11 — PARTIALLY FIXED

`src/ai/hub/protocols/index.ts:135` distinguishes authenticated checks from public discovery. Fresh public-list connections receive no verification timestamp; the UI displays them as unverified.

Existing rows remain falsely verified. Before the fix, successful public discovery populated `lastTestedAt`. `src/ai/hub/connections.ts:45` now interprets any CONNECTED row with that timestamp as `keyVerified: true`. Neither new migration clears those timestamps or supplies verification provenance.

**Regression coverage:** `tests/integration/ai-review-wavec.test.ts:281` correctly tests invalid keys against public listings, but creates fresh connections. The OpenRouter test at `:294` verifies the separate authenticated endpoint. Neither covers upgrade state.

**Probe:** A pre-fix CONNECTED public-list row with a timestamp still projected `keyVerified: true`.

**Remaining fix:** Invalidate historical public-list-only verification and persist verification method and credential version.

### CXH-12 — PARTIALLY FIXED

`src/ai/hub/discovery.ts:20` and `:25` correctly fence connection health and per-connection catalogue writes. The original disconnect-during-network-request scenario is addressed.

Shared catalogue writes remain outside that transaction: `src/ai/hub/discovery.ts:74` calls `syncCurated` and `storeListingMetadata` after releasing the connection lock. An old refresh can pass its fence, pause, then overwrite newer shared prices/capabilities after rotation and a newer refresh. The final upsert at `src/ai/hub/catalogue.ts:191` has no generation condition.

**Regression coverage:** `tests/integration/ai-review-wavec.test.ts:307` and `:320` delay the network response, then disconnect or rotate **before** the fence. They cover the original connection-write race but not the remaining post-fence shared-catalogue race.

**Remaining fix:** Include shared catalogue persistence in the fenced operation and prevent older observations from overwriting newer ones.

### CXH-13 — PARTIALLY FIXED

`worker/handlers.ts:197` enables deferred resolution. `src/ai/hub/routing.ts:70` marks unavailable models, and `:210` skips them during planning.

**Regression coverage:** `tests/integration/ai-review-wavec.test.ts:349` directly exercises a removed pinned primary and a working fallback through a workflow run. The guard test at `:360` checks MANUAL refusal and a revoked primary.

However, removing the primary changes the first fallback’s index to zero. Execution uses that index to distinguish primary authorization refusal from a skippable fallback refusal. Consequently, a forbidden first fallback prevents trying an allowed second fallback. See CXH-19. The tests use one fallback and do not cover this case.

### CXH-14 — FIXED

`src/server/oauth-client.ts:115` distinguishes transient statuses/codes from recognized permanent grant failures. `src/server/connections.ts:363` preserves credentials on transient failure; `:388` exposes `CONNECTION_UNAVAILABLE` with retry metadata.

**Regression coverage:** `tests/contract/oauth-client.test.ts:24` covers 429 and Retry-After; subsequent cases cover 5xx, network failure, transient codes, and permanent grants. `tests/integration/sec-wavec-fixes.test.ts:311` checks unchanged credentials, active status, unpaused flows, successful later refresh, and continued invalid-grant expiry.

**Limitation accepted — no in-step retry.** Failing the operation without expiring valid credentials resolves the original defect. However, “honours Retry-After” overstates the implementation: the delay is exposed, not automatically scheduled. `worker/handlers.ts` converts the connection error to `NodeError` without preserving its retry fields. The integration test calls credential resolution directly, not a complete failing workflow step.

### CXH-15 — FIXED

`src/ai/hub/protocols/shared.ts:26` rejects incomplete/non-object tool JSON; `:121` rejects malformed nonempty SSE payloads. Chat streams require a finish reason at `src/ai/hub/protocols/openai-chat.ts:195`.

**Regression coverage:** `tests/contract/ai-review-wavec.test.ts:92` contains the original valid-content → malformed-chunk → valid-finish sequence. Cases at `:113` cover incomplete tool JSON in normal and streamed responses. Other adapters receive malformed-stream checks at `:102`. Gemini’s newly strict tool-argument shape is not directly tested there.

**Probe:** Malformed stream JSON and incomplete tool arguments were rejected; valid `{}` remained accepted.

### CXH-16 — FIXED

`src/ai/hub/protocols/shared.ts:239` renders only allowlisted identifiers, and `:286` restricts safety reasons. Credential scrubbing wraps inference and discovery errors at `src/ai/hub/protocols/index.ts:74` and `:164`.

**Regression coverage:** `tests/contract/ai-review-wavec.test.ts:145` repeats the original lowercase canary scenario. Cases at `:156` and `:162` check safety text and direct credential scrubbing.

**Probe:** The original identifier canary and arbitrary safety text were omitted. The scrub test is helper-level coverage; it does not establish end-to-end persistence/log redaction or assert removal of the uppercase variant it constructs.

## New issues

### CXH-17 — P2 — Live attempts can be prematurely declared abandoned

**Locations:** `src/ai/hub/execute.ts:93`, `:127`; `src/server/usage.ts:127`; `src/ai/hub/transport.ts:160`.

**Scenario:** Execution A reserves and spends 90 seconds awaiting its provider. At 61 seconds, execution B starts with the same request ID. `resumeAttempts` treats A as abandoned based solely on reservation age, settles its estimate, and inserts an interrupted attempt. No worker ownership or heartbeat is checked, although transport permits 120-second calls.

When A succeeds, normal settlement cannot replace the estimate because it updates only `reserved` rows. The ledger and attempt history therefore misrepresent a completed live request.

**Evidence:** An isolated target-function probe confirmed forced settlement at 61 seconds without any ownership query. The concurrent regression test uses promptly completing calls and misses this window.

**Minimal fix:** Fence abandonment on actual execution ownership/lease loss. Preserve a safe reconciliation path when a previously uncertain attempt subsequently reports its result.

### CXH-18 — P2 — Resumed agent tools count an existing reservation twice

**Locations:** `worker/agent-runner.ts:112`, `:229`, `:289`, `:300`, `:350`.

**Scenario:** An agent has spent 10 micro-units, reserves 100 for a workflow tool, and pauses while its child workflow awaits approval. Its cap is 150. On resume, the new ledger-based initialization sets spend to 110. The existing precheck adds the same tool’s 100 again and incorrectly fails with `AGENT_COST_LIMIT`, although only 110 is held.

With a higher cap, completion instead adds the tool cost again at `:300`; the monotonic `Math.max` refresh can retain the inflated total.

**Evidence:** Code-traced through the pending-tool resume path. The new agent-cap tests have no tools and do not exercise pause/resume.

**Minimal fix:** Let the locked, idempotent reservation function decide whether additional budget is needed. Refresh totals from the ledger after settlement instead of adding costs already included in it.

### CXH-19 — P2 — First fallback inherits primary refusal behavior after filtering

**Locations:** `src/ai/hub/routing.ts:210`, `:247`; `src/ai/hub/execute.ts:246`.

**Scenario:** The primary model is removed. Approved fallback B is owner-only, while fallback C allows the acting editor. Planning removes the primary, making B index zero. B’s `AI_ROUTE_FORBIDDEN` is treated as a primary refusal, so execution stops without trying C.

**Evidence:** Code-traced through the new unavailable-primary filtering and existing index-based refusal logic. CXH-13’s regression tests have only one fallback.

**Minimal fix:** Preserve explicit primary/fallback identity in planned routes. Base refusal handling on that identity, not the filtered array index, and add the removed-primary → forbidden-fallback → allowed-fallback regression.


