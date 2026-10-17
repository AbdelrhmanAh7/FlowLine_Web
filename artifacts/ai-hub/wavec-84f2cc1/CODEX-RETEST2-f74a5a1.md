| ID | Verdict | Notes |
|---|---|---|
| CXH-01 | FIXED | Immutable platform-app identity fences clear/recreate. |
| CXH-02 | FIXED | Identity-bound sign-in cache and callbacks preserved. |
| CXH-03 | FIXED | Fresh sends still require distinct reservations. |
| CXH-04 | FIXED | Workspace override no longer bypasses the agent cap. |
| CXH-05 | FIXED | Separate credential/step-data limits preserved. |
| CXH-06 | FIXED | Account-token rewrap and conditional updates preserved. |
| CXH-07 | FIXED | Historical tool arguments remain included in reservations. |
| CXH-08 | FIXED | Missing usage remains unknown; reservation retained. |
| CXH-09 | FIXED | Historical false zeros invalidated; malformed prices clear stored pricing. See CXH-12. |
| CXH-10 | FIXED | Rotation/deletion still validate the locked authoritative row. |
| CXH-11 | FIXED | Verification requires method and matching credential version. |
| CXH-12 | **PARTIALLY FIXED** | Transaction fence works; stale inherited pricing can still overwrite newer pricing. |
| CXH-13 | FIXED | Removed-primary fallback works with explicit route identity. |
| CXH-14 | FIXED | Transient handling preserved; retry metadata and bounded step retries now wired. |
| CXH-15 | FIXED | Malformed streams/tool arguments remain rejected. |
| CXH-16 | FIXED | Provider-error allowlisting and credential scrubbing preserved. |
| CXH-17 | **PARTIALLY FIXED** | Lease-aware detection added; abandonment and reconciliation remain non-atomic. |
| CXH-18 | FIXED | Resumed tool reservations are counted once. |
| CXH-19 | FIXED | First fallback no longer inherits primary refusal semantics. |
| CXH-20 | **NOT FIXED — NEW, P2** | Concurrent shared-catalogue transactions can deadlock through inconsistent model order. |

**Verdict: changes required.** At `f74a5a13b01b4cedcc548b0b21fae5498359c0ed`, 17 existing findings are FIXED and two remain PARTIALLY FIXED. One new P2 issue was identified.

Reviewed `cceeb5d..f74a5a1` and relevant callers/tests. All locations below refer to `f74a5a1`. Regression tests were **inspected, not executed**. Two focused probes executed target-source functions in memory with substituted dependencies; these are not PostgreSQL verification. No files were modified, and no servers, browsers, Docker, databases or live providers were started or contacted.

**CXH-01 — FIXED**

`src/server/connections.ts:454`, `:489`, `:529` and `:571` carry immutable platform identity through authorization state, callback validation and connection provenance. `src/server/oauth-apps.ts:158` compares that identity under the app lock. Runtime access checks it at `src/server/connections.ts:290`; refresh refuses missing/mismatched identity at `src/server/oauth-apps.ts:143`.

Migration `drizzle/0017_cxh01_platform_app_identity.sql:10` conservatively backfills provable identities and discards pending platform authorizations.

**Regression coverage: yes.** `tests/integration/sec-cxh01-identity.test.ts:137` pauses an exchanged callback across revoke/clear/recreate; `:176` checks runtime refusal even when the expiry sweep is simulated as missed; `:203` preserves same-app rotation. `tests/integration/sec-cxh01-backfill.test.ts:60` exercises migration state.

The documented legacy exception remains: unbound historical connections may use existing access tokens until refresh requires reconnect.

**CXH-04 — FIXED**

`src/ai/hub/execute.ts:358` separates the agent’s explicit unknown-cost opt-in from workspace policy. `src/server/usage.ts:79` independently enforces the agent cap inside the locked reservation. `worker/agent-runner.ts:433` passes the version’s choice.

