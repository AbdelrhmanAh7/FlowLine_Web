| Item | Verdict at `a0b92df` | Summary |
|---|---|---|
| CXH-12 | **FIXED** | Omitted prices inherit the locked row’s current values. |
| CXH-17 | **FIXED** | Lease validation, abandonment and late-success reconciliation now serialize correctly. |
| CXH-20 | **FIXED** | Shared writes use deterministic ordering; transaction retries are bounded. |
| Other 17 findings | **Remain FIXED** | No regression identified in the Round 3 spot-check. |
| INTERMITTENT-01 | **MITIGATED; cause unresolved** | Claim retries preserve outcome assertions and surface persistent failures. |
| **CXH-21 — NEW, P2** | **Test-quality issue** | Two concurrency tests can pass without reaching their intended interleaving. |

**Product fixes accepted by code inspection; concurrency regression evidence remains incomplete.**

Reviewed `git diff f74a5a1 a0b92df -- src worker drizzle scripts tests` and relevant callers. Confirmed these paths are identical between `a0b92df`, HEAD `63afaf5`, and the tracked working tree. All locations below refer to `a0b92df`.

No files were modified. No tests, servers, browsers, Docker or databases were started. The reported gate passes were not independently rerun. The existing untracked `CODEX-RETEST3-a0b92df.md` was left untouched and was not used.

**CXH-12 — FIXED**

At `src/ai/hub/catalogue.ts:240`, omitted pricing now uses `coalesce(ai_model.pricing, excluded.pricing)` during the conflict update. Price source and verification date follow the same current-row choice at `:241` and `:242`. The earlier unlocked price snapshot has been removed.

Consequently, when B commits its paid price before A’s newer, price-omitting update, A inherits B’s committed price. Explicitly invalid pricing still clears through the non-inheriting branch at `:207` and `:244`.

The observation-time condition remains at `:247`. Shared writes remain inside the credential-fenced transaction at `src/ai/hub/discovery.ts:82` and `:106`; connection rotation/revocation fencing is preserved.

**CXH-17 — FIXED**

`src/ai/hub/execute.ts:183` is now only a preliminary lease check.

The authoritative transaction:

- Locks the owning run/agent-run row at `:203`.
- Locks the usage event and rechecks its status and lease at `:205`–`:207`.
- Settles abandonment and inserts its placeholder within that same transaction at `:209` and `:211`.

A heartbeat committed before those locks is observed; a heartbeat attempting to update the locked lease row must wait.

Late success takes the same usage-event lock at `:242`. Settlement, reconciliation and placeholder correction occur within one transaction at `:244`–`:249`. Therefore:

- Success first: abandonment sees a non-reserved event and does nothing.
- Abandonment first: success sees both the abandonment settlement and its committed placeholder, and reconciles both.

These changes close both windows identified in retest 2.

**CXH-20 — FIXED**

`src/ai/hub/catalogue.ts:143` sorts shared writes by model ID using a consistent code-unit ordering. `:267` combines curated and listing writes before sorting, avoiding separate passes with incompatible acquisition orders. Same-model curated writes precede listing writes.

`src/ai/hub/discovery.ts:69` retries the complete fenced transaction for `40P01` and `40001`, with at most three attempts. Each retry reacquires and revalidates the connection fence. Other errors and exhausted retries propagate.

**Assessment of every new test**

The lead’s caveat is valid: failure caused by missing hooks proves neither regression sensitivity nor correct interleaving. The counterfactual assessments below assume hooks are added to the old implementation without changing its behaviour.

All test locations are in `tests/integration/ai-retest-fx3.test.ts`.

| Test | Does it force the exact interleaving? | Would it detect the old bug with hooks? |
|---|---|---|
| **`:142` — omitted price across concurrent updates** | **Incomplete proof.** It forces B to commit before A writes, but does not establish that A previously read the zero. The current hook is at `catalogue.ts:142`, before the shared-write loop. | **Yes if the old hook is placed after the old `prior` read; no if placed before that read.** In the latter case A simply reads B’s paid price and old code passes. A hooks-only baseline must specify and verify the after-read placement. |
| **`:175` — invalid clears; omitted preserves** | **No concurrency interleaving; sequential semantics test.** | **No for the reopened CXH-12 race.** `f74a5a1` already preserved omitted prices and cleared explicitly invalid ones in this sequential case. Useful preservation coverage. |
| **`:192` — opposite listing orders** | **Intended interleaving is appropriate, but not guaranteed.** A holds its first row; B should either hold the opposite row or wait for A’s ordered row. The wait can silently expire or observe unrelated contention. | **Yes when the rendezvous actually occurs:** old unordered writes deadlock, producing a rejection—or a nonempty retry list if retry handling is retained. **Can false-pass without that rendezvous; see CXH-21.** |
| **`:223` — bounded transaction retry** | **No real lock-cycle interleaving.** It injects SQLSTATE-bearing exceptions after a shared write. | **Yes for missing retry handling.** Old code would propagate the first injected exception. It also meaningfully checks exhaustion and rollback of the failed new row. This does not establish that PostgreSQL itself produced either error. |
| **`:250` — heartbeat renewed after stale read** | **Yes at the lease-read boundary:** the hook commits renewal after recovery has classified the lease as lost. However, A is delayed by a timer rather than held by a deterministic response barrier. | **Yes while A remains reserved:** old recovery still abandons it; the `abandonedAt` and interrupted-attempt assertions catch that. An unusually delayed schedule allowing A to settle first weakens this guarantee. |
| **`:285` — late success between settlement and placeholder** | **Intended boundary is exact**, using `afterAbandonSettle`. But its wait accepts any database lock waiter and ignores timeout. | **Yes when A actually completes before the old placeholder insert:** the old code leaves an unreconciled placeholder, failing `:318`. **Can false-pass when the wait releases early; see CXH-21.** |
| **`:321` — success settles before abandonment** | **Yes if the hook is reached:** it awaits A’s completion before recovery proceeds. Hook execution itself is not asserted. | **No for the reported old races.** Old code already conditionally updated only `reserved` events and skipped placeholder insertion when that update returned nothing. Useful success-first preservation coverage, not a behavioural red test for Round 3. |

