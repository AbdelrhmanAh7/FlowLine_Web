# Owner actions — FlowLine private beta

**State checked 2026-10-03.** Main and beta-candidate status below are separate. No deployment, tunnel, DNS change,
payment activation or invitation is approved by this list.

## Verified Git and readiness state

- Local `main` and `origin/main` were both observed at `9324b1fed677f03e8c044eb1373b8577167abeb5` (main
  consolidation; `MERGED: YES` for that consolidation).
- The active primary checkout was at `719056cefa9d9810f93ea8c917da2bda82fe2e4a`, branch
  `codex/cb-review-repair-20261003`, one commit ahead of its locally recorded `origin/pr/cb-1-core`. That candidate
  is not established as merged to main. No fresh remote PR/review/CI check was performed here.
- The local ARM64 image build at `719056c` **FAILED** during Next page-data collection after reporting 31 workers;
  Docker ended with EOF. There is no verified image digest or usable ARM64 artifact from that run. Root owns builds;
  this G4 work did not start another build.
- No Pi/host/domain/tunnel/DNS state was inspected or verified. `BETA INFRA VERIFIED: NO` and
  `PRIVATE BETA READY: NO`. `PUBLIC PRODUCTION APPROVED: NO`.
- Local recovery scripts and docs are preparation only until their focused tests/proof are recorded. The DB-only proof
  cannot establish application, migration, ARM64 image, off-device backup or Pi restore readiness.

## Owner decisions and inputs still required

| Action | Exact input or approval needed | State and boundary |
|---|---|---|
| Select existing domain/hostname | Confirm the domain already owned, `beta.<domain>`, and the chosen sending subdomain/provider. Identify who can provide read-only DNS records. | Pending. No purchase or nameserver change. Existing A/AAAA/MX/TXT and mail-auth records must be inventoried first. |
| Authorize read-only Pi inspection | Exact SSH host/user and secure access method outside chat; confirm that inspection may list OS/architecture, RAM/storage, Docker/Compose, firewall, running services/ports and other workloads. | Pending. Do not send a private key in chat. No login until the owner authorizes the access route. No restart, install or config edit. |
| Approve DNS and internet exposure | After the read-only inventory: approve an exact record diff, beta hostname, named Cloudflare Tunnel route/account, origin, firewall/service changes, cost (expected $0 only if verified), risk and rollback. | Pending. No tunnel creation, credentials, DNS writes or endpoint exposure. Exact values cannot be prepared until the domain and host are verified. |
| Approve one beta deployment | Exact source SHA, locally verified immutable `linux/arm64` image digest, migration plan, Pi services/config paths, backup and clean-restore plan, rollback, expected cost, invite-only mode, sandbox billing and live billing disabled. | Pending. Current 719 build failed; no deployable artifact. Approval must not imply public production or invitations. |
| Complete external provider setup and consent | Named test accounts/resources, exact callbacks/scopes, platform/customer UI, and owner consent at each sensitive step for Google/GitHub, Sheets/Gmail, Slack, email and Paddle sandbox. | Not complete/live-verified. No real customer data. No live payments. Test credentials only in their intended protected UI/storage. |
| Decide hosted AI test budget | Either identify a verified no-cost free-quota route with automatic overage disabled, or separately approve a bounded aggregate amount covering retries and benchmark repeats. | Current aggregate cap remains **$0**; no billable AI calls, billing activation or top-ups. Copilot quality stays Experimental until a valid evaluation passes. |
| Finish real platform-admin MFA and recovery storage | Owner completes authenticator setup privately on the current approved admin setup page and stores recovery material in the owner’s protected storage. | Prior handoff described MFA as in progress; completion is **not verified in this takeover**. No code or access here substitutes for confirmation. |
| Approve recipient-specific beta invitations | After readiness and owner UAT, name each recipient/workspace, exact invitation count and expiry. | Not approved; no real invitations. |

## Actions Codex can prepare without those approvals

- Keep the Pi + named Cloudflare Tunnel configuration as a review template only.
- Validate recovery scripts against mocks and uniquely labelled, network-isolated, disposable PostgreSQL resources. Never
  use, stop or remove inherited containers/databases. Remove only resources created by the current proof after positively
  rechecking their random run ID, container IDs, labels, network/ports and private scratch-root ownership.
- Record sanitized local evidence with source SHA; never include environment contents, keys, plaintext, ciphertext or
  database dumps.