The opt-in defaults off and explicitly describes relinquishing the guarantee in both locales; it is not a silent workspace-level bypass.

**Regression coverage: yes.** `tests/integration/ai-retest-fx2.test.ts:163` checks refusal without sending, then explicit agent opt-in. Cases at `:196` and `:232` cover fallback charges and tool reservations. The original charged-retry test remains at `tests/integration/ai-review-wavec.test.ts:197`.

**CXH-09 — FIXED**

`src/ai/hub/protocols/listings.ts:54` distinguishes malformed supplied pricing from omitted pricing. `src/ai/hub/catalogue.ts:183` clears invalid pricing instead of preserving the old zero. `drizzle/0019_hub_retest_data.sql:6` invalidates historical listing-sourced prices containing a zero side.

**Regression coverage: yes.** `tests/integration/ai-retest-fx2.test.ts:435` seeds a historical zero and refreshes malformed prices; `:451` executes the data migration and checks preservation of curated free prices. Parser coverage is in `tests/unit/hub-retest-fx2.test.ts:26`.

This closes the reported historical-parser defect. The separate concurrent overwrite in CXH-12 can still restore stale pricing.

**CXH-11 — FIXED**

`src/ai/hub/connections.ts:33` validates verification method against the provider’s actual check type and current credential version. Projection at `:63` no longer accepts a timestamp alone. Replacement records proof for the new version at `:328`.

`drizzle/0019_hub_retest_data.sql:15` backfills authenticated-listing provenance; `:25` invalidates unsupported historical verification.

**Regression coverage: yes.** `tests/integration/ai-retest-fx2.test.ts:464` covers historical public-list timestamps, authenticated-listing backfill, changed credential versions and subsequent inference verification. The unit test also checks the migration’s provider list against the registry.

**CXH-12 — PARTIALLY FIXED**

The original post-fence race is closed: `src/ai/hub/discovery.ts:56` now includes shared catalogue writes in the connection-locked transaction. The conditional upsert at `src/ai/hub/catalogue.ts:212` rejects older observations.

However, preserved prices are still copied from an **unlocked earlier read** at `src/ai/hub/catalogue.ts:171`, then written as part of a newer observation at `:184`.

Concrete interleaving:

1. Tenant A’s observation at T2 omits pricing. Its transaction reads an existing zero price.
2. Tenant B’s observation at T1 supplies a paid price and commits it while A is paused.
3. A resumes and writes its previously read zero. T2 passes the timestamp condition, replacing B’s paid price.

The newer observation did not supply a zero; the code manufactured that update from stale database state. FREE_ONLY can consequently see the obsolete zero again.

**Probe:** Target-source `storeListingMetadata` with controlled in-memory reads/writes changed the price from `2,000,000` back to `0`, while advancing `observedAt`.

**Regression coverage: partial.** `tests/integration/ai-retest-fx2.test.ts:516` covers rotation after the fence; `:533` covers older versus newer **explicit** prices. Neither exercises concurrent inheritance of omitted fields.

**Remaining fix:** Preserve omitted pricing from the row current at update time, using SQL expressions, or lock/re-read shared rows before constructing inherited values. Order those locks consistently—see CXH-20.

**CXH-13 and CXH-19 — FIXED**

`src/ai/hub/routing.ts:200` assigns explicit primary/fallback identity and preserves it through filtering and sorting at `:253`. `src/ai/hub/execute.ts:298` uses that identity for authorization-refusal handling.

**Regression coverage: yes.** `tests/integration/ai-retest-fx2.test.ts:375` exercises the exact removed-primary → forbidden-first-fallback → allowed-second-fallback scenario through a workflow. `:396` verifies that primary refusal remains final. Existing removed-model and MANUAL/revoked guards remain.

**CXH-14, including the correction — FIXED**

Transient refresh failures still preserve credentials at `src/server/connections.ts:369`. The correction is now implemented:

