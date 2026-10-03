# Owner actions — FlowLine private beta

**Current state checked against the coordinator record 2026-10-03.** This ledger separates merged main, the local ARM64 artifact, and remaining beta approvals. No Pi deployment, DNS/tunnel exposure, payment activation or invitations are approved.

## Current verified state

- Main contains the PR #2 stack at `9fdcb7d4278d945cf6f40dd86c961b981f1f7f0d`; PR #2 is merged. Reviewed head `719056cefa9d9810f93ea8c917da2bda82fe2e4a` passed full-tier CI: [run 37077650513](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37077650513), all six jobs green. The four-file tail review on PR #7 completed with no actionable findings; PR #7 remains review-only and unmerged.
- The current beta worktree is based on merge commit `5be15b8e782ae46b82ba3dfbb735e85c6ba929de`. Root reported a local `linux/arm64` image built from exactly that SHA: immutable manifest digest `sha256:64405e0a42269fc3ac9b53cdf91608d91517eac5e80095f6b36b30f85511a273` and local image ID `sha256:e0092d1e5d39ab87540ed20950ef51010f163099a1a6b25c20aae5f9dce0fe0e`. No registry push or Pi deployment occurred. This image does not include the final recovery test-entry/documentation fixes being prepared in this worktree; root controls any final rebuild. Image evidence does not establish Pi readiness.
- Earlier `719056c` ARM64 build failed at page-data collection with 31 workers and Docker EOF. Keep that failed attempt as historical evidence; it is superseded by the separate successful `5be15b8` local image build above, not erased or conflated with it.
- Disposable proof `RECOVERY-c7e21a267ae1f720a1e22f88e81ed139.json` passed 18 DB-only checks: encrypted restore, wrong-key refusal, nonempty-target preservation, ciphertext/key-id preservation, candidate-key decryption and cleanup of only its owned resources. It does not certify application, migrations, off-device backup, Pi restore or a deployed artifact.
- The current patch adds CI-discovered unit coverage for recovery/config Node suites and checked-out crypto; these final changes are not yet in a published PR or image. No full/browser gates were run here.
- `MERGED: YES` for PR #2 at main SHA above. The beta follow-up patch remains unmerged. `BETA INFRA VERIFIED: NO` · `PRIVATE BETA READY: NO` · `PUBLIC PRODUCTION APPROVED: NO`.

## Owner inputs and approvals still required

| Action | Exact input or approval needed | Current boundary |
|---|---|---|
| Select the existing beta domain | Confirm an already-owned domain, exact `beta.<domain>` hostname, and chosen sending subdomain/provider; identify an owner-approved read-only DNS view. | Pending. No purchase or nameserver changes. Inventory existing A/AAAA/MX/TXT and mail-auth records before proposing edits. |
| Authorize read-only Pi inspection | Exact SSH host/user and a secure access method outside chat; authorize inspection of OS/architecture, RAM/storage, Docker/Compose, firewall, running services/ports and other workloads. | Pending. No private keys in chat. No install, restart, configuration change or Pi deployment. |
| Approve DNS and named-tunnel exposure | After inspection, approve the exact DNS diff, Cloudflare account/zone and named tunnel route, origin, service/firewall changes, verified cost, risks and rollback. | Pending. No tunnel creation, DNS write, credentials or internet exposure. |
| Approve a specific beta deployment | Exact source SHA, image digest/architecture, migration state/plan, named Pi services and protected config paths, data/off-device backup and clean-restore plan, rollback, verified cost, invite-only mode and sandbox-only billing with live billing disabled. | Pending. The successful local `5be15b8` image is not Pi or release certification; root will decide whether the final frozen patch requires a rebuild. Approval cannot imply production or invitations. |
| Complete named provider setup and consent | Dedicated test accounts/resources, verified callbacks and least scopes, intended Flowline UI/storage, and owner consent for Google/GitHub, Sheets/Gmail, Slack, email and Paddle sandbox journeys. | Not live-verified. No real customer data or live payments. |
| Hosted AI validation | Use only a verified free route with paid overage disabled. | Aggregate cap remains **$0**. No new spending proposal, billable calls, billing activation or top-ups. If a route is not verifiably free, keep the test blocked and Copilot Experimental. |
| Complete owner admin setup privately | Owner completes Google → ZITADEL → Flowline sign-in round-trip and real platform-admin TOTP/bootstrap, then stores recovery material privately. | Both remain unverified in the coordinator record. No owner login/MFA was performed here. |
| Approve recipient-specific invitations | After exact-artifact readiness and owner UAT, specify each recipient/workspace, number of invitations and expiry. | Not approved. No invitations sent. |

**Current disposition:** PR #2 stack merged to main `9fdcb7d`; local ARM64 image exists for source `5be15b8` only; final beta patch publication/image status pending root. `BETA INFRA VERIFIED: NO` · `PRIVATE BETA READY: NO` · `PUBLIC PRODUCTION APPROVED: NO` · invitations not approved.

## Preserved earlier owner chronology — historical, superseded; do not act on its status
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

The earlier handoff reported Google policy/client creation, Sheets/Gmail enablement and External/Testing identity configuration. These external account states are unverified here; live provider certification remains unverified.

The cp21/cp23 build and supervisor notes were transient session state, not a current startup or shutdown procedure. Re-establish process ownership and the tested revision before any operational action.

Executor takeover: preserve the existing owner MFA handoff; no password, OTP, seed, credential search or browser recording was performed in this session. Landing and local gates continue independently. New approval boundaries unchanged.
# Historical executor update — 2026-09-30 (superseded; do not act)

The owner has additionally authorized a broader useful EN/AR scenario library and use of available Claude/Astra/Gemini helpers as needed. This does not authorize product-provider spending, DNS/Pi changes, merge, public launch, or invitations. The prior aggregate product AI cap remains USD0.

The public localhost3000 Chrome tab is an older loaded page with no corresponding local server listener during the current retest. Latest-candidate header testing will use the supervised isolated test stack. The private owner MFA/setup tab has not been inspected or controlled in this takeover. Its earlier pending owner action remains pending until privately confirmed.

No new owner login or secret entry is required for local scenario work. Audience preference was requested asynchronously; small businesses and everyday teams are the working default while optional clarification is pending.
