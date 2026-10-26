# Evidence for Issue #435: Fix machine-text RTL directionality in node-config.tsx

**Issue:** #435 fix: node-config.tsx: src/components/builder/node-config.tsx:1: Consider adding explicit dir="ltr" to data elements
**Branch:** ai/435
**PR:** #489
**Base:** main
**Supersedes part of:** #383
**Area:** Builder / RTL Internationalization

---

## Context & Finding Analysis

In FlowLine, Arabic is the default language (`dir="rtl"`), and English is secondary. Per AGENTS.md:
> "Arabic-first: Arabic is the default language (RTL), English secondary... keep emails, URLs, code and credentials LTR."

Within `src/components/builder/node-config.tsx`, several machine-text elements display code references, cron schedule previews, and action field names. These were styled using `className="data"` for monospace rendering:
1. Transform hint: `$steps.<id>`
2. Schedule form: preview of next runs (e.g. `2026-10-27 00:00 · 2026-10-28 00:00`)
3. Action form: required field names (`{r}`)
4. Action form: mapping hint (`$steps.<id>`)

While custom UI components (`Input` and `Textarea` from `src/components/ui/fields.tsx`) automatically apply `dir="ltr"` via the `machineDir(type, className)` helper whenever `className` includes `data`, plain HTML tags (`<code>` and `<span>`) bypass this logic. Without an explicit `dir="ltr"` attribute, they inherit the document's RTL direction, leading to reversed or garbled display of machine text in Arabic contexts.

---

## Root Cause

Raw `<code>` and `<span>` elements in `src/components/builder/node-config.tsx` with `className="data"` lacked explicit `dir="ltr"` attributes, causing the browser to render punctuation, brackets, and alphanumeric tokens using RTL bidirectionality rules.

---

## Changes Made

### 1. `src/components/builder/node-config.tsx`
Added explicit `dir="ltr"` to all 4 plain HTML data elements:
- Line 108 (`transform.json`): `<code className="data" dir="ltr">$steps.&lt;id&gt;</code>`
- Line 236 (`trigger.schedule`): `<span className="data text-hi" dir="ltr">{preview.join(" · ")}</span>`
- Line 562 (`ActionForm` field list): `<code key={r} className="data me-1" dir="ltr">{r}</code>`
- Line 563 (`ActionForm` mapping hint): `<code className="data" dir="ltr">$steps.&lt;id&gt;</code>`

Note: Line 387 already had `dir="ltr"` on its HTTP example `<code>`.

### 2. `tests/unit/node-config-rtl.test.ts`
Added unit regression tests performing static analysis on `src/components/builder/node-config.tsx`:
- `every <code className="data"> has dir="ltr"`: scans for `<code` tags containing `data` in `className` and asserts none lack `dir="ltr"`.
- `every <span className="data ..."> has dir="ltr"`: scans for `<span` tags containing `data` in `className` and asserts none lack `dir="ltr"`.

### 3. `e2e-army/85-sign-in-and-core-flow.e2e.ts`
Added E2E test verifying builder access and root Arabic RTL document direction:
- `@issue-435 AC1: node-config.tsx data elements have dir=ltr for Arabic RTL` tagged with `feat:fl-builder`.

---

## Verification & Acceptance Criteria

| AC | Criterion | Verification Command | Exit Code | Result |
|----|-----------|----------------------|-----------|--------|
| AC1 | All `<code className="data">` tags in `node-config.tsx` specify `dir="ltr"` | `pnpm vitest run tests/unit/node-config-rtl.test.ts` | 0 | ✅ PASS |
| AC2 | All `<span className="data">` tags in `node-config.tsx` specify `dir="ltr"` | `pnpm vitest run tests/unit/node-config-rtl.test.ts` | 0 | ✅ PASS |
| AC3 | Type checking passes with no compiler errors | `pnpm typecheck` | 0 | ✅ PASS |
| AC4 | ESLint passes cleanly across the project | `pnpm lint` | 0 | ✅ PASS |
| AC5 | Evidence secrets scanner passes with no leaks | `pnpm check:evidence` | 0 | ✅ PASS |
| AC6 | Docs check passes with Markdown evidence and update | `node scripts/ci/docs-check.mjs` | 0 | ✅ PASS |

---

## Regression Demonstration

### On Base (without `dir="ltr"` attributes)
Unit test `tests/unit/node-config-rtl.test.ts` detects 4 offending elements:
```
- line 108: <code className="data">$steps.<id></code>
- line 236: <span className="data text-hi">{preview.join(" · ")}</span>
- line 562: <code key={r} className="data me-1">{r}</code>
- line 563: <code className="data">$steps.<id></code>
Result: 2 tests FAIL (exit code 1)
```

### On Head (with explicit `dir="ltr"`)
```bash
pnpm vitest run tests/unit/node-config-rtl.test.ts
```
Output:
```
Test Files  1 passed (1)
     Tests  2 passed (2)
Result: 2 tests PASS (exit code 0)
```