- `worker/handlers.ts:296` retries credential resolution within its bounded attempt count.
- `:303` waits the supplied Retry-After when it is at most 60 seconds.
- `:311` preserves retry metadata in `NodeError`.
- `src/engine/execute.ts:110` preserves it in the serialized step error.

A longer Retry-After causes immediate retryable failure rather than an early retry.

**Regression coverage: yes.** `tests/integration/cxh14-step-retry.test.ts:70` runs a complete workflow and checks the delay and second refresh. `:87` checks exhausted attempts and persisted metadata; `:99` checks the excessive-delay boundary. Existing transient/permanent-grant tests remain applicable.

**CXH-17 — PARTIALLY FIXED**

`src/ai/hub/execute.ts:128` now checks execution ownership/heartbeat instead of declaring every 61-second reservation abandoned. `src/server/usage.ts:156` lets a late success replace an abandonment estimate.

Two race windows remain:

- **Ownership is read, not transactionally fenced.** The owner check at `src/ai/hub/execute.ts:175` precedes the settlement at `:178`. A heartbeat can renew after the stale read; the update only checks reservation status, so a live reservation can still be declared abandoned.
- **The abandonment record and reconciliation can cross.** Recovery settles the reservation at `:180`, then inserts its interrupted placeholder at `:184`. A late success can reconcile the ledger and update existing placeholders at `:457` **before that placeholder exists**. Recovery then inserts an unreconciled `AI_ATTEMPT_ABANDONED` record after success.

**Probe:** The second interleaving left ledger cost correctly reconciled to `10`, but attempt history contained both `success` and `interrupted / AI_ATTEMPT_ABANDONED / possibleCharge:true`.

**Regression coverage: partial.** `tests/integration/ai-retest-fx2.test.ts:315` exercises the original live-61-second scenario. `:344` exercises late success after abandonment bookkeeping has completed. Neither forces these narrower interleavings.

**Remaining fix:** Serialize lease validation, abandonment settlement and placeholder creation with late-result reconciliation. Recheck the lease under the chosen lock/fence and make ledger/history transitions atomic.

**CXH-18 — FIXED**

`worker/agent-runner.ts:114` initializes spend from the ledger. The resumed tool calls the idempotent, locked reservation at `:234` without adding its existing reservation again. Completion refreshes spend at `:303` instead of incrementing it.

**Regression coverage: yes.** `tests/integration/ai-retest-fx2.test.ts:288` pauses a child workflow with 110 held under a 150 cap, then resumes and finishes at 120. `:297` checks reported spend against the ledger under the higher cap.

**Previously FIXED items — regression spot-check**

