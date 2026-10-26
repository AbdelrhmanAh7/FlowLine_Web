# Verification Evidence: Issue #463 (docs sync for #421)

**Model:** Gemini 3.8 Flash · **Effort:** Medium · **Why:** Docs-only sync and merge resolution for #421 review feedback; careful verification of git state, bidi Unicode properties, and ar.json source of truth.

- Branch: `ai/463` (base `ai/421`, PR #479)
- Originating Sentry issue: None / N/A (docs-only task; no runtime defect)
- Supersedes part of #445.
- Parent issue: #421. Part 2/2 of #454.

---

## Numbered Acceptance Criteria

- **AC1:** `docs/evidence/421/EVIDENCE.md` quotes the Arabic template label byte-identical to `src/i18n/messages/ar.json` (`"صفقة مكسوبة — عرض سعر Mizano"`) and contains no claim that `→` (U+2192) is appropriate for RTL text.
- **AC2:** `docs/evidence/421/EVIDENCE.md` contains exactly one line explaining that U+2192 is not bidi-mirrored (`Bidi_Mirrored=No`), with no redundant occurrences in code blocks or snippets.
- **AC3:** `docs/evidence/421/EVIDENCE.md` contains exactly one note stating that brand names 'Mizano' and 'Slack' stay in Latin script by convention.
- **AC4:** `docs/implementation/PHASE4_BETA_REPORT.md` line 407 (section for issue #421) quotes the canonical em-dash Arabic label `"صفقة مكسوبة — عرض سعر Mizano"`.
- **AC5:** PR #479 targets base `ai/421` (resolving Claude Opus major finding on add/add conflict) with `docs/evidence/421/EVIDENCE.md` diff appearing as a surgical edit on top of `ai/421`.

---

## ar.json Source of Truth

The issue #463 brief originally referenced the Arabic label with leftwards arrow (`'صفقة مكسوبة ← عرض سعر Mizano'`). However, prerequisite issue #454 (commit `cd7bad12`) settled on `'صفقة مكسوبة — عرض سعر Mizano'` (U+2014, em-dash) as the canonical direction-neutral value in `src/i18n/messages/ar.json`. Per project conventions, `ar.json` is the source of truth, and this PR quotes the canonical em-dash value throughout.

---

## Verification Report

| AC | Requirement | Command / Test | Exit Code | Observed Result |
|---|---|---|---|---|
| **AC1** | String match across ar.json, EVIDENCE.md, and PHASE4_BETA_REPORT.md | `grep -nF 'صفقة مكسوبة — عرض سعر Mizano' src/i18n/messages/ar.json docs/evidence/421/EVIDENCE.md docs/implementation/PHASE4_BETA_REPORT.md` | 0 | Canonical em-dash string present in all target locations |
| **AC1** | Old arrow string absent from EVIDENCE.md | `grep -nF 'صفقة مكسوبة → عرض سعر Mizano' docs/evidence/421/EVIDENCE.md` | 1 | 0 matches (exit code 1) |
| **AC2** | U+2192 bidi note appears on exactly one line | `grep -c 'U+2192' docs/evidence/421/EVIDENCE.md` | 0 | Exactly 1 line matches: `> **Bidi note:** U+2192 (→) is not bidi-mirrored...` |
| **AC3** | Brand-name convention note | `grep -n "Brand-name convention" docs/evidence/421/EVIDENCE.md` | 0 | Exactly 1 match: `> **Brand-name convention:** Brand names 'Mizano' and 'Slack' are intentionally kept in Latin script by convention.` |
| **AC4** | PHASE4_BETA_REPORT.md line 407 synced | `sed -n '407p' docs/implementation/PHASE4_BETA_REPORT.md` | 0 | Line 407 contains `"صفقة مكسوبة — عرض سعر Mizano"` |
| **AC5** | PR base targeted to ai/421 & clean diff | `git diff origin/ai/421...HEAD --stat` | 0 | `docs/evidence/421/EVIDENCE.md` is modified (+12/-12 lines) on top of base |

### Command Evidence Logs

#### 1. Canonical String Match (AC1 & AC4)
```bash
$ grep -nF 'صفقة مكسوبة — عرض سعر Mizano' src/i18n/messages/ar.json docs/evidence/421/EVIDENCE.md docs/implementation/PHASE4_BETA_REPORT.md
src/i18n/messages/ar.json:364:      "name": "صفقة مكسوبة — عرض سعر Mizano",
docs/evidence/421/EVIDENCE.md:13:In PR #410 (parent #409), E2E test scenarios in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` asserted the presence of a gallery card with `data-testid="template-deal-won-mizano-quote"`, Arabic template title `"صفقة مكسوبة — عرض سعر Mizano"`, and canvas node labelled `"Mizano — Create customer (needs approval)"`.
docs/evidence/421/EVIDENCE.md:43:- **AC2:** When the user locale is Arabic (`fl_locale=ar`), document direction is `rtl`, the template card renders Arabic title `"صفقة مكسوبة — عرض سعر Mizano"` using an em-dash (`—`, U+2014), and translations for all nodes exist under `designTemplates.deal-won-mizano-quote` in `src/i18n/messages/ar.json`.
docs/evidence/421/EVIDENCE.md:56:| **AC2** | Arabic localization and RTL consistency | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` `@issue-421 AC2` + `tests/unit/i18n.test.ts` | 0 | `dir="rtl"` asserted; title `"صفقة مكسوبة — عرض سعر Mizano"` without arrows |
docs/implementation/PHASE4_BETA_REPORT.md:407:3. Added `designTemplates.deal-won-mizano-quote` dictionaries to both `src/i18n/messages/en.json` and `src/i18n/messages/ar.json`, ensuring Arabic node labels consistently use em-dash (`—`, U+2014) rather than hyphen (`-`, U+002D) for `customer`, `quote`, and `notify` (`"صفقة مكسوبة — عرض سعر Mizano"`).
docs/implementation/PHASE4_BETA_REPORT.md:427:- `localTemplates.deal-won-mizano-quote.name` in `src/i18n/messages/ar.json:364` is now `"صفقة مكسوبة — عرض سعر Mizano"`: the right-pointing arrow (`→`, U+2192) is replaced by an em-dash (`—`, U+2014), which has no direction and reads correctly in RTL. The description (`ar.json:365`) got the same change.
```

#### 2. Absence of Old Arrow String in EVIDENCE.md (AC1)
```bash
$ grep -nF 'صفقة مكسوبة → عرض سعر Mizano' docs/evidence/421/EVIDENCE.md
(exit code 1 - no matches)
```

#### 3. Bidi Note Exact Line Count (AC2)
```bash
$ grep -c 'U+2192' docs/evidence/421/EVIDENCE.md
1
```

#### 4. Brand-Name Note Verification (AC3)
```bash
$ grep -n "Brand-name convention" docs/evidence/421/EVIDENCE.md
23:> **Brand-name convention:** Brand names 'Mizano' and 'Slack' are intentionally kept in Latin script by convention.
```

---

## Changed Covering Tests

Docs/chores exempt: this task is documentation-only, synchronizing verification reports and ledgers with the canonical localization catalogues.

---

## Skills Used

- `model-effort-routing`: Explicitly recorded model and effort.
- `receiving-code-review`: Analyzed review findings from Claude Opus (base branch conflict) and groq-oss (single U+2192 occurrence), verified requirements against code and git state, and implemented targeted resolution.
- `systematic-debugging`: Traced localization history from #340 through #454 to identify canonical string definitions across `localTemplates` and `designTemplates`.
- `verification-before-completion`: Executed fresh verification commands with exact exit codes and outputs documented before making completion claims.
