# Paid-pilot provider verification matrix

Source inspected: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`, 2026-10-03. [Machine-readable AI inventory](../../artifacts/phase-4/paid-pilot-round1/provider-inventory.json). This is a source inventory, not live-provider certification. No real provider request, account consent or secret entry occurred this round. Local contracts used synthetic test doubles. No launch scope has been removed or narrowed.

## Workflow integrations

| Adapter | Implemented in source | Fresh live evidence this round | Owner setup and bounded target |
|---|---|---|---|
| Google Sheets | YES | BLOCKED | Workspace Integrations → Google; consent to a dedicated test spreadsheet/tab. |
| Gmail | YES | BLOCKED | Dedicated test mailbox and approved recipient allowlist; never personal mailbox automation. |
| Slack | YES | BLOCKED | Dedicated sandbox workspace/channel, least scopes, one synthetic message and controlled cleanup. |
| GitHub | YES | BLOCKED | Dedicated disposable private repository, restricted test installation; never this source repository as the action target. |
| HubSpot | YES; list-contact candidate prepared separately | BLOCKED | Dedicated test portal and scoped private-app token entered in the UI. |
| Zendesk | YES | BLOCKED | Dedicated test subdomain/agent and ticket fixture. |
| Airtable | YES | BLOCKED | Dedicated base/table and restricted token. |
| Snowflake | YES | BLOCKED | Dedicated read-only role/warehouse; verify any warehouse cost before executing. |
| Stripe workflow integration | YES | BLOCKED | Test-mode key, disposable sandbox customer/payment fixture; separate from FlowLine subscription billing. |
| Notion | YES | BLOCKED | Dedicated shared test page and limited integration access. |
| PostgreSQL | YES; historical real PostgreSQL 17 source marker | NOT RUN | Fresh dedicated target/connection and approved query scope required; historical local evidence is not current customer-resource certification. |
| Linear | YES | BLOCKED | Dedicated team/project and test issue. |

For **each advertised launch integration**, record exact candidate SHA, account/resource pseudonym, scopes, authentication/identity, bounded read/write, result persistence, quota/rate-limit/error behavior, lost-response handling, duplicate-safe retry, revoke/reconnect and cleanup. Run the full create → save → publish → manual/automated trigger → inspect → error → safe-retry journey. An OAuth callback or saved credential alone does not establish these results. Existing `tests/live/certification.test.ts` and `tests/live/certify/scenarios.ts` provide scenarios; their dry-run output is explicitly a test double. Do not invoke environment-loading wrappers under this round's no-`.env*`-read rule.

## AI providers

All twenty executable registry entries remain **BLOCKED for real EN/AR inference, costs, limits and failure verification**:

| Source tier | Implemented providers |
|---|---|
| Core | OpenAI, Anthropic, Google Gemini API, xAI, Groq, OpenRouter, Mistral AI, Cohere, DeepSeek, Z.ai, Moonshot AI, MiniMax, Alibaba Cloud Model Studio |
| Expansion | Cerebras, Together AI, Fireworks AI, DeepInfra, Hugging Face Inference Providers, Cloudflare Workers AI, Vercel AI Gateway |

OpenCode Zen, Command Code Provider API and NVIDIA API catalog are source-classified unsuitable; Amazon Bedrock, Azure OpenAI/Microsoft Foundry and Google Vertex AI are deferred. They are not executable launch providers. The registry's `verifiedAt` describes research, and `contractVerified` describes a source marker; neither is a live call certificate.

Owner action: `/w/<workspace-slug>/settings?tab=ai`, connect a dedicated API key through masked controls. In the official provider dashboard, verify the key's authorized API use, effective price/quota and absence of automatic overage. Under this round's $0 cap, unknown/billable usage stays BLOCKED. Individual Claude/Codex consumer or coding subscriptions do not authorize API automation.

For each advertised provider/model, retain metadata-only evidence for one approved Arabic case and one equivalent English case: actual provider/model identity, expected output/rubric, observed semantic quality, capability limits, actual token counts and provider billing reconciliation, enforced hard limits, invalid/revoked-key behavior, 429/Retry-After, timeout and server failure. Use dedicated synthetic data; never store prompts with customer data or raw provider credentials. Label simulated failures separately from real observations. The existing Copilot benchmark has a frozen **English** set; a local fake pass cannot establish EN or AR hosted-model quality.

## Identity, email and subscription dependencies

Google/GitHub/ZITADEL sign-in and local TOTP enforcement need fresh owner round-trip verification; Resend/Postmark email need real allowlisted delivery and verification/recovery; Paddle needs provider-signed sandbox checkout, renewal, cancellation and payment-failure evidence. These are separate dependencies from workflow adapters. Owner actions PP-02–PP-05 in [OWNER_ACTIONS.md](OWNER_ACTIONS.md) identify the pages. No invitation, live payment or production activation is authorized.
