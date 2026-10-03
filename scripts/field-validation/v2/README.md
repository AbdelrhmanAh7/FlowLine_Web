# Field validation v2 — issue #6

## Current result — 2026-10-03

The root-operated, isolated **real API/worker sample-only** run at source
`9d76c84342bcd1c6f8b6f79a2f200759c02e130c` completed and **failed 8/10** under the independent v2 packet scorer.
Only VP-05 and VP-06 failed, each on `ownerDecisionQualified`. Persisted duplicate comparison, approval/replay/sample
outbox checks, and the one-record-per-request check all passed. See
`artifacts/phase-4/takeover-20261003/field/CURRENT_RESULT.md` and the preserved
`runs/takeover-6313141399/results.json`. This is a product finding, not acceptance; issue #6 remains open.
There was no Gmail, payment, cancellation-provider, browser, or human acceptance proof.

This is a **new** validation version (`20261003-v2`). The v1 packet, harness, results and screenshots under
`artifacts/company-builder/validation/20261001-d224cfb/` stay frozen. This work does not rescore or overwrite those results.

Source: candidate `719056cefa9d9810f93ea8c917da2bda82fe2e4a`, paths
`artifacts/company-builder/validation/20261001-d224cfb/packet/packet.json` and
`artifacts/company-builder/validation/20261001-d224cfb/flowline-field/field.spec.ts`.
The new packet records the original packet's SHA256 (`4fa9841b2a5f40f76ea197e9a1a9f5dd4c10b3796e156968b4808f9d495d6596`)
and preserves its ten synthetic requests, approved information, universal checks and failure-case definitions.
It replaces v1's freeze metadata with version/provenance, adds a Friday expectation to VP-03,
and requires explicit owner-decision qualification for VP-05/VP-06. Any later packet change needs another version/digest.

## Deterministic CI coverage

`tests/unit/field-validation-v2.test.ts` is discovered by the existing `unit` project (`tests/unit/**/*.test.ts`).
The current `.github/workflows/gate.yml` static job includes that unit project.
No workflow changes or weakening of existing assertions was needed. Root reports full CI run `37081798792` green
on all six checks at source `9d76c84342bcd1c6f8b6f79a2f200759c02e130c`; the earlier 52/61 focused-check
artifacts remain historical, while root reports 63 current focused tests after two additional guard cases.

Focused commands, using the existing dependencies:

```powershell
node node_modules/vitest/vitest.mjs run --project unit tests/unit/field-validation-v2.test.ts --maxWorkers 1 --no-file-parallelism --configLoader runner --no-cache
node node_modules/typescript/bin/tsc -p scripts/field-validation/v2/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js scripts/field-validation/v2/*.ts tests/unit/field-validation-v2.test.ts src/server/field-validation-identity.ts src/app/api/test/field-identity/route.ts --no-cache
```

The tests use explicitly synthetic scorer inputs and mutation counterexamples. They do not mock product acceptance,
call a provider, or claim a field score. Scoring imports no product evaluator and ignores `matchedOutcome` as a score.

## Six criteria

| Criterion | Implementation and focused proof |
| --- | --- |
| Approved policy is not a cancellation promise | `nonPolicySentences` exempts only complete exact approved sentences. VP-06 can quote the refund policy containing "cancelled paid visits". Appended actual commitments still fail. |
| Exercise approval side | The opt-in API harness opens VP-05's owner review, checks the outbox before approval, approves through the real review endpoint, captures the persisted sample outbox, then attempts a second decision. The scorer requires one bound entry with exactly the proposed text/recipient and a refused replay. Tests fail missing approval evidence, early sends, altered content, wrong binding, extra actions and repeated sends. |
| Duplicate persisted records | A read-only Postgres query captures the actual `kv_entry` rows before/after a second VP-01 trial with a new key. Scoring compares counts, key sets and values, and checks the independently expected `<session-id>/sample:VP-01` key. All ten requests must also have exactly one scoped record. Tests reject growth, same-count replacement, missing target and changes to other records. |
| Verify packet digest | `loadPacket` hashes actual bytes against the manifest before creating a workspace, trials or a score artifact. Tests reject changed JSON, malformed manifests, wrong filenames and versions. The reported digest is the computed digest. |
| Friday confirmation fails | VP-03 retains its requested Friday date (`2026-10-09`) but any recognized positive service/booking confirmation fails separately, even alongside correct hours. EN/AR commitments, denial and mixed-negation counterexamples are covered. |
| VP-05 and VP-06 owner qualification | Both require owner-decision wording about the current request, explicit no-action wording, consequential draft/record flags and no promise. Policy quotes, unrelated owner decisions and "a member of our team" alone are insufficient. Tests exercise both cases plus Arabic and negated authority. |

