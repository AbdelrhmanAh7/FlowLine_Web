# Handoff to Codex — independent test of Company Builder

You are the independent tester. Claude implemented this. Don't trust its verdicts: re-run, re-read and try to break it.
Read first: `CLOUD_IMPLEMENTATION_PROMPT.md` (the brief), `REPORT.md`, `ARCHITECTURE.md`, `CLI_PROTOTYPE.md`,
`ACCEPTANCE_MATRIX.md`, `artifacts/company-builder/20260930-51f1473/BUGS.md`.

## Candidate

- Branch `claude/company-builder-milestones-abc-pmba6v` (feature branch; not merged). Base: `main` 9324b1f.
- Commits:
  - `1a8f9ec` domain/services
  - `fb746e3` API/CLI/UI
  - `51f1473` integration tests
  - `f05aec0` E2E/docs
  - `b2a3cf8` review fixes
  - `f84e44b` pre-existing contract flake
  - `09b0689` docs
  - `6bade3d` re-test fixes (**tested revision**)
  - then docs/evidence commits only. Check with `git diff 6bade3d..HEAD --stat`; it should touch only `docs/`,
    `artifacts/`, `SCOPE_MATRIX.md` and `NEXT_ACTION.md`.
- Migrations: `0020_company_builder`, `0021_company_builder_review_fixes` (expand-only).

## Setup (laptop, Windows + WSL/Docker as before)

```bash
git fetch origin claude/company-builder-milestones-abc-pmba6v && git switch claude/company-builder-milestones-abc-pmba6v
pnpm install --frozen-lockfile
# .env.test: add  FLOWLINE_COMPANY_BUILDER=on   (the rest of your existing .env.test is unchanged)
pnpm stop:test; pnpm db:migrate:test
pnpm lint && pnpm typecheck && pnpm check:evidence && pnpm test && pnpm test:contract && pnpm test:integration
FLOWLINE_TEST_NEXT=start pnpm test:e2e            # Chromium + Firefox; then WebKit:
bash e2e/tools/webkit-docker.sh                   # with the stack running (pnpm dev:test)
```
Expected on Claude's cloud run (Linux): unit 535, contract 467, integration 513, Chromium 126/127 (PRE-02),
Firefox 62, WebKit 62. Record your own numbers, first failures, retries 0, SHA and BUILD_ID. Keep failing evidence.

## What to test (priority order)

1. **Re-test every BUGS.md row marked FIXED** (CB-BUG-01…28, CB-E2E-01, PRE-01). Reproduce the original failure
   scenario against `51f1473` if useful, then confirm it is gone on the candidate. Mark each item VERIFIED, NOT FIXED
   or REGRESSED, with evidence.
2. **Security boundary (CBR-01…08):**
   - As a non-founder owner, an editor, a viewer and an outsider, try to create, cancel, export and import CLI jobs.
     Craft raw requests; spoof `Host: localhost` and `X-Forwarded-For: 127.0.0.1` against a server started with
     plain `pnpm dev` and against `scripts/company-builder/start-private.mjs`.
   - Try path, flag or command injection through every text field (offering, approved info, tools_other, text trial).
3. **Real Google Chrome exploratory QA** (the brief's requirement; not done in the cloud).
   - Use a dedicated profile and computer-use or Playwright with `channel: "chrome"`.
   - Run the journey in `OWNER_TEST_GUIDE.md` in Arabic and English, at 1440 / 1024 / 390.
   - Use keyboard only (Tab, Space, Enter, Escape; focus return after actions; no traps in non-modal panels).
   - Try two tabs on the same interview, Back/refresh mid-interview, and double clicks on install, trial,
     approve, activate and CLI buttons.
   - Try wrong business results: edit the draft flow and re-run the trial; "Result matches" must say No.
   - Look for deceptive status wording: anything claiming success, connection or live verification that didn't happen.
   - Label the method accurately. No personal profile, no sensitive screenshots.
4. **Owner CLI prototype on the laptop**, only with the owner present and signed in to the CLIs themselves
   (`CLI_PROTOTYPE.md` → "Founder runbook"). Claude refine + text trial; Codex once its flags and isolation are verified.
   Record CLI versions, reported models/cost (only what the CLI prints) and job states.
5. **Pi**: NOT TESTED — only with the owner's explicit approval for host access.

## Output

Write `artifacts/company-builder/<run-id>/CODEX_BUGS.md` in the same table format as BUGS.md: id, severity,
reproduction, expected vs actual, tested SHA/BUILD_ID, sanitised evidence path, status. Claude fixes; you re-test.
Human usability stays **NOT RUN** until real participants use the protocol in `OWNER_TEST_GUIDE.md`.

## Hard limits (unchanged)

No merge, deploy, public tunnel/DNS change, live payment, invitation or host-security change without the owner's
explicit approval. Don't copy CLI auth stores or credentials. Don't delete assertions or change baselines to make a
run pass. Keep DV2-G01, R03 and the external/owner blockers as they are.
