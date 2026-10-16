# Codex: finish the design-v2 closeout (handed over by the Claude lead, 2026-09-30)

You take over the remaining closeout of branch `design-v2` in this worktree
(`C:\Users\Abdelrahman\Desktop\Personal_Project\FL-wt-design`). Read these first:
- `AGENTS.md`;
- `artifacts/design-v2/closeout/RESUME.md`, especially the "OWNER RE-SCOPE" section;
- `artifacts/design-v2/BUGS.md`;
- `artifacts/design-v2/NOTES.md`;
- `artifacts/design-v2/closeout/PRECOMMIT-REVIEW.md` (§3 is the staging plan).

## Owner's rules (binding)
- **NO** push of any kind, **NO** merge, **NO** deleting or pruning worktrees or branches, **NO** removing
  `refs/checkpoints/*`, no force-push, no deploy, no live payments, no new feature scope.
- **ONE** browser test runner at a time: Chromium → Firefox → WebKit, each `--workers=1`. Don't run builds, other suites
  or Chrome exploration alongside a browser run.
- **Server lifetime:** use `bash artifacts/design-v2/closeout/run-with-stack.sh <evidence-dir> <command...>`, which runs
  the production test stack as a supervised child, records PID/ports/BUILD_ID/log/stop command, and always stops it.
  - Never leave a detached server running. Emergency stop: `pnpm stop:test`.
  - Integration tests refuse to run while the stack is up.
- **Secrets:** never read or print `.env*` values or unrelated secrets.
  - For the admin-panel test ONLY, you may create and use disposable test accounts, one-time bootstrap codes
    (`node scripts/with-env.mjs .env.test npx tsx scripts/admin/bootstrap.mts --email <synthetic> --grant`) and TOTP
    codes from `e2e/tools/totp.ts`.
  - Never print them, and never capture setup codes, QR/TOTP seeds, OTPs, cookies or tokens in screenshots, logs,
    traces or reports.
  - Keep any auth state outside Git.
  - Invalidate/clean up after.
- **Evidence:** helper stdout goes to `artifacts/design-v2/helper-logs/` (gitignored). Run `pnpm check:evidence` before
  committing.
- **Tests:** never delete or weaken an assertion. Flaky or skipped counts as a failure.

## Step 1: finish the DV2-M02 refinement (the previous worker was stopped mid-edit)
Uncommitted edits exist in `src/components/ui/side-panel.ts`, `focus-return.ts`, `src/components/builder/*` and
`e2e/builder-keyboard.spec.ts`. Review `git diff` and finish so ALL of these hold:
1. **Closing or hiding Copilot (Escape or X) does not discard** the typed request or a pending proposal (including the
   diff and the `confirmRemovals` choice). Reopening shows the same proposal without a new request. Today the state
   lives in `CopilotPanel` and the builder unmounts it; keep the panel mounted and hidden, or lift the state.
2. **A nested menu, select, popover or tooltip inside a panel consumes Escape first.**
3. **Initial focus happens only on the open transition,** never on a background refetch.
4. **The panels stay non-modal:** no focus trap, no `aria-modal`, no inert background. Escape closes; focus returns to
   the launcher.
5. **The keyboard tests in `e2e/builder-keyboard.spec.ts` are tagged `@cross-browser`** and use real keyboard input.
   - Add E2E tests: the proposal survives close → reopen (Escape and X, with the POST count unchanged); no focus steal
     on a refetch.
   - Update `tests/unit/builder-keyboard.test.ts`.

Then run `pnpm -s lint && pnpm -s typecheck && pnpm -s test && pnpm -s check:evidence`.

## Step 2: freeze checkpoint 10
- Take a snapshot of the whole working tree with a temporary index:
  `GIT_INDEX_FILE=<tmp> git read-tree HEAD; git add -A; git write-tree; git commit-tree <tree> -p refs/checkpoints/design-v2-closeout-9 -m ...`
- Save it as `refs/checkpoints/design-v2-closeout-10`.
- Never touch the real index or the branch.
- Record the commit, the tree and these subtrees: `src e2e tests scripts worker drizzle package.json pnpm-lock.yaml
  playwright.config.ts next.config.ts`.

## Step 3: keyboard spec on cp10
Run `e2e/builder-keyboard.spec.ts` via `run-with-stack.sh`, in Chromium, then Firefox, then WebKit
(`bash e2e/tools/webkit-docker.sh --workers=1 e2e/builder-keyboard.spec.ts`). Evidence goes to
`artifacts/design-v2/gate/final-cp10/keyboard/`.