For the CXH-12 counterfactual, the decisive ordering must be **A reads zero → B commits paid price → A writes**. Merely **A starts → B commits → A writes** is insufficient.

**INTERMITTENT-01 — helper assessment**

**No outcome assertion was removed or weakened.** The changes to `ai-review-wavec.test.ts` and `ai-retest-fx2.test.ts` replace claim-driving loops; their result, cost, ledger and provider-call assertions remain.

At `tests/integration/helpers.ts:103`:

- A null claim is retried only while the target remains queued.
- Five retries are allowed, with 100 ms waits; persistent inability to claim throws with diagnostics.
- Claim and processing exceptions propagate; they are not caught and converted into success.
- `claimAndProcess` still throws when no target was processed (`:125`).
- Agent helpers still reread the actual persisted result for their existing assertions.

The agent drain bound increases from 10 to 50 claims; the workflow helper retains 25. This changes how much unrelated queued work can be drained, not the expected target outcome.

The helper tolerates transient claim unavailability, so passing runs no longer reveal every transient null claim. That is appropriate for a worker-driving helper, but **does not prove the hypothesized lock contention caused the original failures**. Diagnostics are captured only after retry exhaustion. Keep INTERMITTENT-01 labelled mitigated, cause unknown.

**Other 17 FIXED findings — regression spot-check**

| Findings | Evidence at `a0b92df` | Result |
|---|---|---|
| CXH-01 | `src/server/oauth-apps.ts:158`; `src/server/connections.ts:489`, `:571` — immutable platform identity remains enforced. | Remains FIXED |
| CXH-02 | `src/server/auth-dispatch.ts:42`, `:84` — identity-bound cache and callback binding unchanged. | Remains FIXED |
| CXH-03 | `src/ai/hub/execute.ts:160`, `:424`, `:456` — persisted numbering and a fresh reservation still precede each send. | Remains FIXED |
| CXH-04 | `src/ai/hub/execute.ts:404`; `src/server/usage.ts:79` — agent cap and explicit agent opt-in remain enforced. | Remains FIXED |
| CXH-05 | `src/server/crypto.ts:143`, `:146`, `:308` — purpose-specific limits and legacy rewrap compatibility unchanged. | Remains FIXED |
| CXH-06 | `src/server/rewrap.ts:274`, `:286`, `:301` — account-token rewrap, conditional updates and remaining counts preserved. | Remains FIXED |
| CXH-07 | `src/ai/hub/pricing.ts:92`; `src/ai/hub/execute.ts:403` — complete-request sizing still feeds reservations. | Remains FIXED |
| CXH-08 | `src/ai/hub/execute.ts:485`, `:491`, `:496` — missing usage retains the reservation and null token counts through the new settlement transaction. | Remains FIXED |
| CXH-09 | `src/ai/hub/catalogue.ts:207`, `:244`; `drizzle/0019_hub_retest_data.sql:6` — invalid-price clearing and historical invalidation preserved. | Remains FIXED |
| CXH-10 | `src/server/oauth-apps.ts:262`, `:327` — authoritative locked-row revision checks unchanged. | Remains FIXED |
| CXH-11 | `src/ai/hub/connections.ts:34`, `:63`, `:328` — proof method and credential-version checks preserved. | Remains FIXED |
| CXH-13, CXH-19 | `src/ai/hub/routing.ts:200`, `:253`; `src/ai/hub/execute.ts:344` — explicit route identity survives filtering. | Both remain FIXED |
| CXH-14 | `worker/handlers.ts:303`, `:311`; `src/engine/execute.ts:110` — bounded credential retries and retry metadata unchanged. | Remains FIXED |
| CXH-15 | `src/ai/hub/protocols/shared.ts:26`, `:121`; `openai-chat.ts:195` — malformed tools/streams remain rejected. | Remains FIXED |
| CXH-16 | `src/ai/hub/protocols/shared.ts:239`, `:286`, `:296` — error allowlisting and credential scrubbing unchanged. | Remains FIXED |
| CXH-18 | `worker/agent-runner.ts:114`, `:234`, `:303` — resumed tool reservations remain idempotent; spend remains ledger-derived. | Remains FIXED |

**CXH-21 — NEW, P2 — Concurrency tests can pass without the required contention**

**Locations:** `tests/integration/ai-retest-fx3.test.ts:66`, `:75`, `:213`, `:304`.

**Scenario:** `upTo` returns `false` on timeout, but both callers ignore that result. `lockWaiting` also accepts an ungranted lock from any session in the test database.

This permits false-green schedules:

- In the opposite-order test, B has not reached its first shared-row write before the wait expires—or B is waiting on an unrelated lock. A is released and finishes first. Old unordered writes then execute serially and pass.
- In the late-success test, the wait exits before A reaches reconciliation. Recovery inserts the placeholder first; A subsequently reconciles it. Old non-atomic code passes because the reported race never occurred.

**Minimal fix:** Require an explicit, asserted rendezvous. Identify the participating backend/target lock, or add narrowly scoped barriers proving that B reached the contested write and A reached late settlement. Treat timeout as failure, and release gates in `finally`. Replace timed provider delays with response barriers where reservation state must remain pending.

No additional product-code issue was identified in this round.
