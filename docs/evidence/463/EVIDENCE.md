# Verification Evidence: Issue #463 (docs sync for #421)

**Model:** Claude Sonnet 4.6 Thinking · **Effort:** Medium · **Why:** Docs-only sync; careful verification of git state and ar.json source of truth required.

- Branch: `ai/463`
- Originating Sentry issue: None / N/A (docs-only task; no runtime defect)
- Supersedes part of #445.
- Parent issue: #421. Part 2/2 of #454.

---

## Acceptance Criteria

- **AC1:** `docs/evidence/421/EVIDENCE.md` quotes the Arabic template label byte-identical to `src/i18n/messages/ar.json` and contains no claim that `→` (U+2192) is appropriate for RTL text.
- **AC2:** `docs/evidence/421/EVIDENCE.md` contains exactly one line explaining that U+2192 is not bidi-mirrored (Unicode Bidi_Mirrored=No).
- **AC3:** `docs/evidence/421/EVIDENCE.md` contains exactly one note stating that 'Mizano' and 'Slack' stay in Latin script by convention.
- **AC4:** The change is docs-only: exactly 1–2 files changed, all under `docs/`.
- **AC5:** `docs/implementation/PHASE4_BETA_REPORT.md` section for issue #454 (lines ~413–418) already reflects the em-dash; no changes needed there.

---

## ar.json Discrepancy

The issue #463 brief specified the canonical Arabic label as `'صفقة مكسوبة ← عرض سعر Mizano'` (U+2190, leftwards arrow). However, commit `cd7bad12` (#454, part 1/2) went through multiple iterations and settled on `'صفقة مكسوبة — عرض سعر Mizano'` (U+2014, em-dash). Per the spec, **ar.json is the source of truth**. This PR uses the em-dash value. Logged to `state/rnd.json` as required.

---

## Verification Report

### AC1 — String match: ar.json vs EVIDENCE.md (grep commands and output)

**Verification command:**
```
grep -nF 'صفقة مكسوبة — عرض سعر Mizano' src/i18n/messages/ar.json docs/evidence/421/EVIDENCE.md docs/implementation/PHASE4_BETA_REPORT.md
```

**Output (exit code 0):**
```
src/i18n/messages/ar.json:364:      "name": "صفقة مكسوبة — عرض سعر Mizano",
docs/evidence/421/EVIDENCE.md:9:> **ar.json discrepancy note (issue #463):** ... settled on 'صفقة مكسوبة — عرض سعر Mizano' ...
docs/evidence/421/EVIDENCE.md:15:... Arabic template title "صفقة مكسوبة — عرض سعر Mizano" ...
docs/evidence/421/EVIDENCE.md:45:... renders Arabic title "صفقة مكسوبة — عرض سعر Mizano" ...
docs/evidence/421/EVIDENCE.md:58:... title "صفقة مكسوبة — عرض سعر Mizano" with em-dash ...
docs/implementation/PHASE4_BETA_REPORT.md:416:... is now "صفقة مكسوبة — عرض سعر Mizano" ...
```

**Old `→` string absent from EVIDENCE.md:**
```
grep -nF 'صفقة مكسوبة → عرض سعر Mizano' docs/evidence/421/EVIDENCE.md
```
Exit code: 1 (no matches). ✅

### AC2 — U+2192 bidi note

```
grep -c 'U+2192' docs/evidence/421/EVIDENCE.md
```
Output: `1` ✅

### AC3 — Brand-name convention note

```
grep -n "Brand-name convention\|Mizano.*Slack.*Latin\|brand" docs/evidence/421/EVIDENCE.md
```
Output: 1 match — `> **Brand-name convention:** 'Mizano' and 'Slack' are intentionally kept in Latin script by convention; they are not translated or transliterated into Arabic.` ✅

### AC4 — Docs-only change

```
git diff --stat HEAD
```
Output: 1 new file: `docs/evidence/421/EVIDENCE.md` (+ `docs/evidence/463/EVIDENCE.md` for this PR). All under `docs/`. ✅

### AC5 — PHASE4_BETA_REPORT already correct

PHASE4_BETA_REPORT.md line 416 already states `"صفقة مكسوبة — عرض سعر Mizano"` (em-dash), matching ar.json. No change needed. Line 381 is a historical quote in the `## i18n: RTL arrow consistency (issue #340)` section describing what that PR changed — historical accuracy is preserved. ✅

---

## E2E Note

This is a docs-only PR (no code, tests, CI, or locale changes). Per the e2e-army rule: "docs / CI / tests / assets-only PRs get `e2e-army` = success 'n/a'." No e2e-army test is added.

---

## Skills Used

- `model-effort-routing`: Model and effort stated above.
- `systematic-debugging`: Traced ar.json through multiple commits to find the actual shipped value.
- `verification-before-completion`: All claims backed by fresh grep commands run in this session.
