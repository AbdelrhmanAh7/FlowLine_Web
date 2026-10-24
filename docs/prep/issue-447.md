# Prep for #447: Follow-up from #443: non-blocking review findings

> Offline floor prep (2026-10-24T18:21Z): capacity 0 — claude: claude failed 3× in a row (skipped for 14 min); codex: codex pacing: not enough room for a coding run (~1; agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=443 -->
Follow-up from #443 (fix: ar.json: src/i18n/messages/ar.json:1: Regular hyphen (-) used instead of em-da… (split from #383) (#434)).

P2/P3 findings from the reviewers. They do not block #443 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/i18n/messages/ar.json:2418: The Arabic translation now correctly uses em-dash (—) instead of regular hyphen (-) in the backupCodes string.
- Localization Reviewer: [p2] src/i18n/messages/en.json:2436: The English translation now correctly uses em-dash (—) instead of regular hyphen (-) in the backupCodes string.
- Localization Reviewer: [p3] tests/unit/i18n.test.ts:200: Added comprehensive tests to verify em-dash usage in both Arabic and English translations for all backupCodes entries.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

## Test Plan - Issue #447: Em-Dash Usage in Localization

**Objective:** Verify the correct implementation of em-dash usage in Arabic and English translations for `backupCodes` strings.

**1. Test Case: Arabic - Backup Codes - Basic Usage**
   * **Name:** AR-BC-001
   * **Setup:** Load `ar.json`.
   * **Assertion:** `ar.json:2418` displays “—” instead of “-” for `backupCodes`.
   * **File:** `src/i18n/messages/ar.json`

**2. Test Case: English - Backup Codes - Basic Usage**
   * **Name:** EN-BC-001
   * **Setup:** Load `en.json`.
   * **Assertion:** `en.json:2436` displays “—” instead of “-” for `backupCodes`.
   * **File:** `src/i18n/messages/en.json`

**3. Test Case: AR - Backup Codes - Edge Case - Empty String**
   * **Name:** AR-BC-002
   * **Setup:** Load `ar.json`.
   * **Assertion:** `ar.json:2418` displays “—” for an empty `backupCodes` string.
   * **File:** `src/i18n/messages/ar.json`

**4. Test Case: EN - Backup Codes - Edge Case - Empty String**
   * **Name:** EN-BC-002
   * **Setup:** Load `en.json`.
   * **Assertion:** `en.json:2436` displays “—” for an empty `backupCodes` string.
   * **File:** `src/i18n/messages/en.json`

**5. Test Case: Unit Test - AR - Backup Codes - Comprehensive**
   * **Name:** UT-AR-BC-001
   * **Setup:** Run `tests/unit/i18n.test.ts`.
   * **Assertion:** All `backupCodes` entries in AR translation are correctly rendered with em-dash.
   * **File:** `tests/unit/i18n.test.ts`

**6. Test Case: Unit Test - EN - Backup Codes - Comprehensive**
   * **Name:** UT-EN-BC-001
   * **Setup:** Run `tests/unit/i18n.test.ts`.
   * **Assertion:** All `backupCodes` entries in EN translation are correctly rendered with em-dash.
   * **File:** `tests/unit/i18n.test.ts`

**7. Test Case: Regression - Existing Tests**
   * **Name:** Regression - Verify existing tests pass.
   * **Setup:** Run existing tests (demo-docs-commands, docs-check-script, etc.).
   * **Assertion:** All existing tests pass.
   * **File:** Various tests.
