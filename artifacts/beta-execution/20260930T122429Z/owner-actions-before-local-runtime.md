# Owner actions — private beta

Authority: [BETA_EXECUTION_BRIEF.md](BETA_EXECUTION_BRIEF.md). MERGED: NO. PUBLIC PRODUCTION APPROVED: NO. No worktree deletion or real invitations.

No password, OTP, API key, bootstrap code, recovery material, cookie or SSH private key belongs in chat or evidence. Account login does not approve spend, DNS, deployment or public exposure. Each action below is pending until explicitly confirmed; this list is not a request to perform every action now.

Latest owner constraint, 2026-09-30: spend cap $0. Paid services, billing activation, payment methods, purchases, subscriptions, top-ups and billable AI/API requests are prohibited under current instructions. Use only verified no-cost routes within free quotas; uncertain cost remains blocked. Owner reported Sheets activation; Chrome verified Enabled. Account/profile confirmation and OAuth setup remain pending. Memory extension saved at owner's explicit request.

| ID | Required when reached | Current state | Bounded purpose |
|---|---|---|---|
| O01 | External login/MFA/CAPTCHA when reached | Current owner-directed Chrome signed in; no further general confirmation pending | Owner-managed Sheets/Gmail activation and repeated autonomous-continuation instruction designate current setup target; isolated sign-in window remains untouched |
| O02 | Scoped credential creation/storage and secret entry | USER ACTION REQUIRED — Google local sign-in client creation | Prepared client, Create not clicked; owner stores generated secret privately and closes popup before reply. Later platform OAuth/email/Paddle use protected /admin; customer AI uses Settings → AI Providers |
| O03 | Non-disposable key migration approval if reuse audit finds one | NOT REQUIRED by current named audit | No exposed-key reuse in audited dev/staging settings/containers; disposable configs remediated under brief, old DBs preserved |
| O04 | Approved domain and secure Pi SSH target; read-only host inspection approval | PENDING INPUTS | Architecture/OS/RAM/storage/workloads only; no deploy/reboot/services/DNS changes |
| O05 | Sensitive Google/Slack/GitHub consent | NOT REACHED | Named test accounts, actual callback, least implementation-required scopes; no broad business-resource access |
| O06 | Bounded AI testing budget across providers/retries/benchmark | NOT REACHED | Unknown cost is not free; no top-ups or payment activation |
| O07 | Exact DNS/sending-domain/tunnel changes | NOT REACHED | Existing routing preserved; named persistent tunnel; public exposure requires specific approval |
| O08 | Exact beta deployment approval | NOT REACHED | Verified host/domain + SHA/digest/architecture + service/DNS/tunnel changes + backup/rollback + cost + invite-only, sandbox billing, no invitations |
| O09 | Real owner admin MFA enrollment and recovery storage | NOT REACHED | Private bootstrap only; disposable QA enrollment is not owner setup |
| O10 | Claude review of executor changes/evidence | PENDING | Own checks are not independent review; no fabricated coordinator approval |
| O11 | Purchases, legal/business attestations, identity verification | Google User Data Policy handoff DONE by owner; other attestations not reached | Owner replied done, configured identity verified. No purchases allowed under $0 cap |
| O12 | Publication approval if push/PR deploys or incurs unapproved cost | CONDITIONAL | Inspect actual repository visibility/workflows before publication |

## Handoff format

CURRENT HANDOFF superseding earlier policy request: Google client creation page `https://console.cloud.google.com/auth/clients/create?project=flowline-beta`, tab 846411866. Web client Flowline Beta - local sign-in is prepared with only `http://localhost:3000/api/auth/callback/google`; sign-in is kept separate from AI-agent/integration clients following Google console guidance. Owner clicks Create, saves generated client credential in protected secret storage, closes the secret dialog, then replies done. Do not send/download-to-chat any credential JSON, key or secret. Automation and recording stop before creation. No billing activation or Gmail/Sheets data consent is included; no client has been created by executor. Local callback configuration is verified; application readiness/sign-in not yet tested.

LATEST ACTIVE HANDOFF — Google User Data Policy: tab 846411866, `https://console.cloud.google.com/auth/overview/create?project=flowline-beta`. OAuth form prepared for Flowline Beta using the available signed-in account for support/notifications and External audience in testing mode. Owner must review the Google API Services User Data Policy, check agreement, click Continue and Create if accepted, then reply done. Agreement remains unchecked; no creation submitted. No billing activation/cost or OAuth data access granted by this form. Stop automation/recording during takeover; after reply inspect non-sensitive overview state. This supersedes earlier generic login/account-confirmation wording. Screenshot: google-oauth-policy-handoff-20260930.jpg in this run's artifacts.

Current handoff (supersedes prior general sign-in request): Google Auth creation wizard at `https://console.cloud.google.com/auth/overview/create?project=flowline-beta`, tab 846411866. Confirm current Chrome account/project/profile designation using the question surfaced in this window. $0 cap unchanged, no billing account linked, no configuration submitted. App name/support email, External testing audience, developer contact and final policy acceptance remain unset. Sensitive consent, policy acceptance and secret entry will receive specific owner handoffs when reached.

2026-09-30 resumed Chrome assistance: owner explicitly requested computer use in Chrome. Browser 1 / tab 846411866 is signed in and now at `https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=flowline-beta`. Google Sheets API displays Enable; executor has not clicked it. Current handoff is confirmation that the signed-in account/project and browser profile are designated for Flowline beta setup, rather than another sign-in request. Dedicated-profile identity remains unconfirmed. No resource, billing, OAuth or credential changes performed. Original isolated login window remains untouched.

Latest navigation update: owner requested computer-use controls and a new Chrome tab. Tab 846411866 is open at `https://console.cloud.google.com/apis/dashboard?project=flowline-beta` through cua_repl. Existing Flowline beta project observed in an already signed-in browser. No configuration/credential/billing changes; designated test-account confirmation is still needed before configuring resources. The original isolated login session remains idle and uninspected. See chrome-navigation.json in this run's evidence.

Active handoff: Google, dedicated Flowline setup Chrome at `https://accounts.google.com/v3/signin/identifier`, from `https://console.cloud.google.com/`. Sign in directly with designated Flowline test account, completing MFA/CAPTCHA yourself. Purpose: confirm account before deduplicating test project. Cost/permission change: none, no billing/resources/consent/DNS approved. Reply “done”; never send credentials in chat. Session 29596 is idle with no recording; no inspection resumes before confirmation.

USER ACTION REQUIRED — <service>
Page/window: <exact official page in the dedicated setup browser>
Action: <one precise action>
Purpose and affected account: <named test/beta account and purpose>
Cost/permission change: <none or exact proposal including target, change, risk, cost and rollback>
Reply “done” when finished. Do not send passwords, OTPs or keys in chat.

During each takeover, affected-browser agents and recording stop. Resume only after the owner's reply and inspection of non-sensitive state. Keep independent safe repository work moving while external dependencies are unavailable.