| ID | Product evidence at `f74a5a1` | Does its regression test exercise the scenario? |
|---|---|---|
| CXH-02 | `src/server/auth-dispatch.ts:42`, `:84`: immutable identity in cache and callback binding. | **Yes.** `tests/integration/sec-wavec-fixes.test.ts:193` clears/recreates at the same revision and checks new credentials plus old-callback refusal. |
| CXH-03 | `src/ai/hub/execute.ts:153`, `:378`, `:410`: persisted numbering and a fresh reservation before each send. | **Yes.** `tests/integration/ai-review-wavec.test.ts:133` simulates crash/recovery state; `:177` checks concurrent request IDs. No stored-result reuse remains an accepted limitation. |
| CXH-05 | `src/server/crypto.ts:143`, `:270`, `:308`: purpose-specific caps and compatible legacy rewrap. | **Yes.** `tests/unit/crypto-limits.test.ts:21`, `:29`, `:60`; actual persistence at `tests/integration/sec-wavec-fixes.test.ts:227`. |
| CXH-06 | `src/server/rewrap.ts:107`, `:284`, `:360`: account-envelope rewrap, ciphertext comparison and remaining counts. | **Yes.** `tests/integration/sec-wavec-fixes.test.ts:382`, `:417` cover retirement and concurrent token replacement. |
| CXH-07 | `src/ai/hub/pricing.ts:92`; `src/ai/hub/execute.ts:357`: complete message sizing remains shared. | **Yes.** `tests/integration/ai-review-wavec.test.ts:247` measures the reservation increase from 20,000-character historical arguments. |
| CXH-08 | `src/ai/hub/protocols/openai-chat.ts:95`; `src/ai/hub/execute.ts:439`: unknown usage retains the reservation and null tokens. | **Yes.** `tests/contract/ai-review-wavec.test.ts:38`, `:53` cover all adapters; integration settlement at `tests/integration/ai-review-wavec.test.ts:269`. |
| CXH-10 | `src/server/oauth-apps.ts:81`, `:262`, `:327`: authoritative locked-row revision checks. | **Yes.** `tests/integration/sec-wavec-fixes.test.ts:251`, `:281` force rotation/rotation and rotation/delete contention. |
| CXH-15 | `src/ai/hub/protocols/shared.ts:26`, `:121`; `openai-chat.ts:195`: malformed protocol data rejected. | **Yes for the reported scenarios.** `tests/contract/ai-review-wavec.test.ts:92`, `:102`, `:113`. Gemini tool-argument shape remains a coverage gap. |
| CXH-16 | `src/ai/hub/protocols/shared.ts:239`, `:286`; `protocols/index.ts:168`: allowlisting and credential scrubbing preserved. | **Yes for the original canary.** `tests/contract/ai-review-wavec.test.ts:145`, `:156`, `:162`. Scrubbing coverage remains helper-level, not end-to-end log/persistence verification. |

**CXH-20 — NEW, P2 — Shared catalogue transactions can deadlock**

**Locations:** `src/ai/hub/discovery.ts:81`; `src/ai/hub/catalogue.ts:179`, `:212`; `src/ai/hub/protocols/openai-chat.ts:254`.

**Scenario:** Two connections refresh OpenRouter concurrently. One response orders shared models `[A, B]`; the other orders them `[B, A]`. Pagination preserves provider order. Each refresh now holds all shared-row locks until its transaction completes:

- Transaction 1 locks A.
- Transaction 2 locks B.
- Each next requests the other’s row.

PostgreSQL must abort one transaction. `refreshCatalogue` converts that failure into `AI_CATALOGUE_UNAVAILABLE`; create/replace paths can also fail after the connection/key write already committed.

This lock cycle is introduced by moving the previously separate shared upserts into a transaction without defining a common acquisition order.

**Minimal fix:** Acquire/update shared catalogue rows in deterministic `(provider, modelId)` order across writers; use bounded transaction retries where appropriate.

**Regression coverage: no.** The new cross-tenant test uses one shared model and cannot create this cycle. Add a PostgreSQL interleaving with opposite listing orders. This finding is code-traced, not database-reproduced.

**INTERMITTENT-01 — unresolved; the suggested mechanism is plausible**

`tests/integration/ai-review-wavec.test.ts:120` immediately breaks when `claimNextAgentRun` returns null. The claim uses `FOR UPDATE SKIP LOCKED` at `worker/agent-runner.ts:81`; a temporarily locked queued row can therefore produce the observed `queued` result without any worker processing it. The new helper repeats this behavior at `tests/integration/ai-retest-fx2.test.ts:151`.

However, the code does **not establish which transaction held that newly queued row**. `startAgentRun` awaits its transaction, and integration files run serially. The hypothesis is not a confirmed root cause. The workflow recovery helper likewise makes a one-shot claim at `tests/integration/helpers.ts:49`; missing failure logs prevent connecting the first failure conclusively.

A bounded claim loop with target-state and lock diagnostics would distinguish temporary contention from missing eligibility. Capture blockers, claimed IDs and outstanding asynchronous work on failure. The later passing runs do not resolve the intermittent failure.
