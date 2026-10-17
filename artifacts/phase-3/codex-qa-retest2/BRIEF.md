# Codex — focused retest of CX3R-01 and CX3R-02 (agent-driven exploratory browser test)

Same rules as your previous retest (`artifacts/phase-3/codex-qa-retest/RETEST.md` in the main repo): independent tester,
don't modify product code or commit, UI only (Playwright scripts under `artifacts/phase-3/codex-qa-retest2/scripts/`),
one browser, no secrets in evidence. Not human UAT.

Target: staging `http://localhost:3200`, image `flowline:ce08d9f` (revision `ce08d9fa5ed81fd0bdc7f29919b07b5be9947bdd`,
schema 8), real local Ollama `qwen2.5:7b`. Your earlier accounts still exist; you may reuse them.

Claude's changes (verify, don't trust):
- **CX3R-01:** an agent's time limit now counts only its own working time; waiting for a human decision doesn't consume it.
- **CX3R-02:** a Copilot proposal with no Output step and no action is invalid ("doesn't produce anything"); proposals made
  only of local steps show a **dry-run preview** on their own sample input before approval, with a warning when the result
  is empty/null or the run fails; proposals with external steps say why they weren't previewed. Copilot model quality
  itself wasn't changed further — the goal is that wrong drafts are visible before approval.

Retest:
1. CX3R-01 exactly as before: ASK-gated workflow tool, wait > 120 s (e.g. 150 s) before approving → expected: the agent
   continues and the workflow runs exactly once.
2. CX3R-02: repeat your support-intake and lead-cleanup Copilot requests (+ 2 new realistic ones). For each: approvable?
   Does the preview appear and show what the draft returns? Is a no-output or empty-result draft flagged before approval?
   Count approvable proposals and how many approved drafts are actually correct when run.
3. Quick check that CX3Q-01…05 still behave as in your last retest (dashboard Review → decide; mobile buttons; no empty
   Copilot drafts).

Write `artifacts/phase-3/codex-qa-retest2/RETEST2.md`: environment, accounts (emails only), CX3R-01/02 → PASS/FAIL/PARTIAL
with evidence, Copilot counts, any new findings (`CX3S-NN`), and limits.
