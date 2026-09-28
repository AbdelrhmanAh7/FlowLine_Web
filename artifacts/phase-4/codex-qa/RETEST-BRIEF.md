# Codex — Chrome retest of CX4Q-01 and CX4Q-02 (Flowline Phase 4, STAGING)

Same rules as `BRIEF.md`:
- Independent tester: no product-code changes and no commits. Write only under `artifacts/phase-4/codex-qa/retest/`.
- Real Google Chrome via Playwright (`channel: "chrome"`).
- UI-driven, one browser.
- No secrets, beta codes or passwords in files.

**Target:** staging `http://localhost:3200`, now the FINAL candidate image `flowline:e42667d`. Check `/api/health`
first; the revision must be `e42667d…`. It is invite-only. A 4-use beta code is in the same scratchpad file as
before (`qa-beta-code.txt`), and the test inbox helper is `node artifacts/phase-4/codex-qa/scripts/inbox.mjs <email>`.

## Retest
1. **CX4Q-01:** follow its retest steps in `BUGS.md`. In Arabic at 1440/1024/375, check:
   - template cards and their node chains;
   - a flow created from a template (the name and step labels should now be Arabic when created in Arabic);
   - integration categories, descriptions and action titles;
   - the GitHub connect dialog (the field label should be Arabic and the input LTR).

   In English the same content must be unchanged English. Brand names, ids and code may stay Latin.
2. **CX4Q-02:** follow its retest steps.
   - Build a manual → AI Generate flow, start a run, pause the DB with `docker pause flowline-staging-db-1` for about
     20 s, then unpause.
   - The failed step must show NO SQL or driver text.
   - The message and suggested fix must say that Flowline's database was unavailable and that you should re-run once
     healthy (Arabic and English).
   - The banner appears and clears without a reload, and there are no duplicate steps.
   - Leave the DB unpaused at the end.
3. **Quick regression:** in both languages, sign up with the code, verify email, onboard, run a template flow, and
   open the inspector. Watch the console for errors and hydration warnings.

## Report
Write `artifacts/phase-4/codex-qa/retest/RETEST.md`: revision, Chrome version, each finding FIXED / NOT FIXED with
evidence, any new findings (P0–P3, `CX4Q-NN` numbering continued), and the console/network error inventory.