**Current disposition:** Main consolidation `MERGED: YES` at the observed SHA above; active 719 candidate
`MERGED: NO / not established`; no fresh GitHub status check. `BETA INFRA VERIFIED: NO` · `PRIVATE BETA READY: NO` ·
`PUBLIC PRODUCTION APPROVED: NO` · real invitations: **not approved**.

## Coordinator verification — 2026-10-03

PR #2 is now MERGED into main `9fdcb7d4278d945cf6f40dd86c961b981f1f7f0d`. Its reviewed head `719056cefa9d9810f93ea8c917da2bda82fe2e4a` passed full-tier CI https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37077650513 . The four-file tail review in #7 is complete with zero actionable findings under the saved owner amendment; #7 remains review-only and unmerged. The earlier pending merge observations above are superseded by this verification. Google -> ZITADEL -> FlowLine owner sign-in round-trip and real platform-admin TOTP/bootstrap remain UNVERIFIED; owner must complete those privately.

The disposable recovery proof `RECOVERY-c7e21a267ae1f720a1e22f88e81ed139.json` passed 18 checks, including encrypted-data restore, wrong-key refusal, nonempty-target preservation and cleanup. It proves DB-only synthetic recovery, not Pi/application/off-device certification. ARM64 rebuild with bounded worker configuration is pending.

## Preserved earlier owner chronology — superseded status, do not act

# Owner actions — private beta

## Tomorrow (2026-10-03) — owner in Chrome

No owner action is requested today (2026-10-02). These are the planned owner checks for tomorrow. For each step, Claude verifies only the resulting non-secret application state and records pass, fail, or still unverified; no passwords, OTPs, recovery codes, seeds, or provider secrets should be shared in chat.

1. **Google -> ZITADEL -> Flowline sign-in round-trip**
   - Purpose: determine whether the configured Google upstream sign-in returns to the local Flowline application successfully.
   - Page: open `http://localhost:3000` in Chrome, inspect the current page first, then use `/sign-in` if needed. Continue from the current browser state; never repeat a click blindly.
   - Owner action: start the Google sign-in from Flowline, complete the ZITADEL/Google steps in the browser, and confirm what final Flowline page appears. Google consent is in Testing mode.
   - Claude verifies after: the final page and non-sensitive signed-in/onboarding state in Flowline, plus whether the expected local session is present. The round-trip remains unverified until this check completes.

2. **Owner admin bootstrap and TOTP enrolment**
   - Purpose: establish the protected platform administrator account and complete its authenticator setup.
   - Page: `http://localhost:3000/admin/setup` in the same local app.
   - Owner action: complete the displayed bootstrap/setup flow and enter authenticator codes only in the page. Keep any seed and recovery codes private.
   - Claude verifies after: the page's completed setup state and access to the protected admin area, without viewing or recording authenticator material.

3. **Review and approve the merge**
   - Purpose: confirm the stacked PRs are reviewed and authorize their merge if that has not already happened.
   - Page: repository PR pages for #2, #3, #4 and #5 in the owner's browser; PR #1 is closed as superseded.
   - Owner action: review the changes and approve the merge if not already approved; preserve the top-down merge order: #5 into #4, #4 into #3, #3 into #2, then #2 into main (so main only receives the complete, gated tree).
   - Claude verifies after: the visible PR review/merge states and resulting branch/commit state. No production deployment or live payment approval is implied.

4. **Provider logins for live integration checks, if needed**
   - Purpose: allow the bounded real-provider checks described in [BETA_EXECUTION_BRIEF.md](BETA_EXECUTION_BRIEF.md) for Google Sheets/Gmail, Slack and GitHub.
   - Page: `http://localhost:3000/w/<workspace-slug>/integrations` for each chosen test workspace; use the provider login/consent pages opened from the Flowline integration screen.
   - Owner action: sign in to dedicated test accounts and grant only the requested test access. For GitHub, use a separate private test repository, never FlowLine_Web as a side-effect target. Do not use a personal Gmail connector. Proceed only where accounts, scopes and test actions are already within the approved brief.
   - Claude verifies after: the resulting connection state and bounded read/action/result/revoke/reconnect evidence required by the brief. A saved configuration or successful consent alone is not live certification.

This dated section is the current owner-action plan and supersedes older handoff/action status below it. Those entries are retained as history only.

