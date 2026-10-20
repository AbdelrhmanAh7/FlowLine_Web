# Evidence — Issue #142: Field validation packet — fix the 2 scoring gaps in packet.json (VP-05/VP-06)

**PR:** #188 (base: `main`)  
**Originating Sentry issue:** N/A — scoring logic defect identified during field-validation runs (tracked in GitHub issues #142 and #6).  
**E2E waiver:** `E2E: not needed — internal field-validation scorer and packet changes`. This is an internal scoring harness and pure utility library change; `field.spec.ts` is an internal field harness, not a user-facing UI flow.

---

## Acceptance Criteria

| AC | Description | Status |
|---|---|---|
| **AC1** | `packet.json:41` (v2: `packet.v2.json`) — The harness does not score a Friday service confirmation as correct. A reply that quotes the approved working-hours line but still confirms the requested Friday date (`2026-10-09`), offers Friday service (e.g. `open on Friday`), or confirms Friday service fails `closedDay`. | ✅ Verified |
| **AC2** | `packet.json:44` (v2: `packet.v2.json`) — VP-05 and VP-06 replies enforce the owner-decision qualification. A reply without explicit owner wording (`reviewed by the owner`, `the owner will decide`, `the owner decides`, or Arabic `المالك` / `صاحب العمل`) fails `ownerDecision`. Active non-owner deciders (e.g. `Our team decides`) fail. | ✅ Verified |
| **AC3** | Inflected Arabic negation forms (`غير متاحة`, `غير متاحـة`, `غير متاحون`, `غير متاحين`, `غير متاحات`, and diacritics/tanwin) are recognised by `NEGATED_CONFIRM` without breaking Unicode boundaries. | ✅ Verified |
| **AC4** | Date-form regex is built from escaped packet data using `escapeRegExp` so that a date like `2026.10.09` does not match `2026x10x09`. | ✅ Verified |
| **AC5** | `PACKET` env var is sanitized (invalid names throw `Error`; only unset/empty uses default `packet.json`) and packet bytes are SHA-256 verified against exact filename entries in `SHA256SUMS` before scoring. | ✅ Verified |
| **AC6** | A new harness run (`run8-v2-565003ae`) is recorded on the final head, leaving historical runs 1–7 untouched. | ✅ Verified |

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

Regex definition (fenced to preserve markdown table columns):
```regex
/\bnot\s+(?:available|confirmed|booked|scheduled|reserved)\b|\bunavailable\b|\bcannot\s+(?:book|schedule|reserve)\b|(?:^|\s)(?:لا|غير)\s+(?:متاح|مؤكد|محجوز|محدد)(?:ـ?ة|ون|ين|ات)?[\u064B-\u0652]*(?![\p{L}\p{N}])/iu
```

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
   Duration  443ms

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

## Review Findings Resolution (Rounds 17 & 18)

- **Finding 9085fbf05f58 (`packet.json:41` / `packet.v2.json`, Friday service scoring)**:
  - Root cause: `CONFIRM` regex lacked explicit service offer terms (`open`, `operate`, `servicing`, `مفتوح`, `نفتح`, `نعمل`), which allowed replies stating "We are open on Friday." alongside the working hours line to erroneously pass `scoreClosedDay`.
  - Fix: In `tests/helpers/fieldScoring.ts:15-16`, expanded `CONFIRM` with explicit service terms. In `tests/helpers/fieldScoring.ts:45-56`, tied negation to dated confirmations and avoided splitting clauses across conjunctions like `and`/`و`.
  - Verification: `tests/unit/field-scoring.test.ts:99-103` (`"fails explicit Friday service offers (open on Friday)"`) and `tests/unit/field-scoring.test.ts:108-112` (`"fails a confirmed date even when joined by 'and' or Arabic words starting with و"`).
- **Finding 078ec2941c78 (General / Owner decision qualification)**:
  - Root cause: Missing owner decision qualification enforcement and failure to reject non-owner active deciders.
  - Fix: In `tests/helpers/fieldScoring.ts:73-98`, implemented `scoreOwnerDecision` using `TEAM_DECIDER` and `OWNER_DECIDER` with punctuation normalization across approved quotes.
  - Verification: `tests/unit/field-scoring.test.ts:115-197` (16 tests covering owner reviews, non-owner deciders, policy quote variations).
- **CodeRabbit `EVIDENCE.md:62` (Unescaped alternation separators in table)**:
  - Formatted AC3 regex into a fenced code block below the markdown table to prevent table parsing anomalies.
- **CodeRabbit `NEXT_ACTION.md:127` (PR gates)**:
  - Documented automerge gates: review approval (CodeRabbit + QA), all review threads resolved, required checks (`gate`, `docs`) passing, and explicit E2E waiver reason (`internal field-validation scorer and packet changes`).
- **Hub rule 2026-10-20 (Process files)**:
  - Process evidence moved to dedicated per-issue path `docs/evidence/142/EVIDENCE.md`.
