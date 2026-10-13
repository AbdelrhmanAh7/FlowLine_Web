# Owner actions — private beta

## Issue #160: GitHub security settings (owner only)

**Status: not done until every row of the record below is `enabled`.** [Issue #160](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/160) asks for secret scanning with push protection, Dependabot alerts, and Copilot code review as a second reviewer. Engineers neither change nor inspect these settings: the secrets-settings hard rule (repository secrets and account settings; [CTO decision on PR #213](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/213#issuecomment-6121021800), 2026-10-12) reserves them for the owner, under AGENTS.md article 7 ("Agents prepare; the owner acts"). The owner [deferred #160 until after the pilot](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/160#issuecomment-6113889098) on 2026-10-12; re-adding the `pilot` label brings it back. PR #213 documents these steps and links the issue as `Refs #160`, never with a closing keyword, so merging it leaves #160 open; only the owner closes #160. The hub's start job had opened PR #213 with a closing keyword, as it did PR #185 (see #162 below); verified 2026-10-13 after the fix: `gh pr view 213 --json body,closingIssuesReferences` returned the first body line `Refs #160` and `"closingIssuesReferences":[]`.

**Cost.** The repository is public, so secret scanning, push protection and Dependabot alerts are free. Copilot code review is not free in the same way: each review uses AI credits from a Copilot plan (for a review requested by a ruleset, the pull request author's plan, which for the hub's PRs is the owner's account), and GitHub blocks reviews once that budget runs out. This handoff authorises no spending: do not raise the Copilot budget for it.

### Record of the owner's actions

| AC | Setting | Status | Evidence |
|----|---------|--------|----------|
| AC1 | Secret scanning with push protection | unverified | none yet |
| AC2 | Dependabot alerts | unverified | none yet |
| AC3 | Copilot code review as a second reviewer | unverified | none yet |

A row leaves `unverified` (for `enabled`, or `disabled` if the owner keeps that setting off) only together with its evidence: the date (`YYYY-MM-DD`) and the link to the owner's evidence comment on #160. `tests/unit/owner-tracking-keyword.test.ts` fails on any other status, or on a row that lacks either.

### Owner steps

Labels as in GitHub's docs on 2026-10-13 (GitHub renames them now and then). A setting that already offers **Disable** is on: record it as enabled and change nothing.

1. **AC1 (secret scanning, push protection).** Settings → *Security and quality* → **Advanced Security**. Next to **Secret Protection** (GitHub's current name for secret scanning), click **Enable**, then **Enable Secret Protection**. In the *Secret Protection* section, next to **Push protection**, click **Enable**. Docs: [secret scanning](https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features/enabling-secret-scanning-for-your-repository), [push protection](https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features/enabling-push-protection-for-your-repository).
2. **AC2 (Dependabot alerts).** Settings → *Security and quality* → **Advanced Security**. Next to **Dependabot alerts**, click **Enable**. [Docs](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/configuring-dependabot-alerts).
3. **AC3 (Copilot as second reviewer).** Settings → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**. Name it `copilot-review`, set **Enforcement status** to **Active**, under **Target branches** choose **Add target** → **Include default branch**, under **Branch rules** tick **Automatically request Copilot code review**, then click **Create**. Leave **Review new pushes** and **Review draft pull requests** unticked: each extra review spends more credits. A separate ruleset leaves the existing ruleset for `main` (required `gate` and `docs`, resolved conversations; see AGENTS.md) unchanged. By default Copilot's review does not count as an approval; CodeRabbit stays the reviewer that confirms each fix (AGENTS.md article 2). [Docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/configure-automatic-review).

### Evidence comment on #160

When the steps are done, post one comment on #160 in this form: pick one value in each `<enabled|disabled>` and fill in the date and the link.

```text
#160 evidence, YYYY-MM-DD
AC1 secret scanning: <enabled|disabled>; push protection: <enabled|disabled>
AC2 Dependabot alerts: <enabled|disabled>
AC3 Copilot code review ruleset: <enabled|disabled>; Copilot review next to CodeRabbit's: <URL of a non-draft PR>
```

Record only the setting names, their state, the date and the PR link. Never record secret values (whole or partial), tokens or keys, or what a secret-scanning or Dependabot alert contains (secret type, file, line, commit, package or advisory), screenshots included; each open alert gets its own issue. Then copy the date and the comment link into the record above.

## Issue #85: e2e-army GitHub Actions job (owner only)

Not done. Issue #85 step 4 asks for an Actions job that runs `pnpm e2e:army` per shard with `timeout-minutes: 5` and posts the `e2e-army` check. AI PRs may not edit `.github/workflows` (CTO decision on PR #88, 2026-10-09), so PR #88 ships the suite, `pnpm e2e:army` and the docs only; until the owner adds the workflow, the hub's verify job posts the `e2e-army` status and the 5-minute per-shard budget is enforced by `scripts/e2e-army.mjs` but not timed in CI. When the owner adds the job, update the "not yet timed in CI" wording in `README.md` and `docs/DEVELOPER_GUIDE.md`.

## Issue #162: Owner Actions - Sensitive Components (tracking)

This section tracks the five founder-only actions from GitHub issue #162 that are blocked by hard rules (money, legal, people). Engineers must not perform these actions, and #162 carries no code: it stays open as the owner's tracking issue until each row below is done. PR #185 is the only PR for this issue and it links #162 as `Refs #162`. A PR that touches this section must reference the issue as `Refs #162`, never with a closing keyword (`Closes`, `Fixes`, `Resolves`), so that merging it leaves #162 open; only the owner closes #162. Any engineering scaffolding (disabled UI states with a `disabledReason`, value-free config types, feature flags that default off) belongs to issue #163 in its own PR; none of it is in the repository yet.

### Keeping #162 open through the PR #185 merge

Merging PR #185 must leave #162 open. Two checks make that true, and a reviewer or the owner can repeat both:

1. **The live PR body uses the non-closing reference — verified 2026-10-12.** `gh pr view 185 --json body,closingIssuesReferences` returned a body whose first line is `Refs #162` and `"closingIssuesReferences":[]`, and the PR is no longer a draft, so GitHub records no closing link for #162.
2. **The merge squashes with an explicit message.** The merger passes a subject/body that does not attach a closing keyword to #162, for example `Owner actions: tracking doc for #162`. This is required because the branch's earlier commit bodies, already pushed, quote the keyword in prose (`git log --format=%s origin/main..HEAD` finds no such keyword in any subject, only in those bodies); the hub pushes fast-forward only and never rewrites history, so a default squash description could otherwise carry one of those lines into the merge commit on `main`. If #162 does get closed by the merge commit anyway, reopen it — the checklist below is still all ⏳ Pending.

The start job that wrote the keyword into the PR body lives in the hub (`nql-agents/bin/implement.sh`), so its fix is a separate `nql-agents` issue (read the issue's `owner-only`/`needs-owner` label and emit the non-closing reference instead) and not a change to this repository.

### Owner-only checklist (from issue #162)

| # | Action | Status | Blocked by | Notes |
|---|--------|--------|------------|-------|
| 1 | Real provider and AI account setup | ⏳ Pending | Money/legal | Requires real provider credentials and contracts |
| 2 | Sandbox payments configuration | ⏳ Pending | Money/legal | Requires payment provider accounts and legal review |
| 3 | Approved deployment with restore/rollback/alerts | ⏳ Pending | Money/people | Requires production approval and runbook sign-off |
| 4 | Pricing and terms finalization | ⏳ Pending | Legal | Requires legal sign-off on pricing and ToS |
| 5 | Customer test coordination | ⏳ Pending | People | Requires real customers and NDA/legal clearance |

**Status legend:** ⏳ Pending = owner action required; ✅ Done = completed and verified; 🚫 Blocked = cannot proceed.

---

## Pending owner checks — 2026-10-03

These checks remain unverified from the repository. Confirm the running app and account before using the local URLs below; no browser session or listener was checked in this docs pass. Record only non-secret completion state; no passwords, OTPs, recovery codes, seeds or provider secrets belong in chat.

1. **Google -> ZITADEL -> Flowline sign-in round-trip**
   - Purpose: determine whether the configured Google upstream sign-in returns to the local Flowline application successfully.
   - Page: open `http://localhost:3000` in Chrome, inspect the current page first, then use `/sign-in` if needed. Continue from the current browser state; never repeat a click blindly.
   - Owner action: start the configured sign-in from Flowline, complete the ZITADEL/Google steps in the browser, and confirm the final Flowline page. Google upstream/consent configuration is unverified here.
   - Claude verifies after: the final page and non-sensitive signed-in/onboarding state in Flowline, plus whether the expected local session is present. The round-trip remains unverified until this check completes.

2. **Owner admin bootstrap and TOTP enrolment**
   - Purpose: establish the protected platform administrator account and complete its authenticator setup.
   - Page: `http://localhost:3000/admin/setup` in the same local app.
   - Owner action: redeem a privately issued bootstrap code and complete setup; the operator command is `node scripts/with-env.mjs .env pnpm exec tsx scripts/admin/bootstrap.mts --email "$OWNER_EMAIL"`. Run it in a clean shell (see [MIGRATION.md step 3](../ai/MIGRATION.md)): `with-env.mjs` never overrides variables already set, so an inherited `DATABASE_URL` would target another database. Enter codes only in the page and keep seeds and recovery codes private.
   - Claude verifies after: the page's completed setup state and access to the protected admin area, without viewing or recording authenticator material.

3. **Reconcile the existing merge and review evidence**
   - Local history already contains the PR #2 source merge `9fdcb7d` and PR #8 docs merge `9641ad1`. Do not repeat the old stacked-merge instructions.
   - Remote PR/CI and review-thread states remain unverified; use `NEXT_ACTION.md` for the recorded references. No new publication, deployment or live-payment action is authorized by this document.

4. **Provider logins for live integration checks, if needed**
   - Purpose: allow the bounded real-provider checks described in [BETA_EXECUTION_BRIEF.md](BETA_EXECUTION_BRIEF.md) for Google Sheets/Gmail, Slack and GitHub.
   - Page: `http://localhost:3000/w/<workspace-slug>/integrations` for each chosen test workspace; use the provider login/consent pages opened from the Flowline integration screen.
   - Owner action: sign in to dedicated test accounts and grant only the requested test access. For GitHub, use a separate private test repository, never FlowLine_Web as a side-effect target. Do not use a personal Gmail connector. Proceed only where accounts, scopes and test actions are already within the approved brief.
   - Claude verifies after: the resulting connection state and bounded read/action/result/revoke/reconnect evidence required by the brief. A saved configuration or successful consent alone is not live certification.

This dated section is the current owner-action plan and supersedes older handoff/action status below it. Those entries are retained as history only.

## Current source handoff — Company Builder integrated

Audited baseline: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. Company Builder is implemented in `src/company-builder/` and `src/server/company-builder/`, off by default behind `FLOWLINE_COMPANY_BUILDER=on`. Sample follow-up trials do not send live Gmail. Human acceptance, owner sign-in/MFA, provider certification and current release-artifact proof remain unverified. Private beta is NOT READY; production is NOT APPROVED; spend cap is $0. Historical browser counts and consolidation notes below do not certify this checkout.


## Historical owner consolidation — 2026-09-30 (superseded; do not act)

The owner explicitly requests merging the completed candidate into main for Claude continuation. See docs/implementation/MAIN_CONSOLIDATION.md for current gate, preservation and release limits. Earlier no-merge/no-push statements are historical for this consolidation only. Company Builder is not implemented; its complete updated prompt is docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md. React/React DOM are already 19.3.0. Final merge/push is pending; no deployment, live payments or invitations.


Historical authority: [BETA_EXECUTION_BRIEF.md](BETA_EXECUTION_BRIEF.md). The old MERGED: NO status is superseded by the local source history above. PUBLIC PRODUCTION APPROVED: NO. No worktree deletion or real invitations.

Aggregate spend cap: $0. No billing activation, payment methods, purchases, subscriptions, top-ups or billable API/AI traffic. Unknown cost remains blocked. Owner authorized direct safe copy/paste of named credentials into intended masked fields; never print them or search arbitrary secrets. Password, MFA, CAPTCHA and signup are owner takeovers.

## Historical active handoff (superseded; do not act)

Historical status: USER ACTION REQUIRED — finish Flowline owner MFA
Page/window: Chrome tab846411899, http://localhost:3000/admin/setup (currently English)
Action: Enter the current authenticator code and click Confirm authenticator, then complete the final Complete setup step with a fresh code.
Purpose and affected account: Owner signup/sign-in/email verification are complete; finish MFA and grant the local platform administrator role.
Cost/permission change: $0; isolated local staging administrator only. No external provider access granted.
Reply done after Setup complete appears. Do not send passwords, OTPs, MFA seeds or recovery codes in chat.

At that handoff the page still displayed Confirm authenticator after the owner's earlier done; completion was not established. The old tab/session identifiers are historical and must not be used as current browser targets.

The historical handoff requested a privately saved Google client file. Its present location and import state are unverified; this docs pass did not inspect credentials.

## Remaining boundaries (historical observations; reverify before action)

| ID | When reached | Current state / bounded action |
|---|---|---|
| O01 | Login/signup/MFA/CAPTCHA | Local signup/sign-in/verification DONE; MFA ACTIVE; Google current account/project accepted through owner steering. Original isolated login window untouched |
| O02 | Named credential entry | Direct safe transfer authorized. Google sign-in client CREATED, secret privately saved by owner; masked /admin entry follows owner MFA. Other services use proper platform/customer UI boundaries |
| O03 | Non-disposable exposed-key migration | Not required by named audit; disposable rotations completed and old DBs preserved |
| O04 | Existing domain / secure Pi target / read-only access | Pending inputs and exact approval; no deployment/reboot/services/DNS access |
| O05 | Sensitive integration consent | Not reached; only actual callbacks and least scopes for named test resources |
| O06 | AI testing | $0 only verified free routes; no budget escalation or payment activation. Two connections and quality evaluation not completed |
| O07 | DNS/sending-domain/tunnel exposure | Not reached; requires exact records, target, cost, risk and rollback approval |
| O08 | Beta deployment | Not reached; requires verified host/domain + SHA/digest/architecture + data/rollback + exact changes/cost |
| O09 | Owner admin MFA/recovery storage | In progress; private owner enrollment, not disposable QA |
| O10 | Claude independent review | Pending; executor checks and helper implementation checks are not coordinator review |
| O11 | Legal/business attestations | Google User Data Policy accepted by owner. Any further binding policy/identity attestations require takeover |
| O12 | Git publication if it triggers deploy/cost | `.github/workflows/gate.yml` now defines PR/push/manual CI. Deployment hooks and external app triggers are unverified; publication remains outside this docs task |

Paid-pilot PP-06 (approved deployment with restore, rollback and alerts; PP-02..PP-09 are tracked in #30), related to O04 and O08 above: draft procedure for owner review in [restore-rollback-alerts.md](../runbooks/restore-rollback-alerts.md). It is a draft, not executed; it changes no item's state.

The earlier handoff reported Google policy/client creation, Sheets/Gmail enablement and External/Testing identity configuration. These external account states are unverified here; live provider certification remains unverified.

The cp21/cp23 build and supervisor notes were transient session state, not a current startup or shutdown procedure. Re-establish process ownership and the tested revision before any operational action.

Executor takeover: preserve the existing owner MFA handoff; no password, OTP, seed, credential search or browser recording was performed in this session. Landing and local gates continue independently. New approval boundaries unchanged.
# Historical executor update — 2026-09-30 (superseded; do not act)

The owner has additionally authorized a broader useful EN/AR scenario library and use of available Claude/Astra/Gemini helpers as needed. This does not authorize product-provider spending, DNS/Pi changes, merge, public launch, or invitations. The prior aggregate product AI cap remains USD0.

The public localhost3000 Chrome tab is an older loaded page with no corresponding local server listener during the current retest. Latest-candidate header testing will use the supervised isolated test stack. The private owner MFA/setup tab has not been inspected or controlled in this takeover. Its earlier pending owner action remains pending until privately confirmed.

No new owner login or secret entry is required for local scenario work. Audience preference was requested asynchronously; small businesses and everyday teams are the working default while optional clarification is pending.
