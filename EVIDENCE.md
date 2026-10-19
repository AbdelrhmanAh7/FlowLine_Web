# Evidence — Issue #142: Field validation packet — fix the 2 scoring gaps in packet.json (VP-05/VP-06)

**Tested commit:** `3f9b03834a2f4ebae56d0f002932640b740f7013` (branch `ai/142`)
**PR:** #188 (base: `main` @ `0b847de697a0383ade20adc46f99ae929fbf8b27`)
**Sentry issue:** N/A — scoring logic defect found during the field-validation run (tracked in issue #142 and #6)
**E2E waiver:** this is an internal scoring-only change (no user-facing flow changed); `field.spec.ts` is a Playwright-based integration harness, not a UI flow. E2E-army test not required — see PR description.

---

## Acceptance Criteria

| AC | Description |
|---|---|
| **AC1** | `packet.json:41` — the harness does not score a Friday service confirmation as correct. A reply that quotes the approved working-hours line but still confirms the requested Friday date (`2026-10-09`) fails `closedDay`. |
| **AC2** | `packet.json:44` — VP-05 and VP-06 replies enforce the owner-decision qualification. A reply without explicit owner wording (`reviewed by the owner` / `the owner will decide` / `the owner decides`) fails `ownerDecision`. |
| **AC3** | Arabic inflected negation forms (`غير متاحة`, `غير متاحون`, `غير متاحين`, `غير متاحات`) are recognised by `NEGATED_CONFIRM` and do not cause correct closed-day replies to score as confirmations. |
| **AC4** | Date-form regex is built from escaped packet data so that a date like `2026.10.09` does not match `2026x10x09`. |
| **AC5** | `PACKET` env var is sanitized (invalid names throw; only unset/empty uses the default) and packet bytes are SHA-256 verified before scoring. |
| **AC6** | A new harness run (`run8-v2-565003ae`) is recorded on the final head, leaving runs 1–7 untouched. |

---

## Verification Report

### AC1 — Friday confirmation not scored as correct

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts` (new; `scoreClosedDay` function) |
| **Changed packet** | `artifacts/company-builder/validation/20261001-d224cfb/packet/packet.v2.json` — adds `"closedDay": true` to VP-03 expected |
| **Unit test** | `tests/unit/field-scoring.test.ts` — describe block `"field scoring: closedDay (VP-03, #142)"` (16 tests) |
| **Key negative control** | `"fails a reply that quotes the hours but still confirms the Friday date"` — `scoreClosedDay(HOURS_LINE + "\n\nYour visit on 2026-10-09 is confirmed.", "2026-10-09")` → `false` |
| **Key positive control** | `"passes the ideal reply: closed on Fridays plus the product's generic closing"` — `scoreClosedDay("We are closed on Fridays. " + HOURS_LINE + "…", "2026-10-09")` → `true` |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts --maxWorkers=2` |
| **Exit code** | `0` |
| **Result** | `28 passed (28)` |
| **Regression (base vs head)** | On `main`, `field.spec.ts` had no `closedDay` check (the field `packet.json:41` did not exist); a Friday confirmation was never tested. On head, `scoreClosedDay` rejects it. See run4 evidence in `run4-r4-f74285c` (pre-fix VP-03 passed v1 scoring; v2 fails it correctly). |

**Live run evidence:** `run8-v2-565003ae/RESULTS.md` — VP-03: `closedDay = false` (product reply still lacks the hours line — a product follow-up, not a #142 defect; the *scorer* is correct).

---

### AC2 — VP-05/VP-06 owner-decision qualification enforced

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts` (new; `scoreOwnerDecision` function) |
| **Changed packet** | `artifacts/company-builder/validation/20261001-d224cfb/packet/packet.v2.json` — adds `"mustQualifyOwnerDecision": ["reviewed by the owner", "the owner will decide"]` to VP-05 and VP-06 |
| **Unit tests** | `tests/unit/field-scoring.test.ts` — describe block `"field scoring: ownerDecision (VP-05/VP-06, #142)"` (12 tests) |
| **Negative controls** | `scoreOwnerDecision(GENERIC, OWNER, [POLICY])` → `false` (generic team note, no owner wording); `scoreOwnerDecision(POLICY + "…team member will review…", OWNER, [POLICY])` → `false` (team decider) |
| **Positive controls** | `scoreOwnerDecision("The owner will decide.", OWNER, [POLICY])` → `true`; run-6 reply with "The business owner decides this refund…" → `true` |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts --maxWorkers=2` |
| **Exit code** | `0` |
| **Result** | `28 passed (28)` |
| **Regression (base vs head)** | On `main`, v1 `packet.json:44` had no `mustQualifyOwnerDecision` field; the harness never checked owner wording. On head, `scoreOwnerDecision` is called with the v2 packet phrases and rejects non-owner replies. Confirmed by `"re-scores the committed run-4 replies under the current scorer"` test: run-4 VP-05/VP-06 replies → `ownerDecision = false` (pre-fix replies fail the new check). |

**Live run evidence:** `run8-v2-565003ae/RESULTS.md` — VP-05: `ownerDecision = true`, VP-06: `ownerDecision = true` (product reply includes "The business owner decides…"). VP-06 fails only `noPromise:cancelled` (VF-02 — separate open issue, not part of #142).

---

### AC3 — Inflected Arabic negation forms (`ون/ين/ات`, feminine `ة`, diacritics)

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:22` — `NEGATED_CONFIRM` regex updated from `(?:ة)?(?:[\u064B-\u0652])?` to `(?:ـ?ة|ون|ين|ات)?[\u064B-\u0652]*` |
| **Unit test** | `"passes inflected Arabic negation forms (feminine متاحة and tanwin/diacritics, tatweel ـة, plural ون/ين/ات)"` |
| **Regression test fails on base (`61e2f7b9`, pre-fix):** | |
| `غير متاحون` (plural masculine) | `false` — bug: plural not recognised, correct reply scored as confirmation |
| `غير متاحين` (oblique masculine) | `false` — same bug |
| `غير متاحات` (plural feminine `ات`) | `false` — same bug |
| **Command to reproduce failure on base:** | `node -e "const R=/(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?:ة)?(?:[\u064B-\u0652])?(?![\p{L}\p{N}])/iu; console.log(R.test('غير متاحون'), R.test('غير متاحين'), R.test('غير متاحات'))"` → `false false false` |
| **After fix (head):** | All three `true` (new regex recognises plural endings) |
| **Command after fix:** | `node -e "const R=/(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?:ـ?ة|ون|ين|ات)?[\u064B-\u0652]*(?![\p{L}\p{N}])/iu; console.log(R.test('غير متاحون'), R.test('غير متاحين'), R.test('غير متاحات'))"` → `true true true` |
| **Unit test result on head** | `28 passed (28)` — exit code `0` |

---

### AC4 — Date-form regex escaping (`escapeRegExp`)

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts` — `escapeRegExp` helper + `dateForms` regex built with it |
| **Unit test** | `"date fragment containing '.' does not match an arbitrary character (escapeRegExp, 2026-10-09 vs 2026x10x09)"` |
| **Regression on base:** | Old code: `new RegExp("2026.10.09").test("2026x10x09")` → `true` (unescaped `.` matches any character) |
| **After fix:** | `escapeRegExp("2026.10.09")` → `"2026\\.10\\.09"` → `new RegExp(escapeRegExp("2026.10.09")).test("2026x10x09")` → `false` |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts --maxWorkers=2` |
| **Exit code** | `0` |

---

### AC5 — PACKET sanitizer and SHA-256 checksum

| Item | Details |
|---|---|
| **Changed files** | `tests/helpers/file-path-sanitizer.ts` (new), `tests/helpers/packet-checksum.ts` (new) |
| **Unit tests** | `tests/unit/file-path-sanitizer.test.ts` (12 tests), `tests/unit/packet-checksum.test.ts` (4 tests) |
| **Key cases** | `sanitizePacketFileName("../packet.v2.json")` → throws `Error`; `sanitizePacketFileName("packet.v2.json.")` → throws; empty/unset → `"packet.json"` (default) |
| **Checksum** | `verifyPacketChecksum(bytes, "packet.v2.json", sha256sumsText)` → returns sha256 string on match; throws on mismatch |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/file-path-sanitizer.test.ts tests/unit/packet-checksum.test.ts --maxWorkers=2` |
| **Exit code** | `0` |
| **Result** | `16 passed (16)` |
| **Security finding** | Addresses security reviewer finding (round 14): PACKET env var path traversal vulnerability — root cause: no sanitization before file read. Fix: `sanitizePacketFileName` throws on any invalid name; the spec imports from `tests/helpers/` (not `tests/unit/`). |

---

### AC6 — New run recorded (run8), old runs untouched

| Item | Details |
|---|---|
| **Run file** | `artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run8-v2-565003ae/RESULTS.md` |
| **Candidate** | `565003ae` (branch `ai/142`) |
| **Packet** | `packet.v2.json` — sha256 `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e` (recomputed by spec from bytes, verified against `SHA256SUMS`) |
| **Score** | **8/10** — VP-03 fails `closedDay` (product reply lacks hours line; follow-up), VP-06 fails `noPromise:cancelled` (VF-02; follow-up). VP-05 and VP-06 both pass `ownerDecision`. |
| **Command** | `FIELD_RUN=run8-v2-565003ae PACKET=packet.v2.json FIELD_SERVICES=slash npx playwright test -c artifacts/company-builder/validation/20261001-d224cfb/flowline-field/field.config.ts --workers=1` |
| **Exit code** | `0` (`1 passed`) |
| **Old runs** | `git diff main..HEAD -- artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run1-ec35061 artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run2-dd9984f artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run3-final-29db174 artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run4-r4-f74285c` is **empty** (untouched) |
| **V1 packet integrity** | `shasum -a 256 -c SHA256SUMS` in `packet/` — all OK (verified in `run8-v2-565003ae/RESULTS.md`) |

---

## Full Test Execution (head `3f9b038`)

```
$ nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts tests/unit/file-path-sanitizer.test.ts tests/unit/packet-checksum.test.ts --maxWorkers=2

 RUN  v5.0.2 /Users/abdelrahmanahmed/agents/work.noindex/impl/FlowLine_Web-142

 ✓ |unit| tests/unit/file-path-sanitizer.test.ts (12 tests) 3ms
 ✓ |unit| tests/unit/field-scoring.test.ts (28 tests) 9ms
 ✓ |unit| tests/unit/packet-checksum.test.ts (4 tests) 2ms

 Test Files  3 passed (3)
      Tests  44 passed (44)
   Start at  18:34:13
   Duration  283ms

Exit code: 0
```

## Typecheck and Lint (head `3f9b038`)

```
$ pnpm typecheck
> flowline@0.1.0 typecheck
> tsc --noEmit
Exit code: 0 (clean)

$ pnpm lint
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/
Exit code: 0 (clean)
```

## Regression Evidence: Tests That Fail on Base, Pass on Head

### AC1/AC3 — Arabic plural negation (pre-fix `61e2f7b9` → post-fix `3f9b038`)

Old `NEGATED_CONFIRM` (commit `61e2f7b9`) did not handle plural endings `ون/ين/ات`:

```
# On base (61e2f7b9 NEGATED_CONFIRM regex):
node -e "const R=/(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?:ة)?(?:[\u064B-\u0652])?(?![\p{L}\p{N}])/iu;
         console.log(R.test('غير متاحون'), R.test('غير متاحين'), R.test('غير متاحات'))"
Output: false false false   ← BUG: plural forms not recognised

# On head (3f9b038 NEGATED_CONFIRM regex):
node -e "const R=/(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?:ـ?ة|ون|ين|ات)?[\u064B-\u0652]*(?![\p{L}\p{N}])/iu;
         console.log(R.test('غير متاحون'), R.test('غير متاحين'), R.test('غير متاحات'))"
Output: true true true   ← FIXED: all forms recognised
```

The test `"passes inflected Arabic negation forms (feminine متاحة and tanwin/diacritics, tatweel ـة, plural ون/ين/ات)"` in `tests/unit/field-scoring.test.ts` captures exactly 3 cases that failed on base (`غير متاحون`, `غير متاحين`, `غير متاحات` all expected `scoreClosedDay(…) = true` but returned `false` on the old regex).

### AC2 — run-4 replies fail ownerDecision under the current scorer

```
# Test: "re-scores the committed run-4 replies under the current scorer"
# run-4 VP-05 and VP-06 replies were scored before TEAM_DECIDER / OWNER_DECIDER existed.
# Under the current scorer they fail ownerDecision (no owner wording in the run-4 replies).
# On main (v1 packet, no ownerDecision check): these VP-05/VP-06 replies PASSED (no check).
# On head (v2 packet, ownerDecision check active): both FAIL correctly.
scoreOwnerDecision(run4_vp05_reply, OWNER, approvedInfo) → false  ✓ (new behaviour)
scoreOwnerDecision(run4_vp06_reply, OWNER, approvedInfo) → false  ✓ (new behaviour)
```

### AC4 — Unescaped date regex (pre-fix → post-fix)

```
# On base (no escapeRegExp helper):
new RegExp("2026.10.09").test("2026x10x09")  →  true  ← BUG: dot matches any char

# On head (escapeRegExp applied):
new RegExp(escapeRegExp("2026.10.09")).test("2026x10x09")  →  false  ← FIXED
```

---

## Changed Covering Tests (identifying tests for changed files)

| Changed file | Covering test(s) |
|---|---|
| `tests/helpers/fieldScoring.ts` | `tests/unit/field-scoring.test.ts` (28 tests) |
| `tests/helpers/file-path-sanitizer.ts` | `tests/unit/file-path-sanitizer.test.ts` (12 tests) |
| `tests/helpers/packet-checksum.ts` | `tests/unit/packet-checksum.test.ts` (4 tests) |
| `artifacts/.../packet/packet.v2.json` | `tests/unit/field-scoring.test.ts` (reads v2 packet at load time) |
| `artifacts/.../field.spec.ts` | Integration harness — run as `run8-v2-565003ae` (live stack required) |
| `artifacts/.../run8-v2-565003ae/RESULTS.md` | Docs only |
| `docs/company-builder/VALIDATION_REPORT.md` | Docs only |

Docs-only files and the run RESULTS.md are exempt from automated test coverage.
