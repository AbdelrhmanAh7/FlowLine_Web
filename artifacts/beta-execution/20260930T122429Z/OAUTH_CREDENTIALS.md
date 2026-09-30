# OAuth and workflow credential inventory — 2026-09-30

Owned by the bounded OAuth inventory/helper lane. No raw credential values, browser access, account mutations or publication. Spend cap **$0**. MERGED: NO. PUBLIC PRODUCTION APPROVED: NO.

This inventory comes from current source and current official provider documentation. Provider setup status comes from the primary's ledger and owner messages; this lane has not independently inspected external accounts. Owner replied Done to Google local sign-in credential creation/storage. Primary must inspect only the non-sensitive client list and the application's configured status. CREATED, CONFIGURED, CONNECTED and LIVE VERIFIED remain separate states.

## Supported configuration

| Purpose | Intended Flowline UI | Inputs | Callback |
| --- | --- | --- | --- |
| `signin.google` | `/admin` → Sign-in apps → Google sign-in | Client ID + masked Secret (`pub-signin.google`, `sec-signin.google`) | `<auth-origin>/api/auth/callback/google` |
| `integration.google` | `/admin` → Integration apps → Google (Gmail, Sheets), then workspace Integrations → Connect | Separate integration Client ID + masked Secret (`pub-integration.google`, `sec-integration.google`) | `<FLOWLINE_PUBLIC_URL>/api/oauth/callback` |
| `integration.slack` | `/admin` → Integration apps → Slack, then workspace Integrations → Connect | Client ID + masked Secret (`pub-integration.slack`, `sec-integration.slack`) | `<FLOWLINE_PUBLIC_URL>/api/oauth/callback` |
| `signin.github` | `/admin` → Sign-in apps → GitHub sign-in | OAuth Client ID + masked Secret (`pub-signin.github`, `sec-signin.github`) | `<auth-origin>/api/auth/callback/github` |
| GitHub workspace connection | Workspace Integrations → GitHub → Connect | Label, visibility, masked Personal access token (`f-token`) | No OAuth callback for this implemented PAT journey |

Source: `src/server/platform-purposes.ts`, `platform-uris.ts`, `oauth-client.ts`, `src/app/admin/panel.tsx`, `src/app/w/[slug]/integrations/page.tsx`. Sign-in credentials are loaded from protected platform storage, not runtime environment fallback. Do not replace customer onboarding with environment edits or SQL.

The prepared Google local sign-in client used `http://localhost:3000/api/auth/callback/google`. Register the local integration callback `http://localhost:3000/api/oauth/callback` only after primary verifies the active server's trusted public/auth origin. Do not register a placeholder beta hostname. The protected admin panel displays authoritative callbacks from operator configuration; workspace OAuth Apps displays the current browser origin and may differ if accessed through an alias.

Workspace owners can optionally configure their own integration apps at Settings → OAuth Apps: public `oa-client-google|slack|github`, masked `oa-secret-google|slack|github`. Use `/admin` for Flowline-owned apps. Gmail and Sheets share the Google integration app; sign-in remains a separate purpose/client.

## Least implemented access and synthetic fixtures

| Provider | Implementation access | Minimum disposable fixture |
| --- | --- | --- |
| Sheets | Sheets read/write plus OpenID identity/email in the helper source change below; no Drive or Gmail permissions | One synthetic spreadsheet; record ID and range. Last column `flowline_id` stores append idempotency marker. |
| Gmail | `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send` | Dedicated test inbox and designated test recipient; synthetic messages/attachments only. |
| Slack | `chat:write`, `channels:read`, `channels:history` | Free dedicated workspace/app/public test channel. Invite bot to channel; record workspace/app/channel IDs and channel name. |
| GitHub | Prefer fine-grained PAT restricted to one private test repo, Pull requests Read + Issues Write, expiry | Separate private test repo, synthetic issue and PR. Never target FlowLine_Web or real business issues. |

GitHub provider currently has `authType: api_key`, although its definition also includes OAuth metadata with `repo` and `read:user`. The current Connect dialog follows `authType` and requests a masked PAT. A platform/workspace GitHub OAuth credential is not necessary for this PAT journey. Adapter supports PR read, PR-file listing and issue/PR comments; it does not create or close issues. Create/close the labelled test fixture in GitHub UI separately, preserving this coverage distinction. [Fine-grained endpoint permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)

Current GitHub OAuth registration documentation permits up to **10 callback URLs**. Separate local/beta apps can provide isolation; do not claim the obsolete one-callback restriction as current. [GitHub OAuth registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)

