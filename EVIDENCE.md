# Evidence for Issue #180 - Round 20 QA Fix

## Summary
Fixed all three QA findings from round 20 (head d95b8c9) by restoring the platform-admin gate, updating the e2e test, and correcting documentation.

## Changes Made

### 1. Restore Platform-Admin Gate in `src/app/admin/copy/page.tsx`
**File:** `src/app/admin/copy/page.tsx`
**Lines:** 1-16

**Before:**
```tsx
import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { CopyEditor } from "./copy-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("platformAdmin.copyEditor.title"), robots: { index: false, follow: false } };
}

export default async function CopyPage() {
  return <CopyEditor />;
}
```

**After:**
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { CopyEditor } from "./copy-editor";
import { platformAdminOrNull } from "@/server/platform-access";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("platformAdmin.copyEditor.title"), robots: { index: false, follow: false } };
}

export default async function CopyPage() {
  // Platform-admin gate (MUST 1–2): hide the panel from non-admins via notFound()
  if (!(await platformAdminOrNull())) {
    return notFound();
  }
  return <CopyEditor />;
}
```

**Impact:** Non-admin visitors now receive a 404 page instead of seeing the editor shell, restoring the platform-admin trust boundary (MUST 1–2).

### 2. Update E2E Test
**File:** `e2e-army/180-admin-copy-errors.e2e.ts`
**Lines:** 40-89

**Changes:**
- Added check for non-admin account receiving 404 on page load (lines 72-75)
- Kept platform-admin session check for page loading (lines 60-70)
- Retained existing API mutation checks (lines 77-87)

**New Test Flow:**
1. Sign in as platform admin → assert `/admin/copy` returns 200 with RTL/LTR title
2. Sign in as non-admin → assert `/admin/copy` returns 404 (page gate enforced)
3. Sign in as platform admin → assert API mutation returns 404 with clean JSON error

### 3. Update Documentation
**Files:**
- `docs/DEVELOPER_GUIDE.md` (line 27)
- `docs/implementation/PROGRESS.md` (line 72)

**Changes:**
- Clarified page gate enforcement: "The page (`src/app/admin/copy/page.tsx`) enforces a platform-admin gate (`platformAdminOrNull()` returning `null` → `notFound()`), so non-admins receive a 404 page rather than seeing the editor shell"
- Updated PROGRESS.md to reflect restored gate
- Removed stray blank line before "## Components and design"

### 4. Update Unit Test
**File:** `tests/unit/admin/copy/copy-page.test.ts`
**Lines:** 1-14

**Changes:**
- Mocked `platformAdminOrNull()` to return a test admin context
- Ensures the test passes with the restored gate

## Verification

### Typecheck
```bash
pnpm typecheck
# ✓ No errors
```

### Lint
```bash
pnpm lint
# ✓ No errors
```

### Unit Tests
```bash
pnpm vitest run tests/unit/admin/copy/ --maxWorkers=2
# Test Files  3 passed (3)
# Tests  40 passed (40)
```

### Changed Files
```
docs/DEVELOPER_GUIDE.md                 |  3 +--
docs/implementation/PROGRESS.md         |  2 +-
e2e-army/180-admin-copy-errors.e2e.ts   | 18 ++++++++++++------
src/app/admin/copy/page.tsx             |  6 ++++++
tests/unit/admin/copy/copy-page.test.ts |  3 +++
5 files changed, 23 insertions(+), 9 deletions(-)
```

## QA Findings Resolved

1. ✅ **platformAdminOrNull() check was deleted** - Restored with proper imports and call
2. ✅ **E2E test expected 200 for non-admin** - Now expects 404 for non-admins and uses admin session for page checks
3. ✅ **Documentation incorrect** - Updated both DEVELOPER_GUIDE.md and PROGRESS.md to reflect restored gate

## Commit
- **SHA:** 5d1a2b85235bfcb7f34becf546386ecd9aa2e75e
- **Message:** "fix(admin/copy): restore platform-admin gate and fix e2e test (round 20 QA)"
- **Branch:** ai/180
