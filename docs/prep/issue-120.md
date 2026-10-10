# Prep for #120: Docs: add lock-order.md skeleton (entity table + review checklist) and link it from the docs index

> Offline floor prep (2026-10-10T17:22Z): capacity 0 — claude: claude daily budget spent (14% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 20:43Z (opencode rate-limited 7× in a r; agy: held until 10-14 14:35Z (3 d 21 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

## Scope
Create `docs/engineering/lock-order.md` containing only: (a) an intro, (b) a table of the 7 lockable entities (account, session, user, workspace, member, email-token, SSO audit) with their global acquisition order, and (c) a checklist for reviewing new transactions. Add a link from the docs index (docs/DEVELOPER_GUIDE.md or the architecture index). Leave a heading placeholder `## Worked examples` for later parts.

## Instructions
1. Read the current code and cite the file path for each table row, e.g. `src/server/federated-locks.ts`.
2. In docs/DEVELOPER_GUIDE.md line ~53, restore '(use `lockUserThenSessions` from `src/server/federated-locks.ts`)' right after the FEDERATED_MFA.md#lock-order clause. The generic sentence pointing to engineering/lock-order.md must not mention that helper.
3. Remove any claim in the intro that is not backed by code, such as the sentence about re-locking a row you already hold, unless a cited file confirms it.
4. Run the markdown link check or lint if one exists, otherwise verify the links manually.
5. Do not touch .github/.

## Acceptance criteria
- [ ] The page exists, covers all 7 entities, and each row cites a real file path.
- [ ] The page is linked from the docs index and the DEVELOPER_GUIDE helper reference is correct.
- [ ] The file is under 80 lines at this stage.
- [ ] Link check or lint passes and CI is green.
- [ ] No .github/ files are touched.

Part 1/3 of #89 (split by the CTO: Docs-only PR #93 has valid CodeRabbit accuracy defects, and CTO, rescue and model-raise rounds produced no commit. Split into three narrow, code-verified docs tasks, each small enough for one pass.)

<!-- nql-cto-split parent=89 -->

## Acceptance checklist

- [ ] The page exists, covers all 7 entities, and each row cites a real file path.
- [ ] The page is linked from the docs index and the DEVELOPER_GUIDE helper reference is correct.
- [ ] The file is under 80 lines at this stage.
- [ ] Link check or lint passes and CI is green.
- [ ] No .github/ files are touched.

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:qwen3:8b)

TEST PLAN

1. **Check lock-order.md existence and structure** - Test file: `docs/engineering/lock-order.md` - Assert: File exists, has intro, table, checklist, and placeholder.
2. **Verify table entity file paths** - Test file: `docs/engineering/lock-order.md` - Assert: All 7 entities have valid file paths from code.
3. **Validate DEVELOPER_GUIDE.md link** - Test file: `docs/DEVELOPER_GUIDE.md` - Assert: Link to `lock-order.md` is correctly placed after FEDERATED_MFA.md.
4. **Check link validity** - Test file: `tests/unit/docs-check-script.test.ts` - Assert: All markdown links are valid and resolve correctly.
5. **Ensure no .github/ changes** - Test file: `.github/` - Assert: No files are modified or added.
6. **Check file line count** - Test file: `docs/engineering/lock-order.md` - Assert: File is under 80 lines.
7. **Verify CI link check passes** - Test file: `docs/engineering/lock-order.md` - Assert: CI confirms all links are valid.
8. **Check for unverified claims** - Test file: `docs/engineering/lock-order.md` - Assert: No unsupported claims about re-locking rows.
