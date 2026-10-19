# Evidence — Issue #142: Field validation packet — fix the 2 scoring gaps in packet.json (VP-05/VP-06)

**PR:** #188 (base: `main`)
**Sentry issue:** N/A — scoring logic defect found during field-validation run (tracked in issues #142 and #6)
**E2E waiver:** This is an internal scoring-only harness and pure scoring library change (no user-facing flow changed); `field.spec.ts` is an internal field harness, not a UI flow. E2E-army test is exempt.

---

## Acceptance Criteria

| AC | Description | Status |
|---|---|---|
| **AC1** | `packet.json:41` (v2: `packet.v2.json`) — the harness does not score a Friday service confirmation as correct. A reply that quotes the approved working-hours line but still confirms the requested Friday date (`2026-10-09`) or confirms Friday service fails `closedDay`. | ✅ Verified |
| **AC2** | `packet.json:44` (v2: `packet.v2.json`) — VP-05 and VP-06 replies enforce the owner-decision qualification. A reply without explicit owner wording (`reviewed by the owner` / `the owner will decide` / `the owner decides` / Arabic `المالك` / `صاحب العمل`) fails `ownerDecision`. | ✅ Verified |
| **AC3** | Arabic inflected negation forms (`غير متاحة`, `غير متاحـة`, `غير متاحون`, `غير متاحين`, `غير متاحات`, and diacritics/tanwin) are recognised by `NEGATED_CONFIRM` without breaking Unicode boundaries. | ✅ Verified |
| **AC4** | Date-form regex is built from escaped packet data using `escapeRegExp` so that a date like `2026.10.09` does not match `2026x10x09`. | ✅ Verified |
| **AC5** | `PACKET` env var is sanitized (invalid names throw; only unset/empty uses the default) and packet bytes are SHA-256 verified before scoring. | ✅ Verified |
| **AC6** | A new harness run (`run8-v2-565003ae`) is recorded on the final head, leaving runs 1–7 untouched. | ✅ Verified |

---

## Verification Report

### AC1 — Friday confirmation not scored as correct

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:39-67` (`scoreClosedDay` function) |
| **Changed packet** | `artifacts/company-builder/validation/20261001-d224cfb/packet/packet.v2.json` — adds `"closedDay": true` to VP-03 expected |
| **Unit tests** | `tests/unit/field-scoring.test.ts:13-99` — describe block `"field scoring: closedDay (VP-03, #142)"` (17 tests) |
| **Negative controls** | `"fails a reply that quotes the hours but still confirms the Friday date"` — `scoreClosedDay(HOURS_LINE + "\n\nYour visit on 2026-10-09 is confirmed.", "2026-10-09")` → `false`; `"fails an Arabic Friday confirmation without date when the hours line is quoted"` → `false` |
| **Positive controls** | `"passes the ideal reply: closed on Fridays plus the product's generic closing"` — `scoreClosedDay("We are closed on Fridays. " + HOURS_LINE + "…", "2026-10-09")` → `true`; `"passes an Arabic negated-date sentence plus the hours line"` → `true` |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts --maxWorkers=2` |
| **Exit code** | `0` |
| **Regression (base vs head)** | On `main`, `field.spec.ts` had no `closedDay` check (field `packet.json:41` did not exist); Friday confirmations were never tested and passed by default. On head, `scoreClosedDay` rejects them. |

**Live run evidence:** `run8-v2-565003ae/RESULTS.md` — VP-03: `closedDay = false` (product reply lacks the hours line; the *scorer* is working correctly).

---

### AC2 — VP-05/VP-06 owner-decision qualification enforced

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:86-91` (`scoreOwnerDecision` function, with `TEAM_DECIDER:73` and `OWNER_DECIDER:77`) |
| **Changed packet** | `artifacts/company-builder/validation/20261001-d224cfb/packet/packet.v2.json` — adds `"mustQualifyOwnerDecision": ["reviewed by the owner", "the owner will decide"]` to VP-05 and VP-06 |
| **Unit tests** | `tests/unit/field-scoring.test.ts:101-173` — describe block `"field scoring: ownerDecision (VP-05/VP-06, #142)"` (14 tests) |
| **Negative controls** | `scoreOwnerDecision(GENERIC, OWNER, [POLICY])` → `false` (generic team note, no owner wording); `scoreOwnerDecision(POLICY + "…team member will review…", OWNER, [POLICY])` → `false` (team decider); `"fails an Arabic non-owner decider even when policy line is quoted"` → `false` |
| **Positive controls** | `scoreOwnerDecision("The owner will decide.", OWNER, [POLICY])` → `true`; product run-6 reply with "The business owner decides this refund…" → `true`; Arabic owner wording `صاحب العمل يقرر` and `المالك سيقرر` → `true` |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts --maxWorkers=2` |
| **Exit code** | `0` |
| **Regression (base vs head)** | On `main`, v1 `packet.json:44` had no `mustQualifyOwnerDecision` field; the harness never checked owner wording. On head, `scoreOwnerDecision` rejects non-owner replies. Confirmed by `"re-scores the committed run-4 replies under the current scorer"`: run-4 VP-05/VP-06 replies → `ownerDecision = false` (pre-fix replies fail the new check). |

**Live run evidence:** `run8-v2-565003ae/RESULTS.md` — VP-05: `ownerDecision = true`, VP-06: `ownerDecision = true`.

---

### AC3 — Inflected Arabic negation forms (`ون/ين/ات`, feminine `ة`, diacritics)

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:22-23` — `NEGATED_CONFIRM` regex: `(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?:ـ?ة|ون|ين|ات)?[\u064B-\u0652]*(?![\p{L}\p{N}])/iu` |
| **Unit test** | `tests/unit/field-scoring.test.ts:55-64` — `"passes inflected Arabic negation forms (feminine متاحة and tanwin/diacritics, tatweel ـة, plural ون/ين/ات)"` |
| **Regression on base (`61e2f7b9`):** | `غير متاحون`, `غير متاحين`, `غير متاحات` returned `false` (bug: plural endings broke boundary lookahead) |
| **After fix (head):** | All plural forms return `true` |
| **Exit code** | `0` |

---

### AC4 — Date-form regex escaping (`escapeRegExp`)

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:26-28` (`escapeRegExp` helper applied to date regex at lines 44-46) |
| **Unit test** | `tests/unit/field-scoring.test.ts:83-92` — `"date fragment containing '.' does not match an arbitrary character (escapeRegExp, 2026-10-09 vs 2026x10x09)"` |
| **Regression on base:** | `new RegExp("2026.10.09").test("2026x10x09")` → `true` (unescaped `.` acts as wildcard) |
| **After fix:** | `new RegExp(escapeRegExp("2026.10.09")).test("2026x10x09")` → `false` |
| **Exit code** | `0` |

---

### AC5 — PACKET sanitizer and SHA-256 checksum

| Item | Details |
|---|---|
| **Changed files** | `tests/helpers/file-path-sanitizer.ts:40-62`, `tests/helpers/packet-checksum.ts:13-22` |
| **Unit tests** | `tests/unit/file-path-sanitizer.test.ts:1-69` (12 tests), `tests/unit/packet-checksum.test.ts:1-27` (4 tests) |
| **Key cases** | `sanitizePacketFileName("../packet.v2.json")` → throws `Error`; `sanitizePacketFileName("packet.v2.json.")` → throws; empty/unset → `"packet.json"` (default) |
| **Checksum** | `verifyPacketChecksum(bytes, "packet.v2.json", sha256sumsText)` → returns sha256 string on match; throws on mismatch |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/file-path-sanitizer.test.ts tests/unit/packet-checksum.test.ts --maxWorkers=2` |
| **Exit code** | `0` (`16 passed`) |

---

### AC6 — New run recorded (run8), old runs untouched

| Item | Details |
|---|---|
| **Run file** | `artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run8-v2-565003ae/RESULTS.md` |
| **Candidate** | `565003ae` (branch `ai/142`) |
| **Packet** | `packet.v2.json` — sha256 `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e` |
| **Score** | **8/10** — VP-03 fails `closedDay` (product reply lacks hours line; follow-up), VP-06 fails `noPromise:cancelled` (VF-02; follow-up). VP-05 and VP-06 both pass `ownerDecision`. |
| **Old runs** | `git diff main..HEAD -- artifacts/company-builder/validation/20261001-d224cfb/flowline-field/run1-ec35061 ... run4-r4-f74285c` is **empty** (untouched) |
| **V1 integrity** | `shasum -a 256 -c SHA256SUMS` in `packet/` — all OK |

---

## Full Test Execution

```
$ nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts tests/unit/file-path-sanitizer.test.ts tests/unit/packet-checksum.test.ts --maxWorkers=2

 ✓ |unit| tests/unit/file-path-sanitizer.test.ts (12 tests) 3ms
 ✓ |unit| tests/unit/field-scoring.test.ts (31 tests) 13ms
 ✓ |unit| tests/unit/packet-checksum.test.ts (4 tests) 2ms

 Test Files  3 passed (3)
      Tests  47 passed (47)
   Duration  280ms

Exit code: 0
```

## Typecheck and Lint

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

---

## Changed Covering Tests

| Changed Implementation File | Covering Test File |
|---|---|
| `tests/helpers/fieldScoring.ts` | `tests/unit/field-scoring.test.ts` (31 tests) |
| `tests/helpers/file-path-sanitizer.ts` | `tests/unit/file-path-sanitizer.test.ts` (12 tests) |
| `tests/helpers/packet-checksum.ts` | `tests/unit/packet-checksum.test.ts` (4 tests) |
| `artifacts/.../packet/packet.v2.json` | `tests/unit/field-scoring.test.ts` (reads v2 packet at load time) |
| `artifacts/.../field.spec.ts` | Integration harness — run as `run8-v2-565003ae` |
| `artifacts/.../run8-v2-565003ae/RESULTS.md` | Docs only |
| `docs/company-builder/VALIDATION_REPORT.md` | Docs only |

---

## Review Findings Resolution (Round 16)

- **Finding `919cc5f2b61b` (Unit tests for scoring functions)**:
  - Root cause: Scorer predicates required explicit unit test verification with both positive and negative controls across English and Arabic variants.
  - Fix & tests: Implemented in `tests/helpers/fieldScoring.ts:39-91`. Covered by 31 unit tests in `tests/unit/field-scoring.test.ts`:
    - `scoreClosedDay`: 17 tests (lines 13-99) including positive controls (ideal reply line 46, Arabic negation line 50, inflected plurals line 55) and negative controls (Friday date confirmation line 33, contradictory sentence line 38, Arabic confirmation line 65, Arabic Friday confirmation line 96).
    - `scoreOwnerDecision`: 14 tests (lines 101-173) including positive controls (owner will decide line 107, product sentence line 138, Arabic owner wording line 165) and negative controls (generic note line 104, policy-only quote line 110, team decider line 126, Arabic team decider line 170).

- **Finding `695cc5695ad6` (Scoring gaps AC1 and AC2 implemented)**:
  - Root cause: VP-03 did not check for Friday working hours / rejected confirmations (`closedDay`), and VP-05/VP-06 did not enforce owner-decision attribution (`ownerDecision`).
  - Fix & tests: `tests/helpers/fieldScoring.ts:39-67` (`scoreClosedDay`) and `tests/helpers/fieldScoring.ts:86-91` (`scoreOwnerDecision`). Validated against `packet.v2.json` in unit tests (31 passed) and live recorded in `run8-v2-565003ae` (8/10 score).