## Step 4: agent-driven Google Chrome exploratory QA via Playwright on cp10
- **Setup:** real Google Chrome, headed, `channel: "chrome"`, with an isolated temporary profile under
  `artifacts/design-v2/chrome-qa/final-cp10/.profile` (gitignored), never the owner's profile.
- **Label it** "Agent-driven Google Chrome exploratory QA via Playwright". Not computer use, not human UAT.
- **Record** the Chrome version, headed/headless, the control mechanism, the checkpoint and BUILD_ID.
- **Keep each session under about 25 minutes,** each with its own `run-with-stack.sh` invocation:
  - **Session A, the admin panel end to end,** on a fresh isolated setup where applicable:
    - one-time setup, sign-in, the real TOTP flow;
    - invalid and reused codes;
    - protected navigation and implemented actions with synthetic records;
    - logout, then protected deep links;
    - rejection of an unauthenticated user and of a normal non-admin workspace Owner (the Owner is NOT a platform
      admin);
    - server-side enforcement: label corroborating API checks separately;
    - no privileged action before MFA.

    Then M01/M02 with real keyboard: all acceptance points in Step 1 plus the original repros. Then a short Q05 phone
    run-sheet check.
  - **Session B:** journeys 1–8 and 10 from `artifacts/design-v2/chrome-qa/manual-cp8/BRIEF.md`, as a real interactive
    exploration on cp10, briefer than before.
  - **Reconcile all 10 journeys individually:** PASS / FAIL / BLOCKED / NOT RUN on cp10. Don't count cp8 results as cp10.
- **Findings:** file new ones in BUGS.md as `DV2-F01+`, with severity, class, repro, expected/actual and snapshot/build.
  Append fix/retest evidence to M01/M02.
- **If you fix product code:** create a new checkpoint and redo the affected evidence.
- **The report** goes in `artifacts/design-v2/chrome-qa/final-cp10/REPORT.md`.

## Step 5: final cumulative gate on the frozen final candidate
Everything in `artifacts/design-v2/gate/final-cp10/`, via `run-with-stack.sh`, one runner at a time:
- Chromium full (`--workers=1`), then Firefox (`--project=firefox --workers=1`), then WebKit
  (`bash e2e/tools/webkit-docker.sh --workers=1`).
- Then, with the stack stopped: lint, typecheck, unit, contract, integration, check:evidence.
- Prove first that the working tree equals the checkpoint, per subtree.
- `GATE.md` records the identity, the counts and "test doubles only".

## Step 6: records
- **BUGS.md:** reconcile the status table (M01/M02, Q05, L01, DV2-R01..R04 open P3 and so on).
- **DV2-02:** confirm it is genuinely verified. See its section:
  - the key was replaced;
  - `dv2-02/crypto-verify.txt` 10/10;
  - `db-envelope-scan.txt` has 0 old-key envelopes;
  - history and evidence scans are clean;
  - recurrence prevention is in place;
  - the OTHER two test envs still share the exposed key, which stays OPEN for the owner.

  Don't close it on redaction alone.
- **NOTES.md:** fill "final gate" and the M01/M02 notes; list the remaining items and the computer-use limitation.
- **The old GATE.md files** stay marked as superseded.

## Step 7: LOCAL commit only
- **Stage explicit paths** per PRECOMMIT-REVIEW §3, plus the new files.
- **Never stage:** `.env*`, `helper-logs/`, `.profile/`, `test-results*`, `scratch-css.mjs`, `KIMI_RESUME.md`,
  `NOTES-draft.md`, `closeout/RESUME.md`, `gate/.current-run`, `*/STOP`, or the Arabic-named `landing-reduced-ar-*`
  PNGs.
- **Review** `git diff --cached --stat`. Run `pnpm check:evidence` and grep the staged diff for key patterns.
- **Commit** on `design-v2`. The message summarises the work and ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Map** the commit's execution-input subtrees to the final gated checkpoint.
- **Do NOT push.**

## Step 8: handoff
Write `artifacts/design-v2/closeout/HANDOFF.md` with:
- the local commit SHA and tested BUILD_ID;
- the M01/M02 verification and the admin-panel result;
- the browser results per browser, including the keyboard tests;
- the 10-journey table;
- open findings by severity, and the DV2-02 status;
- evidence paths;
- the proposed push ref (`design-v2 → origin/design-v2`) and the worktree-cleanup candidates (`FL-wt-aihub`: pushed and
  clean; `FL-wt-aib`: unregistered, 163 MB), both for the owner to decide;
- `PUSHED: NO`, `MERGED: NO`, `WORKTREES REMOVED: NO`, `PRODUCTION APPROVED: NO`.
