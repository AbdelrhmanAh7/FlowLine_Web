# Evidence for Issue #370: Follow-up from #366: non-blocking review findings

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|--------------|
| AC1 | E2E test uses diacritic-resilient regex pattern for Arabic text with optional shaddah (U+0651) | `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` line 54 - regex `/إنشاء عرض أسعار مسودّ?ة/` matches both مع and بدون shaddah |
| AC2 | Evidence documentation uses normalized Arabic text without shaddah | `docs/evidence/364/EVIDENCE.md` line 19 - "إنشاء عرض أسعار مسودة" (canonical un-diacritized form) |
| AC3 | RTL layout assertions preserved in E2E test | Same test - `document.documentElement.dir === "rtl"` assertion unchanged |

## Changes Made

### 1. E2E Test Fix (`e2e-army/147-mizano-create-customer-and-quote.e2e.ts`)

Updated the Arabic assertions for "Create draft quote" action:

- **Line 51** (agent.assert): Asserts real expected Arabic text `"إنشاء عرض أسعار مسودّة"`
- **Line 54** (expect): Uses diacritic-tolerant regex pattern `screen.getByText(/إنشاء عرض أسعار مسودّ?ة/)`

The regex `/إنشاء عرض أسعار مسودّ?ة/` matches both:
- `إنشاء عرض أسعار مسودّة` (with shaddah U+0651 on د)
- `إنشاء عرض أسعار مسودة` (without shaddah)

This ensures cross-platform compatibility across different font renderers and headless CI environments.

Added comment on line 49: `// Verify Arabic action titles (diacritic-resilient matching for shaddah U+0651)`

### 2. Evidence Documentation Update (`docs/evidence/364/EVIDENCE.md`)

- **Line 19**: Updated from `"إنشاء عرض أسعار مسودّة"` to `"إنشاء عرض أسعار مسودة"` (normalized canonical form without combining diacritic)

## Verification Commands

```bash
# Lint (passes)
pnpm lint

# Typecheck (passes)
pnpm typecheck

# Verify changes
git diff e2e-army/147-mizano-create-customer-and-quote.e2e.ts
git diff docs/evidence/364/EVIDENCE.md
```

## Diff Summary

```
 docs/evidence/364/EVIDENCE.md                      |  2 +-
 docs/evidence/370/EVIDENCE.md                      | 67 ++++++++++++++++++++++
 .../147-mizano-create-customer-and-quote.e2e.ts    |  6 +-
 3 files changed, 71 insertions(+), 4 deletions(-)
```

## Related Files

- `src/i18n/messages/ar.json` - Arabic translations for Mizano (line 1348, contains shaddah - unchanged as implementation source)
- `src/i18n/messages/en.json` - English translations for Mizano
- `src/integrations/providers/mizano.ts` - Mizano provider definition
- `src/i18n/integration-text.ts` - Translation functions for integration catalog

## Commit

- Pending: fix(i18n): normalize Arabic diacritics in Mizano E2E test and evidence (issue #370)

## Supersedes

Follow-up from PR #366 (issue #364) - addresses P2/P3 reviewer findings