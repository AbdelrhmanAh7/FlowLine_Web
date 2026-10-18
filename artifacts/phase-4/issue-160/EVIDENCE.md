# Issue #160 Verification Report: Enable GitHub Security Features

**Issue:** [#160](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/160) — Enable GitHub security features (secret scanning, push protection, Dependabot, Copilot)
**PR:** [#213](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/213) — Merged as `0b847de6` (doc handoff only; settings remain owner-only)
**Branch:** `ai/160` (up to date with `origin/main` as of 2026-10-18)
**Status:** Documentation complete; settings changes deferred to owner post-pilot (issue stays open with `Refs #160`)

---

## Acceptance Criteria

| AC | Description | Type | Verified By |
|----|-------------|------|-------------|
| **AC1** | Secret scanning with push protection enabled | Owner action (GitHub Settings → Security and quality → Advanced Security → Secret Protection → Enable, then Push protection → Enable) | Owner evidence comment on #160; `owner-tracking-keyword.test.ts` guards documentation |
| **AC2** | Dependabot alerts enabled | Owner action (GitHub Settings → Security and quality → Advanced Security → Dependabot alerts → Enable) | Owner evidence comment on #160; `owner-tracking-keyword.test.ts` guards documentation |
| **AC3** | Copilot code review enabled as a second reviewer | Owner action (GitHub Settings → Rules → Rulesets → New branch ruleset → Automatically request Copilot code review) | Owner evidence comment on #160 with PR link showing Copilot review next to CodeRabbit; `owner-tracking-keyword.test.ts` guards documentation |

> **Note:** Per AGENTS.md Article 7 and CTO rulings on PR #213, repository settings changes fall under the **secrets-settings hard rule** — engineers neither change nor inspect these settings. The owner must perform the steps and record evidence.

---

## Verification Mapping

### Automated Verification (Engineering Documentation)

| Test | Command | Exit Code | Purpose |
|------|---------|-----------|---------|
| Owner tracking keyword guards | `pnpm exec vitest run tests/unit/owner-tracking-keyword.test.ts --maxWorkers=2` | 0 | Ensures no closing keywords (`Closes #160`, `Fixes #160`, etc.) target owner-tracking issues; enforces `Refs #160` |
| #160 single honest record | Same test suite (describe block "issue #160: one honest record...") | 0 | Verifies OWNER_ACTIONS.md is the single source of truth; POINTERS (NEXT_ACTION.md, PHASE4_BETA_REPORT.md) link to it without restating steps |
| Evidence template integrity | Same test suite | 0 | Confirms evidence template uses `<enabled|disabled>` placeholders only; no filled-in state; forbids secret values |
| Settings paths accuracy | Same test suite | 0 | Validates each AC has exact Settings path with required UI labels (Advanced Security, Secret Protection, Push protection, Dependabot alerts, Rulesets, New branch ruleset, Automatically request Copilot code review) |
| Status column values | Same test suite | 0 | Ensures each AC row status ∈ {unverified, enabled, disabled}; if not unverified, requires dated evidence link to #160 comment |

**All 30 tests in `owner-tracking-keyword.test.ts` pass (exit code 0).**

```bash
$ pnpm exec vitest run tests/unit/owner-tracking-keyword.test.ts --maxWorkers=2
# Test Files  1 passed (1)
# Tests  30 passed (30)
```

### Typecheck & Lint (Changed Files)

| Check | Command | Exit Code |
|-------|---------|-----------|
| TypeScript | `pnpm typecheck` (`tsc --noEmit`) | 0 |
| ESLint | `pnpm lint` (`eslint . --cache --cache-location node_modules/.cache/eslint/`) | 0 |

Both pass with no errors.

### Full Unit Suite

```bash
$ pnpm exec vitest run --project unit --maxWorkers=2
# Test Files  134 passed (134)
# Tests  1779 passed | 1 skipped (1780)
```

---

## Manual Verification (Owner Action Required)

The following steps **cannot be automated** and require the repository owner:

### AC1: Secret Scanning + Push Protection
1. Navigate to: `https://github.com/AbdelrhmanAh7/FlowLine_Web/settings/security_analysis`
2. Under **Advanced Security**, next to **Secret Protection**, click **Enable** → **Enable Secret Protection**
3. In the **Secret Protection** section, next to **Push protection**, click **Enable**
4. Verify both show **Disable** (meaning they are enabled)
5. Post evidence comment on issue #160 (format below)

### AC2: Dependabot Alerts
1. Same page: `https://github.com/AbdelrhmanAh7/FlowLine_Web/settings/security_analysis`
2. Under **Advanced Security**, next to **Dependabot alerts**, click **Enable**
3. Verify it shows **Disable**
4. Post evidence comment on issue #160

### AC3: Copilot Code Review as Second Reviewer
1. Navigate to: `https://github.com/AbdelrhmanAh7/FlowLine_Web/settings/rules`
2. Click **New ruleset** → **New branch ruleset**
3. Name: `copilot-review`
4. Enforcement status: **Active**
5. Target branches: **Add target** → **Include default branch**
6. Branch rules: tick **Automatically request Copilot code review**
7. Leave **Review new pushes** and **Review draft pull requests** unticked
8. Click **Create**
9. Open a non-draft PR and verify Copilot review appears alongside CodeRabbit
10. Post evidence comment on issue #160 with the PR URL

---

## Evidence Comment Format (Owner Must Post on #160)

```text
#160 evidence, YYYY-MM-DD
AC1 secret scanning: <enabled|disabled>; push protection: <enabled|disabled>
AC2 Dependabot alerts: <enabled|disabled>
AC3 Copilot code review ruleset: <enabled|disabled>; Copilot review next to CodeRabbit's: <URL of a non-draft PR>
```

**Rules for evidence:**
- Record only setting names, their state, the date, and the PR link
- Never record secret values (whole or partial), tokens, keys, or alert payloads (secret type, file, line, commit, package, advisory)
- Each open alert gets its own issue
- Copy the date and comment URL into the record table in `OWNER_ACTIONS.md`

---

## Record Table (OWNER_ACTIONS.md)

| AC | Setting | Status | Evidence |
|----|---------|--------|----------|
| AC1 | Secret scanning with push protection | unverified | none yet |
| AC2 | Dependabot alerts | unverified | none yet |
| AC3 | Copilot code review as a second reviewer | unverified | none yet |

> A row leaves `unverified` only together with its evidence: the date (`YYYY-MM-DD`) and the link to the owner's evidence comment on #160. `tests/unit/owner-tracking-keyword.test.ts` fails on any other status, or on a row that lacks either.

---

## Reactivation

Issue #160 is **deferred until after the pilot** (owner decision 2026-10-12). To reactivate:
1. Re-add the `pilot` label to issue #160
2. Owner performs the three steps above
3. Owner posts evidence comment
4. Update the record table in `OWNER_ACTIONS.md` with `enabled`/`disabled` status, date, and comment link
5. Tests will verify the record integrity

---

## Cost Note

- Repository is public → Secret scanning, push protection, Dependabot alerts are **free**
- Copilot code review uses AI credits from the PR author's Copilot plan (for hub PRs, the owner's account)
- GitHub blocks reviews once budget runs out
- **This handoff authorises no spending** — do not raise the Copilot budget for this

---

## Related Files

| File | Purpose |
|------|---------|
| `docs/implementation/OWNER_ACTIONS.md#issue-160-github-security-settings-owner-only` | Single source of truth for owner steps, record table, evidence template |
| `tests/unit/owner-tracking-keyword.test.ts` | Guards: no closing keywords, single honest record, template integrity, settings paths |
| `NEXT_ACTION.md` (line 44-46) | Pointer to OWNER_ACTIONS.md; does not restate steps |
| `docs/implementation/PHASE4_BETA_REPORT.md` (line 93-95) | Pointer to OWNER_ACTIONS.md; does not restate steps |
| `AGENTS.md` | Constitution Article 7: "Agents prepare; the owner acts" |
| `.github/pull_request_template.md` | Requires `Refs #N` for deferred acceptance criteria |

---

## Originating References

- **GitHub Issue:** [#160](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/160)
- **PR (Documentation Handoff):** [#213](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/213) — merged as `0b847de6`
- **CTO Decision (PR #213):** [Comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/213#issuecomment-6121021800) — 2026-10-12
- **Owner Deferral (Issue #160):** [Comment](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/160#issuecomment-6113889098) — 2026-10-12
- **Sentry Issue:** None (governance / repository security configuration)

---

## Summary

| AC | Automated Guard | Owner Action | Current State |
|----|-----------------|--------------|---------------|
| AC1 | ✅ Tests pass | ⏳ Pending | unverified |
| AC2 | ✅ Tests pass | ⏳ Pending | unverified |
| AC3 | ✅ Tests pass | ⏳ Pending | unverified |

**Engineering work complete.** The documentation handoff is merged, tested, and guards the integrity of the owner's future actions. The three GitHub settings changes await the owner post-pilot.