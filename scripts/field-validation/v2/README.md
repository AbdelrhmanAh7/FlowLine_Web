# Field validation v2 — issue #6

Packet version `20261003-v2`. This is the harness for the **next** field-validation round of the Company Builder
customer-follow-up task. It fixes the six scoring/coverage gaps CodeRabbit found in the v1 harness
([issue #6](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/6)).

## Status (2026-10-04)

- **Implemented and unit-tested:** the packet, the scorer, an opt-in real-API/worker run (`field.spec.ts`) and a test-only
  database-identity route. All six issue items have regression fixtures that fail on the old behaviour (see below).
- **No v2 run is recorded by this change.** Nothing here was run against a server, a worker, a database, a browser or a
  provider. Do not cite a v2 score until an authorised operator has run `field.spec.ts` and kept its `results.json`.
- Draft PR #10 recorded one real sample-only API/worker run at `9d76c84` that scored **8/10** (VP-05 and VP-06 failed
  `ownerDecisionQualified`). That evidence exists only on that unmerged branch and was produced by an earlier revision of
  this scorer; the scorer was changed afterwards (see "Changes after PR #10"). It is context, not evidence for this code.
- The current product text for refund/cancellation drafts (`REFUND_NOTE` in `src/company-builder/packs/customer-follow-up.ts`)
  says "A member of our team will review your request" and never says the owner decides. The unit fixtures prove this
  scorer rejects exactly that note for VP-05 and VP-06, so a run against the current product is expected to fail those two
  requests. That is a product finding to fix separately, not something the harness should hide.
- The v1 packet, harness, results and screenshots under `artifacts/company-builder/validation/20261001-d224cfb/` stay
  frozen. Nothing in this change rescores or edits them. Where v1 recorded VP-06 as FAIL (`VF-02`, a disputed fixture
  expectation), that stays as recorded.

Source of the packet: candidate `719056cefa9d9810f93ea8c917da2bda82fe2e4a`, path
`artifacts/company-builder/validation/20261001-d224cfb/packet/packet.json` (SHA-256
`4fa9841b2a5f40f76ea197e9a1a9f5dd4c10b3796e156968b4808f9d495d6596`). `packet.json` here keeps the ten synthetic requests,
approved information, universal checks and failure-case definitions, replaces the freeze metadata with
version/provenance, adds a Friday expectation to VP-03 and requires owner-decision qualification for VP-05/VP-06. The
packet is known and source-derived, not held-out. Any later packet change needs a new version and digest.
The v1 `mustNotPromise` word lists stay in the packet as provenance; the scorer applies an assertion grammar instead of the
isolated words (that is how `VF-02` is resolved).

## The six issue items

| Issue item | What v2 does | Regression fixtures (`tests/unit/field-validation-v2.test.ts`) |
| --- | --- | --- |
| Approved policy text scored as a cancellation promise (`field.spec.ts:117`) | `hasConsequentialPromise` removes only complete approved sentences (exact match, ignoring case, spacing, quote marks, bullets and end punctuation) and the fixed no-action sentence, then looks for an **assertion** that the business refunded/cancelled/will refund/will cancel. Negated spans ("has not been cancelled", "no refund has been issued", "we cannot promise a refund") and questions are not promises. The v1 rule is reproduced inline and shown to give the wrong answer on the same reply. | approved policy quoted plain and in four format variants; negations and non-commitments; fifteen promise phrasings in EN/AR that must fail, including ones the earlier scorer missed ("We'll go ahead and cancel", "Your refund is approved"); a promise appended to a policy or hidden after a negated clause |
| Approval side of the review gate not exercised (`:138`) | The run requests VP-05's owner review, snapshots the outbox before approval, approves through the real review endpoint, snapshots after, approves again and snapshots again. `scoreApprovalGate` requires the item executed, exactly one new outbox entry bound to that review with exactly the proposed recipient/text and `mocked_integration` provenance, a refused replay (409) and no second send. | gate scorer mutations (early send, wrong recipient/body/binding, extra keys, live provenance, still-`approved` item, wrong item, repeated send, member reviewer); a source-order test that the spec requests, snapshots, approves, replays and scores in that order |
| Persisted records not compared after the duplicate trial (`:143`) | A read-only Postgres query reads the real `kv_entry` rows (`cb_customer_follow_ups`) before and after a second VP-01 trial with a new key. `scoreDuplicate` compares count, key set, the target row's key/value and every other row. `scoreRecordSet` also requires exactly one interview-scoped record per request and nothing extra. A null or non-object `jsonb` value is scored as a failure rather than crashing. | extra/replaced/missing/overwritten rows, null values, mis-scoped keys, repeated request ids; a source-order test that the spec reads rows before and after the second trial |
| Packet digest not verified before recording (`:160`) | `loadPacket` hashes the actual `packet.json` bytes against `SHA256SUMS` and checks the version before the database connection, the identity check, the run directory or any API write; the digest recorded in the report is the computed one. The test pins the committed digest, so a packet edit must be a deliberate new version. | edited packet, malformed/wrong-file/missing manifest, wrong version, tampered copy loaded from disk, pinned digest, source-order test |
| Friday service confirmation scored correct (`packet.json:41`) | VP-03 keeps the requested Friday date (`2026-10-09`), and `confirmsClosedDate` fails any recognised confirmation or commitment for that day (booking confirmed/reserved/arranged/set, "we'll be there", "see you", "Friday works", "we are available", Arabic equivalents), even when the reply also quotes the correct hours. Negated commitments, "closed", and a confirmation that names only another day are allowed. | the v1 checks all pass a Friday confirmation and only the new check fails it; thirteen confirmations that must fail; eleven unavailable/alternative-day replies that must pass |
| Owner-decision qualification not enforced in VP-05/VP-06 (`packet.json:44`) | `qualifiesOwnerDecision` needs, outside quoted policy, a sentence saying the owner decides/reviews/approves THIS request (refund, cancellation, visit, booking), the fixed no-action sentence naming both a refund and a cancellation, and no promise. Negated or waived authority ("won't decide", "without the owner's approval"), an unrelated owner task and the generic "a member of our team" note do not qualify. The draft and record flags are still checked separately. | both requests with the exact generic team-review note fail on exactly `ownerDecisionQualified`; five English and one Arabic accepted owner wordings; five rejected authority wordings |

## Changes after PR #10

Everything in PR #10's v2 harness was reviewed; these were defects or gaps found in that review and fixed here.

- The exact-policy exemption and the no-action sentence needed the exact punctuation: a quoted, bulleted or unpunctuated
  approved sentence was scored as a promise.
- The promise detector still matched the isolated words `refunded`/`cancelled` in negations ("No refund has been issued
  yet.") and missed common promise forms ("We'll process your refund", "Your refund is approved", Arabic "قمنا بإلغاء").
- The Friday detector missed "We'll be there on Friday", "See you on Friday", "Friday works for us", "set for", "reserved",
  "arranged", date forms such as "9 October", and Arabic "سنكون" / "تم تحديد موعدك"; it also flagged a confirmation of
  another day. Arabic matching had no word boundary (`تم` matched inside `يتم`) and no spelling folding.
- Owner authority did not see contractions, so "The owner won't decide this request" counted as authority; and plural or
  reordered wording ("The owner decides on refunds", "Refund decisions are made by the owner") was rejected.
- A null `jsonb` value made the duplicate/record scorers throw instead of fail; the "one record per request" check was an
  untested inline expression and is now `scoreRecordSet`.
- The identity route used its own environment test; it now uses the shared `testFeaturesEnabled()` gate and has route-level
  tests (see below). `loadPacket` accepts a directory so the file-reading path can be tested against a tampered copy.
- The previous README quoted a run and evidence files that are not on this branch and a stale "HTTP 401" note; both removed.

## Test-only identity route

`GET /api/test/field-identity` returns `{ fieldDatabaseSha256 }`, the SHA-256 of `current_database()`, only when
`FLOWLINE_ENV=test` and the name matches `flowline_test_field[_suffix]`; every other case, including a query failure,
is the same 404, and the database module is not loaded outside the test environment. It is read-only, never returns the
name or a connection string, and is covered by the same beta-proxy block as the other `/api/test/*` routes
(`deploy/beta/Caddyfile`). The digest is a comparison token, not a secret: a `flowline_test_field*` name is guessable, so
the guard is the environment gate, not the hash. The route-level unit tests stub `FLOWLINE_ENV` to production, beta,
staging, development, unset and near-miss values and assert 404 with the database never queried.

## Deterministic checks

`tests/unit/field-validation-v2.test.ts` is discovered by the existing `unit` project (`tests/unit/**/*.test.ts`), so the CI
`checks` job (`pnpm gate --only=static,unit,contract,integration` in `.github/workflows/gate.yml`) already runs it, and
the `static` group lints and typechecks these files. Focused commands from the repository root:

```powershell
node node_modules/vitest/vitest.mjs run --project unit tests/unit/field-validation-v2.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js scripts/field-validation/v2/*.ts tests/unit/field-validation-v2.test.ts src/server/field-validation-identity.ts src/app/api/test/field-identity/route.ts
```

The tests use explicitly synthetic scorer inputs and mutation counterexamples. They do not mock product acceptance, call a
provider, or claim a field score. The scorer imports no product evaluator and ignores the product's `matchedOutcome`.

## Opt-in API field run (not run by this change)

`field.spec.ts` is a dedicated API suite using Playwright's **request** fixture only: no browser, no web server. It
creates and verifies a synthetic user through the real endpoints (the test outbox) and runs the real worker. No user
acceptance verdict is posted. Failure scores are saved to `results.json` first and then fail the test; there are no retries.
Before signup or any API write it checks that the read-only observer connection and the API server report the same
`flowline_test_field*` database. Ports 3000, 3100 and 3200 are refused. It is not part of `pnpm test:e2e` (the root
Playwright config only reads `e2e/`).

An authorised operator needs the combined Company Builder candidate, an **already running isolated** test stack, its matching
local `flowline_test_field` or `flowline_test_field_<suffix>` database, `FLOWLINE_ENV=test`, `FLOWLINE_COMPANY_BUILDER=on`
and `FIELD_BASE_URL` on a dedicated loopback port. `DATABASE_URL` comes from protected process configuration; this harness
never reads an env file. Prepare the parent `artifacts/phase-4/takeover-20261003/field/runs/`, set a new
alphanumeric/underscore/hyphen `FIELD_RUN`, then run:

```powershell
node node_modules/@playwright/test/cli.js test --config scripts/field-validation/v2/field.config.ts
```

An existing run directory is refused. The report records the code SHA, a dirty-tree flag, the packet digest, request scores,
the raw synthetic duplicate and outbox evidence, and the mode (`REAL_TEST_API_AND_WORKER_SAMPLE_ONLY`).

## Limits

- The scorer is a **bounded EN/AR recognizer** for this packet, not general semantic judgment. Arbitrary paraphrases,
  complex negation, hypothetical quotations and other languages need human evaluation. It errs towards failing: a reply that
  states a customer's own cancellation as fact, or puts "owner decides" and "nothing was refunded" in one sentence, fails.
  The no-action wording must be a sentence of its own; the policy exemption needs the whole approved sentence.
- Approval is exercised for VP-05 only (one consequential reply), not VP-06, and only the approve path; rejection is not
  exercised. The duplicate check reads the `cb_customer_follow_ups` namespace, not every table.
- Company Builder uses a local sample outbox with `mocked_integration` provenance. Approval proves sample text recording
  only, **not** Gmail delivery, a real cancellation, a refund or a payment.
- FC-1/FC-3/FC-4 (missing/revoked credentials and changed-answer invalidation) are preserved as requirements but **not
  exercised**; v1's changed-answer step was omitted rather than relabelled. VP-02 covers the supplied missing-price case.
- No live provider, Gmail, payment, browser, Arabic UI, human usability or competitor equivalence is claimed.