## Current main handoff — owner consolidation complete

Merged design-v2 source b40cb38 into main 264e0c7 and pushed main only. See docs/implementation/MAIN_CONSOLIDATION.md and the complete docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md. The owner will continue Company Builder implementation with Claude cloud, then return for testing. Company Builder remains unimplemented; React/React DOM already19.3.0. Initial WebKit timeout stays OPEN despite final123/59/59 repeat and actual Chrome10/10 pass. No production/deployment/live-payment/invitation approval; no worktrees removed. Historical pending/paused statements below are superseded by this current handoff.


## Historical owner consolidation — 2026-09-30 (superseded; do not act)

The owner explicitly requests merging the completed candidate into main for Claude continuation. See docs/implementation/MAIN_CONSOLIDATION.md for current gate, preservation and release limits. Earlier no-merge/no-push statements are historical for this consolidation only. Company Builder is not implemented; its complete updated prompt is docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md. React/React DOM are already 19.3.0. Final merge/push is pending; no deployment, live payments or invitations.


Authority: [BETA_EXECUTION_BRIEF.md](BETA_EXECUTION_BRIEF.md).
MERGED: NO. PUBLIC PRODUCTION APPROVED: NO. No worktree deletion or real invitations.

Aggregate spend cap: $0. No billing activation, payment methods, purchases, subscriptions, top-ups or billable API/AI traffic. Unknown cost remains blocked. Owner authorized direct safe copy/paste of named credentials into intended masked fields; never print them or search arbitrary secrets. Password, MFA, CAPTCHA and signup are owner takeovers.

## Historical active handoff (superseded; do not act)

Historical status: USER ACTION REQUIRED — finish Flowline owner MFA
Page/window: Chrome tab846411899, http://localhost:3000/admin/setup (currently English)
Action: Enter the current authenticator code and click Confirm authenticator, then complete the final Complete setup step with a fresh code.
Purpose and affected account: Owner signup/sign-in/email verification are complete; finish MFA and grant the local platform administrator role.
Cost/permission change: $0; isolated local staging administrator only. No external provider access granted.
Reply done after Setup complete appears. Do not send passwords, OTPs, MFA seeds or recovery codes in chat.

Current page still displayed Confirm authenticator after the owner's earlier done; no completion has been assumed. No seed/recovery-code observation or recording during takeover. Next browser command after confirmation and any heavy-suite completion: inspect only nonsensitive completion/link visibility, then open /admin.

Missing credential input: protected local file path for the already-created Google local sign-in client. Exact client-named JSON was absent from Downloads. Send the file path only, never the key; direct transfer to its masked /admin field is authorized. If not saved, report that so the supported provider recovery step can be prepared. No arbitrary secret search.

## Remaining boundaries

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
| O12 | Git publication if it triggers deploy/cost | Conditional. Private repository and no Actions workflows/hooks observed; app triggers not certified |

Google policy/client-creation handoffs are DONE and superseded. Sheets/Gmail enabled; billing unlinked; External/Testing identity configured. No integration client/test users/access grant or live provider verification. Prior chronology preserved in owner-actions-before-local-runtime.md.

Supported local supervisor: exec session66698; stop only its recorded child trees through write_stdin with stop plus newline. Current owner cp21 build predates helper fixes. cp23 frozen; non-browser checks passed and one-build browser gates running in the separate test stack. Claude review remains. Existing worktrees/databases and all inherited edits are preserved.

Executor takeover: preserve the existing owner MFA handoff; no password, OTP, seed, credential search or browser recording was performed in this session. Landing and local gates continue independently. New approval boundaries unchanged.
# Current executor update — 2026-09-30

The owner has additionally authorized a broader useful EN/AR scenario library and use of available Claude/Astra/Gemini helpers as needed. This does not authorize product-provider spending, DNS/Pi changes, merge, public launch, or invitations. The prior aggregate product AI cap remains USD0.

The public localhost3000 Chrome tab is an older loaded page with no corresponding local server listener during the current retest. Latest-candidate header testing will use the supervised isolated test stack. The private owner MFA/setup tab has not been inspected or controlled in this takeover. Its earlier pending owner action remains pending until privately confirmed.

No new owner login or secret entry is required for local scenario work. Audience preference was requested asynchronously; small businesses and everyday teams are the working default while optional clarification is pending.