Slack's current metadata guide requires schemas registered in the app manifest; invalid metadata warns and is ignored. Register the adapter's `flowline_action` payload containing `idempotency_key`, then prove post and history retrieval with that marker. Adapter `verify` depends on it. This is a configuration requirement; no current live failure has been observed by this helper. Private-channel read scopes are not implemented by the present public-channel scope set. [Slack metadata](https://docs.slack.dev/messaging/message-metadata/), [Slack history access](https://docs.slack.dev/reference/methods/conversations.history/)

## Sheets identity scope correction

Before this helper change, Sheets authorization requested only `https://www.googleapis.com/auth/spreadsheets`, but `identity()` called `/oauth2/v3/userinfo` and used `sub` and optional email/name. `startOAuth()` uses that declared scope list directly. Google's OpenID documentation defines identity claims and identity scope requirements for UserInfo. The source therefore lacked the identity authorization its endpoint expects; this is a documented source-level mismatch, not a newly observed live-provider error. Existing grants can mask a fresh-client problem. [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)

Minimum source change: add `openid` and `email` alongside the existing Sheets scope. Do not add `profile`, Drive or Gmail access. `sub` provides stable account identity; email provides the existing useful connection label. If optional claims are withheld, the existing subject fallback remains valid. Action `requiredScopes` stays Sheets-only so identity scopes do not become artificial execution requirements for already-authorized actions.

Targeted coverage is added in `tests/contract/google_sheets.test.ts`: an external permission contract checks identity plus Sheets access and excludes unrelated permissions; every action remains Sheets-only; a UserInfo response withholding optional email/profile still yields a stable subject. All prior identity/read/append/idempotency assertions remain. Test result is recorded below after the primary grants a serialized lightweight test window.

The running local artifact remains the primary's frozen checkpoint 21 until rebuilt. This product change invalidates reuse of checkpoint-21 source/browser evidence as proof of the new tree. Primary must freeze a new candidate, run required gates/rebuild and obtain coordinator review. Google LIVE VERIFIED remains NOT RUN.

## AI-agent classification and provider limitations

`src/server/agents.ts` exposes `run_workflow` (default permission `ask`), so AI can trigger published workflows through their normal approval/limit path. Keep standard sign-in separate from integrations. The primary observed Google's AI-agent designation in the console; public client-management documentation retrieved by this helper did not define that console classification. Use the console's actual explanation for the integration client; do not silently classify it as standard sign-in or treat all deterministic integrations as AI agents. These REST adapters do not require paid Agent Runtime, MCP hosting or Google Cloud deployment. [Google client documentation](https://support.google.com/cloud/answer/15549257?hl=en)

Google external Testing grants for Sheets/Gmail have refresh tokens expiring after **7 days**; plan explicit owner reconnect, not an unattended permanent connection claim. Email/profile-only sign-in grants have a documented exception. Gmail `readonly` is restricted and `send` sensitive. Production scope verification/security-assessment requirements remain unfulfilled; confirm applicable testing exemptions before widening beyond synthetic designated users. [Google OAuth limits](https://developers.google.com/identity/protocols/oauth2), [Gmail scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes)

Google full client secrets are visible/downloadable only at creation. The owner-saved credential must enter the application's masked Secret field privately. Do not search arbitrary downloads or inspect secret popups. No screenshot/DOM recording during entry. If safely transferring directly without tool output is unsupported, owner pastes directly and confirms completion. [Google secret visibility](https://support.google.com/cloud/answer/15549257?hl=en)

## Zero-spend controls

- Billing remains unlinked under the primary's last observation; this helper has not rechecked it. No billing activation, cards, credits, trials requiring payment, quota increases, upgrades or paid hosting.
- Sheets standard usage is no additional cost; published read/write limits separately are 300 requests/minute/project and 60/minute/user/project. Future over-quota billing is announced for later 2026. Bound requests and retries; check actual project quotas before traffic. [Sheets limits/pricing](https://developers.google.com/workspace/sheets/api/limits)
- Gmail published daily threshold is 80,000,000 quota units/project, with no extra charges below threshold; actual project quotas matter. Published current per-minute quotas are 1,200,000/project and 6,000/user/project. More billing details are announced for later 2026. Do not increase limits or assume every Cloud service is free. [Gmail quotas](https://developers.google.com/workspace/gmail/api/reference/quota)
- Slack Free allows 10 custom/third-party apps and 90-day visible history; no paid upgrade. History has stricter rates for commercially distributed non-Marketplace apps than internal apps; determine the actual classification and keep traffic bounded. [Slack Free limits](https://slack.com/help/articles/115002422943-Usage-limits-for-free-workspaces), [Slack API limits](https://docs.slack.dev/reference/methods/conversations.history/)

## Remaining handoffs

Primary owns Chrome and all UI execution. Owner login/MFA/CAPTCHA, sensitive consent, secret entry and consequential approvals retain brief sections 2–4 handoffs. Complete Google masked platform configuration after local readiness, dedicated test users/inbox/Sheet, then prove Connect/read/action/result/revoke/reconnect. Slack account/app/channel and GitHub test repo/token are still uncertified. No provider is CONNECTED or LIVE VERIFIED from this inventory alone.

### Targeted verification

Primary granted one focused serialized window, with Chrome exploration paused. `pnpm exec vitest run --project contract tests/contract/google_sheets.test.ts --maxWorkers=1` completed with exit 0: **1 file, 6 tests passed**, Vitest 5.0.2, start 19:42:21 local, duration 919 ms. Process finished; no broadening or repeat. This is deterministic local contract evidence, not Google live verification or independent review. No full suites run by this helper.
