# Evidence for Issue #453

## Summary
Fixed the Arabic translation for the Mizano template's customer node label to use em-dash (—) instead of regular hyphen (-), and added regression tests.

## Acceptance Criteria
- **AC1**: The Mizano template's Arabic customer node label uses em-dash (—) not regular hyphen (-)
- **AC2**: Unit tests verify em-dash consistency in both Arabic and English catalogues
- **AC3**: E2E test verifies the template gallery displays the correct Arabic label in RTL mode

## Verification

### Unit Tests (vitest)
```bash
pnpm vitest run tests/unit/i18n.test.ts --maxWorkers=2
```
**Result**: 25 tests passed (including 3 new tests for #453)

New tests added:
1. `src/i18n/messages/ar.json: localTemplates.deal-won-mizano-quote.nodes.customer uses em-dash (—) and strictly no regular hyphen (-)`
2. `src/i18n/messages/en.json: localTemplates.deal-won-mizano-quote.nodes.customer uses em-dash (—) and strictly no regular hyphen (-)`
3. `all Mizano template node labels use em-dash (—) and not regular hyphen (-)`

### TypeCheck
```bash
pnpm typecheck
```
**Result**: Exit code 0 (passed)

### Lint
```bash
pnpm lint
```
**Result**: Exit code 0 (passed)

### E2E Test (e2e-army)
Test file: `e2e-army/166-mena-template.e2e.ts`
Test name: `@issue-453 AC1: the Mizano template's Arabic customer node label uses em-dash (—) not regular hyphen (-)`
Tags: `feat:fl-templates`, `feat:fl-i18n-rtl`, `lvl:ui`

The test:
1. Sets Arabic locale (`fl_locale=ar`)
2. Opens the templates gallery
3. Verifies RTL direction (`document.documentElement.dir === "rtl"`)
4. Finds the Mizano template card (`template-deal-won-mizano-quote`)
5. Asserts the customer node label contains em-dash: `"Mizano \u2014 إنشاء عميل (يحتاج موافقة)"`
6. Asserts no regular hyphen: `not.toContain("Mizano - إنشاء عميل")`

## Files Changed
- `e2e-army/166-mena-template.e2e.ts` - Added e2e-army test for Arabic RTL template gallery
- `tests/unit/i18n.test.ts` - Added 3 unit tests for em-dash consistency
- `docs/evidence/453/EVIDENCE.md` - This evidence file

## Regression Demonstration
The unit tests would fail on a base commit where the em-dash was replaced with a regular hyphen:
- Expected: `"Mizano — إنشاء عميل (يحتاج موافقة)"`
- Would fail with: `"Mizano - إنشاء عميل (يحتاج موافقة)"`

The tests strictly check for:
- Presence of em-dash (U+2014)
- Absence of ASCII hyphen-minus (U+002D)
- Absence of en-dash (U+2013)
- Absence of any hyphen-like characters

## Related Issues
- Supersedes part of #445 (PR #445 finding: `src/i18n/messages/ar.json:2371`)
- Parent issue: #421
- Related to em-dash consistency work in #434, #383

## Commit SHAs
- E2E test: `9defc4a3` - `test(e2e-army): @issue-453 AC1 Mizano template Arabic customer node label uses em-dash`
- Unit tests: `5a594681` - `test(unit): @issue-453 AC1 Mizano template em-dash consistency in localTemplates`