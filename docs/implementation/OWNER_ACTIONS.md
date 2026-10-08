# Owner actions — private beta

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
   - Owner action: redeem a privately issued bootstrap code and complete setup; the operator command is `node scripts/with-env.mjs .env pnpm exec tsx scripts/admin/bootstrap.mts --email <owner>`. Run it in a clean shell (see [MIGRATION.md step 3](../ai/MIGRATION.md)): `with-env.mjs` never overrides variables already set, so an inherited `DATABASE_URL` would target another database. Enter codes only in the page and keep seeds and recovery codes private.
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