## Opt-in API field run — completed by root, failed 8/10

`field.spec.ts` adapts the old harness into a maintained, dedicated API suite. It uses Playwright's **request** fixture only;
it creates no browser and starts no server. It creates/verifies a synthetic user through the real endpoints and executes the real worker.
No user acceptance verdict is posted. Failure scores were saved and then failed the test.
Before signup or any API write, it checks the observer's `current_database()` and calls a read-only test-only identity route
that queries the API server's actual `current_database()`. Both must match the selected `flowline_test_field` database exactly.
Non-test environments and non-field databases return 404; the route returns only a SHA256 digest of the validated name,
never a database URL or name. Ports 3000, 3100 and 3200 are refused even before the identity request.
The standalone synthetic signup helper uses the real test outbox and avoids the shared E2E stack's import-time database grammar.

A future authorized operator needs the combined Company Builder candidate, an **already running isolated** test stack,
its matching local `flowline_test_field` or `flowline_test_field_<suffix>` database, `FLOWLINE_ENV=test`,
`FLOWLINE_COMPANY_BUILDER=on`, and
`FIELD_BASE_URL` on a dedicated loopback port (3000/3100/3200 refused). Supply `DATABASE_URL` through protected process configuration;
this harness never reads an env file. Prepare the parent `artifacts/phase-4/takeover-20261003/field/runs/`,
set a new alphanumeric/underscore/hyphen `FIELD_RUN`, then run from the repository root:

```powershell
node node_modules/@playwright/test/cli.js test --config scripts/field-validation/v2/field.config.ts
```

An existing run directory is refused. The report records the code SHA, dirty-tree flag, packet digest,
request scores, raw synthetic duplicate/outbox evidence, and the actual sample-only mode. Only a loopback test
database is permitted; its observer connection is read-only. A new run directory left by an early failure is preserved.

## Limits and blockers

- The author lane ran deterministic scorer tests, a no-server harness module-load check, and scoped static checks.
  Root subsequently ran the real API/worker/storage sample scenario and preserved its failed result. No browser was run.
- Candidate `719056c` has a generic consequential draft note (`REFUND_NOTE` in `src/company-builder/packs/customer-follow-up.ts`)
  that names a team member but does not explicitly qualify the current request for an owner decision. The root-run v2 result
  now **observes** `ownerDecisionQualified=false` for VP-05/VP-06. No product fix is included here.
- Company Builder at the source candidate uses a local sample outbox with `mocked_integration` provenance. Approval
  proves sample text recording only, **not** Gmail delivery, a real cancellation, a refund or a payment. Live Gmail capability/account
  work, cloud accounts, owner consent, actual browser journeys and human usability remain separate blockers.
- These packet-specific EN/AR recognizers intentionally preserve the original literal fact-quote checks. They are a bounded
  deterministic regression scorer, not unrestricted semantic judgment. Arbitrary paraphrases, complex negation, hypothetical
  quotations and unsupported language need independent human evaluation; no competitor equivalence is claimed.
- FC-1/FC-3/FC-4 (missing/revoked credentials and changed-answer invalidation) are preserved as requirements but **not exercised**
  by this bounded run. The v1 changed-answer action was omitted rather than relabelled as verified. VP-02 covers the supplied missing-price case.
- The packet is known and source-derived, **not held-out**. The 8/10 result is an isolated sample API/worker score,
  not a provider/live or human acceptance result.
- `gh issue view 6 --repo AbdelrhmanAh7/FlowLine_Web` was attempted read-only and returned HTTP 401. The six criteria above
  are checked against the owner-supplied lane prompt and the primary checkout's saved
  `artifacts/phase-4/takeover-20261003/issue6-restart.json`. No issue state change was made.
