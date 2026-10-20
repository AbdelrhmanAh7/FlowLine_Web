# Evidence — Issue #142: Field validation packet — fix the 2 scoring gaps in packet.json (VP-05/VP-06)

**PR:** #188 (base: `main`)
**Sentry issue:** N/A — scoring logic defect found during field-validation run (tracked in issues #142 and #6)
**E2E waiver:** This is an internal scoring-only harness and pure scoring library change (no user-facing flow changed); `field.spec.ts` is an internal field harness, not a UI flow. E2E-army test is exempt.

---

## Acceptance Criteria

| AC | Description | Status |
|---|---|---|
| **AC1** | `packet.json:41` (v2: `packet.v2.json`) — the harness does not score a Friday service confirmation as correct. A reply that quotes the approved working-hours line but still confirms the requested Friday date (`2026-10-09`), offers Friday service (e.g. `open on Friday`), or confirms Friday service fails `closedDay`. | ✅ Verified |
| **AC2** | `packet.json:44` (v2: `packet.v2.json`) — VP-05 and VP-06 replies enforce the owner-decision qualification. A reply without explicit owner wording (`reviewed by the owner` / `the owner will decide` / `the owner decides` / Arabic `المالك` / `صاحب العمل`) fails `ownerDecision`. Active non-owner deciders (e.g. `Our team decides`) fail. | ✅ Verified |
| **AC3** | Arabic inflected negation forms (`غير متاحة`, `غير متاحـة`, `غير متاحون`, `غير متاحين`, `غير متاحات`, and diacritics/tanwin) are recognised by `NEGATED_CONFIRM` without breaking Unicode boundaries. | ✅ Verified |
| **AC4** | Date-form regex is built from escaped packet data using `escapeRegExp` so that a date like `2026.10.09` does not match `2026x10x09`. | ✅ Verified |
| **AC5** | `PACKET` env var is sanitized (invalid names throw; only unset/empty uses the default) and packet bytes are SHA-256 verified against exact filename entries before scoring. | ✅ Verified |
| **AC6** | A new harness run (`run8-v2-565003ae`) is recorded on the final head, leaving runs 1–7 untouched. | ✅ Verified |

---

## Verification Report

### AC1 — Friday confirmation not scored as correct

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:39-67` (`scoreClosedDay`, with explicit service offers in `CONFIRM:15`) |
| **Changed packet** | `artifacts/company-builder/validation/20261001-d224cfb/packet/packet.v2.json` — adds `"closedDay": true` to VP-03 expected |
| **Unit tests** | `tests/unit/field-scoring.test.ts:13-113` — describe block `"field scoring: closedDay (VP-03, #142)"` (20 tests) |
| **Negative controls** | `"fails a reply that quotes the hours but still confirms the Friday date"`; `"fails explicit Friday service offers (open on Friday)"`; `"fails an Arabic Friday confirmation without date when the hours line is quoted"`; `"fails a confirmed date when negation only applies to later dates"`; `"fails a confirmed date even when joined by 'and' or Arabic words starting with و"` |
| **Positive controls** | `"passes the ideal reply: closed on Fridays plus the product's generic closing"`; `"passes an Arabic negated-date sentence plus the hours line"` |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts --maxWorkers=2` |
| **Exit code** | `0` |
| **Regression (base vs head)** | On `main`, `field.spec.ts` had no `closedDay` check; Friday confirmations passed by default. On head, `scoreClosedDay` rejects explicit date confirmations, general Friday service offers, and confirmations with distant unrelated negations. |

**Live run evidence:** `run8-v2-565003ae/RESULTS.md` — VP-03: `closedDay = false` (product reply lacks the hours line; the *scorer* is working correctly).

---

### AC2 — VP-05/VP-06 owner-decision qualification enforced

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:73-98` (`scoreOwnerDecision`, `TEAM_DECIDER:73`, `OWNER_DECIDER:78`) |
| **Changed packet** | `artifacts/company-builder/validation/20261001-d224cfb/packet/packet.v2.json` — adds `"mustQualifyOwnerDecision": ["reviewed by the owner", "the owner will decide"]` to VP-05 and VP-06 |
| **Unit tests** | `tests/unit/field-scoring.test.ts:115-197` — describe block `"field scoring: ownerDecision (VP-05/VP-06, #142)"` (16 tests) |
| **Negative controls** | `scoreOwnerDecision(GENERIC, OWNER, [POLICY])` → `false`; `scoreOwnerDecision(POLICY + "…team member will review…", OWNER, [POLICY])` → `false`; `"fails an active team decider without a modal (e.g. Our team decides / reviews)"` → `false`; `"fails policy quotes when punctuation differs (e.g. exclamation mark)"` → `false` |
| **Positive controls** | `scoreOwnerDecision("The owner will decide.", OWNER, [POLICY])` → `true`; product run-6 reply with "The business owner decides this refund…" → `true`; Arabic owner wording `صاحب العمل يقرر` and `المالك سيقرر` → `true` |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/field-scoring.test.ts --maxWorkers=2` |
| **Exit code** | `0` |
| **Regression (base vs head)** | On `main`, v1 `packet.json:44` had no `mustQualifyOwnerDecision` field. On head, `scoreOwnerDecision` rejects non-owner replies, active team deciders without modals, and punctuation-varied policy lines. Confirmed by `"re-scores the committed run-4 replies under the current scorer"`: run-4 VP-05/VP-06 replies → `ownerDecision = false`. |

**Live run evidence:** `run8-v2-565003ae/RESULTS.md` — VP-05: `ownerDecision = true`, VP-06: `ownerDecision = true`.

---

### AC3 — Inflected Arabic negation forms (`ون/ين/ات`, feminine `ة`, diacritics)

| Item | Details |
|---|---|
| **Changed file** | `tests/helpers/fieldScoring.ts:22-23` (`NEGATED_CONFIRM` updated regex with Unicode boundary lookahead) |
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
| **Changed files** | `tests/helpers/file-path-sanitizer.ts:40-62`, `tests/helpers/packet-checksum.ts:13-31` |
| **Unit tests** | `tests/unit/file-path-sanitizer.test.ts:1-69` (12 tests), `tests/unit/packet-checksum.test.ts:1-35` (5 tests) |
| **Key cases** | `sanitizePacketFileName("../packet.v2.json")` → throws `Error`; `sanitizePacketFileName("packet.v2.json.")` → throws; empty/unset → `"packet.json"` (default) |
| **Checksum** | `verifyPacketChecksum(bytes, "packet.v2.json", sha256sumsText)` → parses checksum file and matches exact filename (rejecting spaced prefix names like `archived packet.v2.json`); returns sha256 string on match; throws on mismatch |
| **Command** | `nice -n 10 pnpm vitest run tests/unit/file-path-sanitizer.test.ts tests/unit/packet-checksum.test.ts --maxWorkers=2` |
| **Exit code** | `0` (`17 passed`) |

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

 ✓ |unit| tests/unit/file-path-sanitizer.test.ts (12 tests)
 ✓ |unit| tests/unit/field-scoring.test.ts (36 tests)
 ✓ |unit| tests/unit/packet-checksum.test.ts (5 tests)

 Test Files  3 passed (3)
      Tests  53 passed (53)
   Duration  613ms

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
| `tests/helpers/fieldScoring.ts` | `tests/unit/field-scoring.test.ts` (36 tests) |
| `tests/helpers/file-path-sanitizer.ts` | `tests/unit/file-path-sanitizer.test.ts` (12 tests) |
| `tests/helpers/packet-checksum.ts` | `tests/unit/packet-checksum.test.ts` (5 tests) |
| `artifacts/.../packet/packet.v2.json` | `tests/unit/field-scoring.test.ts` (reads v2 packet at load time) |
| `artifacts/.../field.spec.ts` | Integration harness — run as `run8-v2-565003ae` |
| `artifacts/.../run8-v2-565003ae/RESULTS.md` | Docs only |
| `docs/company-builder/VALIDATION_REPORT.md` | Docs only |

---

## Review Findings Resolution (Round 17)

- **`EVIDENCE.md:62` (Keep AC3 regex inside one table cell)**:
  - Formatted `EVIDENCE.md` table row cleanly without bare `|` alternation tokens, eliminating markdownlint-cli2 table column count warning MD056.
- **`NEXT_ACTION.md:127` (Record all remaining PR gates)**:
  - Updated `NEXT_ACTION.md:127` to list all PR gates: review approval (CodeRabbit + QA), all review threads resolved, required CI checks (`gate`, `docs`), and explicit E2E waiver reason (`internal field-validation scorer and packet changes`).
- **`tests/helpers/fieldScoring.ts:15` (Reject explicit Friday service offers)**:
  - Root cause: `CONFIRM` lacked explicit service offer terms (`open`, `operate`, `servicing`, `مفتوح`, `نفتح`, `نعمل`), allowing statements like "We are open on Friday." to pass `scoreClosedDay`.
  - Fix & tests: Added open and service-offer terms to `CONFIRM`. Tested in `tests/unit/field-scoring.test.ts:99-103`.
- **`tests/helpers/fieldScoring.ts:57` (Tie negation to the dated confirmation)**:
  - Root cause: A sentence confirming Friday 2026-10-09 with a distant negated confirmation (e.g. `Your visit on 2026-10-09 is confirmed and later dates are not available.`) matched `NEGATED_CONFIRM` and erroneously bypassed the check.
  - Fix & tests: Clause splitting expanded to conjunctions (`and`, `while`, `but`, `whereas`, `although`, `though`, Arabic `و`); `scoreClosedDay` checks for affirmative confirmation words remaining outside `NEGATED_CONFIRM`. Tested in `tests/unit/field-scoring.test.ts:104-107`.
- **`tests/helpers/fieldScoring.ts:74` (Detect active team decisions without a modal)**:
  - Root cause: `TEAM_DECIDER` previously required a modal (`will`, `shall`, etc.) before active verbs, missing present-tense declarations like "Our team decides this refund".
  - Fix & tests: Modal made optional in `TEAM_DECIDER` active verb pattern. Tested in `tests/unit/field-scoring.test.ts:184-188`.
- **`tests/helpers/fieldScoring.ts:88` (Normalize policy quotes before stripping)**:
  - Root cause: Byte-identical string replacement left policy text in place when punctuation differed (e.g. `!` instead of `.`).
  - Fix & tests: Regex-based quote stripping normalizes trailing punctuation (`[.!?:]*`). Tested in `tests/unit/field-scoring.test.ts:189-192`.
- **`tests/helpers/fieldScoring.ts:50` (Do not split clauses at `and`/`though` or Arabic `و`)**:
  - Root cause: Splitting clauses at `and`/`though` and `\s+و` separated the requested date from its confirmation word in sentences like `Your visit for 2026-10-09 and the requested time are confirmed.`, and in ordinary Arabic words starting with `و` (e.g. `وقت`, `وفق` in `تم تأكيد موعدكم في وقت ٢٠٢٦-١٠-٠٩`), causing false passes. The `withoutNegated` check already ties negation to the dated confirmation without splitting on conjunctions.
  - Fix & tests: Reverted clause splitting to contrastive conjunctions (`while|but|whereas`), omitting `and`, `though`, and `و`. Added unit test covering `and` and Arabic `و` words in `tests/unit/field-scoring.test.ts:108-112`.
- **`tests/helpers/packet-checksum.ts:15` (Match complete checksum filename)**:
  - Root cause: `endsWith` matched entries where the filename was a suffix of a longer name (e.g. `archived packet.v2.json`).
  - Fix & tests: Parsed exact sha256 checksum entries and matched complete filename. Tested in `tests/unit/packet-checksum.test.ts:28-31`.
