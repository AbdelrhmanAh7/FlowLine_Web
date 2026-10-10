# Prep for #68: Draft restore, rollback and alerting runbook for owner review

> Offline floor prep (2026-10-10T09:03Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (9 of 7 week-points today; opencode: held until 09:21Z (opencode rate-limited 4× in a r; agy: held until 10-14 14:35Z (4 d 6 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

## Context
The owner readiness milestone needs an approved deployment with restore, rollback and alerts (PP-02..PP-09, tracked in #30). The owner has to approve and perform the real steps. This issue only prepares a reviewable draft.

## Scope
Docs only. Add `docs/runbooks/restore-rollback-alerts.md`. Do not run anything against real environments.
- Backup/restore: what is backed up, the restore steps, and the verification queries to run afterwards.
- Rollback: the steps to return to the previous app version and the criteria for choosing rollback over roll-forward.
- Alerting: a list of the alerts the pilot needs (error rate, auth failures, job failures, backup age), each with a suggested threshold and an owner placeholder.
- An 'Owner decisions needed' section listing items the draft cannot settle. Use placeholders only: no credentials, hostnames or secrets.

## Acceptance criteria
- [ ] The runbook has the four sections above, and every step is concrete and ordered.
- [ ] It contains no secrets, real account identifiers or LIVE-trading content, and it states that NileQuant stays PAPER only.
- [ ] It is linked from OWNER_ACTIONS.md next to the relevant PP items, without changing their status.
- [ ] The mandatory docs check passes.
- [ ] Change is ≤ ~300 lines and fits in one PR.

## Test plan
Read-through review against the PP-02..PP-09 checklist. Run the docs check and the link checker.

<!-- nql-generated -->
<sub>Drafted by the Tech Lead from the roadmap while the queue was empty (claude-cli); backlog triage decides whether the AI engineers take it.</sub>

## Acceptance checklist

- [ ] The runbook has the four sections above, and every step is concrete and ordered.
- [ ] It contains no secrets, real account identifiers or LIVE-trading content, and it states that NileQuant stays PAPER only.
- [ ] It is linked from OWNER_ACTIONS.md next to the relevant PP items, without changing their status.
- [ ] The mandatory docs check passes.
- [ ] Change is ≤ ~300 lines and fits in one PR.

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/ci/env.test.template`
- `.github/workflows/ai-implementers.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`

## Existing tests nearby

- `e2e/tools/webkit-env.mjs`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

**Test Plan**

1. **Check docs structure** - Verify `restore-rollback-alerts.md` has correct sections.  
   *File:* tests/unit/docs-check-script.test.ts  
   *Edge case:* Missing sections or incorrect order.

2. **Validate no secrets** - Ensure no credentials or secrets are present.  
   *File:* tests/unit/docs-check-script.test.ts  
   *Edge case:* Secret placeholder accidentally included.

3. **Check alert thresholds** - Confirm all alerts have suggested thresholds.  
   *File:* tests/unit/docs-check-script.test.ts  
   *Edge case:* Missing or empty threshold values.

4. **Verify owner placeholders** - Ensure owner fields are placeholders.  
   *File:* tests/unit/docs-check-script.test.ts  
   *Edge case:* Real names or emails in placeholders.

5. **Check link to OWNER_ACTIONS.md** - Confirm correct link from relevant PP items.  
   *File:* tests/unit/link-checker.test.ts  
   *Edge case:* Broken or incorrect link.

6. **Validate file size** - Ensure file is ≤ ~300 lines.  
   *File:* tests/unit/docs-check-script.test.ts  
   *Edge case:* File exceeds line limit.

7. **Check for PAPER-only statement** - Confirm NileQuant remains PAPER only.  
   *File:* tests/unit/docs-check-script.test.ts  
   *Edge case:* Missing or incorrect statement.

8. **Test section completeness** - Ensure all four sections are present and ordered.  
   *File:* tests/unit/docs-check-script.test.ts  
   *Edge case:* Sections missing or out of order.
