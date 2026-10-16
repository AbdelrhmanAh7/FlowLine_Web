# AI and admin credential lane — 2026-09-30

Prepared by the bounded helper authorized by the owner's swarm request. Source inspection and official provider documentation only; no raw credentials read, provider/model requests, browser access, account changes, tokens issued, service changes, or independent-review claim.

## Credential boundary

| Domain | Required inputs | Destination |
|---|---|---|
| Infrastructure | DB URL, auth secret, independent workspace/platform encryption roots | Protected operator storage/runtime bootstrap |
| First platform admin | Bound owner identity, private challenge, verified email, owner TOTP/recovery material | `/admin/setup` |
| Platform service credentials | Google/GitHub sign-in client IDs/secrets; Google/Slack/GitHub integration client IDs/secrets; Resend sending key/sender; Paddle sandbox backend key/public client token/webhook secret | `/admin`, MFA + fresh step-up |
| Customer AI | Direct/gateway connection names and scoped provider API keys | `/w/<slug>/settings?tab=ai`, owner-only initially |
| Customer integrations | Named test-resource consent/access | Flowline Connect UI |
| Optional workspace OAuth override | Workspace-owned app ID/secret | Settings → OAuth apps; integrations only |

Source: `src/server/platform-purposes.ts`, `src/server/platform-setup.ts`, `src/server/platform-access.ts`, `src/app/admin/panel.tsx`, `src/app/admin/setup/setup-flow.tsx`, `src/app/w/[slug]/settings/ai-providers.tsx`, `docs/security/CREDENTIALS_DESIGN.md`.

Keys are write-only; never place them in arguments, returned tool output, screenshots, DOM dumps, logs, artifacts, or Git. Prefer safe direct private transfer; otherwise the owner enters them into masked fields with recording/control stopped. Server AI environment keys are ignored and never substitute for customer UI onboarding.

## Fresh local staging owner/admin sequence

1. Use a new dedicated staging DB, independent protected root keys, `FLOWLINE_ENV=staging`, invite-only beta mode, and the supported staging DB email outbox. Migration journal has 20 entries, indices 0–19, through `0019_hub_retest_data`; inspect actual applied state.
2. The owner email can sign up through `FLOWLINE_BETA_ADMINS` (signup permission only), or an already redeemed, unexpired bootstrap setup challenge permits its bound identity. Neither creates an admin by itself.
3. Issue/redeem the challenge privately at `/admin/setup`; signup/login as the bound identity and consume its real verification link. Staging outbox verifies local delivery/link consumption only, not external inbox deliverability.
4. Owner enrolls TOTP and stores recovery material privately, then completes setup with a fresh code. Challenge is 30 minutes, setup session 60 minutes; completion is permanent, atomic and audited.
5. In `/admin`, unlock changes and enter service credentials directly in their intended cards. Save/Test and later actual sign-in/connect/delivery verification are distinct transitions.

**Secret stop:** `scripts/admin/bootstrap.mts` prints its raw challenge. Do not invoke it through captured shell tools/logs. A supported private-transfer wrapper or owner-operated protected terminal is required; never screenshot the token, verification-link token, authenticator seed, or recovery codes.

## Zero-spend direct + gateway shortlist

| Candidate | Why eligible for current Flowline price controls | Remaining prerequisites |
|---|---|---|
| Direct Z.ai `glm-4.7-flash` (other zero-price variants: `glm-4.5-flash`, `glm-4.6v-flash`) | Official pricing currently lists input/cache/output Free; implementation has verified catalogue zero prices | Confirmed general API account/key, not Coding Plan; owner key-type attestation; private key entry; real call/model-ID verification; account quota inspection |
| OpenRouter gateway, freshly discovered `:free` model | Official/listing zero-price metadata can qualify for FREE_ONLY | Confirmed account/scoped key; model-specific/upstream terms; live quota/availability check; no card, top-up or paid fallback |

Official sources checked 2026-09-30:

- [Z.ai pricing](https://docs.z.ai/guides/overview/pricing): the three Flash variants above are free; built-in web search costs $0.01/use and must be excluded. Quota/durability is not a published permanent guarantee.
- [Z.ai Terms](https://docs.z.ai/legal-agreement/terms-of-use): general API terms address service for end users; API content is not used for improvement absent agreement. [Coding Plan policy](https://docs.z.ai/devpack/usage-policy): restricted Coding Plan keys are not general API credentials. These are source observations, not legal approval.
- [OpenRouter pricing](https://openrouter.ai/pricing): free plan, free models only, 50 requests/day. [Official quota guide](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/): 20 RPM; failed requests consume allowance.
- [OpenRouter Terms](https://openrouter.ai/terms): current prepaid-credit wording is broader than the free pricing/docs. Availability is eligible pending real dashboard verification. If payment is required, stop and mark blocked; never buy credits under the $0 constraint. Upstream model terms vary.
- [Groq limits](https://console.groq.com/docs/rate-limits) documents quota-limited free-plan models. Groq and Gemini quota-based free usage do not currently qualify for Flowline FREE_ONLY when catalogue prices are positive or zero usage cannot be independently established.

Before inference: workspace currency USD, monthly budget 0, FREE_ONLY, `allowUnknownCost=false`, no alternatives, no owner-entered price override. Unknown cost is not free. OpenRouter is refused when no-training privacy is required because implementation cannot guarantee upstream terms.

**UI inference-test caveat:** metadata test/discovery does not generate. The explicit inference test sends up to 8 output tokens with one attempt and overrides FREE_ONLY with MANUAL. Use only a freshly confirmed official-zero model and retain budget 0; do not select arbitrary paid/unknown models.

Live acceptance still needs discovery, model selection, generation/usage, persistence after reload/restart, rotation, disconnect, workspace isolation, and no global-key fallback. No such new live evidence is claimed here.

## New current benchmark runner

`scripts/diag/copilot-benchmark-hub.mts` is newly prepared; the historical runner is intact. It uses the actual async workspace/actor/pinned route facade and normal hub metering. It makes no model calls until explicitly executed after preflight. This file is not part of checkpoint 21; primary must freeze the changed candidate and finish appropriate gates before running it.

Safeguards:

- `--describe` is offline and imports no DB/auth runtime. It checks the copied frozen 12 English cases/helpers/predicates against the historical source.
- Default mode is metadata-only preflight; `--execute` and a bounded `--max-generations` are required to send.
- Requires a dedicated loopback staging DB name explicitly matching runtime configuration, a verified workspace-owner actor, USD budget 0, FREE_ONLY, unknown-cost refusal, no fallback/pool, HTTPS cloud route, and catalogue-verified zero price.
- Pins one connection/model for planning and repair. Re-checks workspace permissions/policy/price before every generation; real hub still re-checks connection membership and credential revision per attempt. No credentials, raw responses, generated patches, prompts, or graph content appear in output.
- Matches listed critical execution-source blobs against the explicit recovery checkpoint; that is only a source check, not an independent review or substitute for full candidate gates.
- Uses current unchanged Copilot instructions/repair behavior and normal hub retries. Reports a conservative maximum HTTP-attempt count of generation cap × 3. Provider errors/quota/cap stop the run as BLOCKED; incomplete cases cannot pass.
- Retains all 12 case prompts, helpers, predicates and order exactly. External actions have STATIC mapping checks only; local-only graph checks use the existing dry-run preview. No proposals are saved/published or live integrations executed.
- At most two runs (a stability repeat). Complete EN runs require >=10/12 individually. No frozen Arabic request set exists in the historical harness; AR remains NOT RUN rather than inventing translations or silently reporting full quality PASS. A separate frozen AR request set and review are still required.

Example structure (IDs and DB names are public configuration; root keys remain in approved protected runtime configuration):

```text
tsx scripts/diag/copilot-benchmark-hub.mts --describe
tsx scripts/diag/copilot-benchmark-hub.mts --workspace <workspace-id> --actor <user-id> --connection <connection-id> --model <exact-model-id> --database <dedicated-local-staging-db> --checkpoint refs/checkpoints/<new-reviewed-candidate>
```

Only after preflight/official zero-price verification and primary coordination, add `--execute --max-generations <bounded-limit>` and optionally `--runs 2`. Each invocation evaluates one pinned route; the approved shortlist is at most three routes. A single bilingual stability campaign can exceed OpenRouter's 50/day allowance after repairs/retries; spread runs across quota resets, or stop blocked. Never top up to finish.

The historical harness calls synchronous zero-argument `getAiProvider()`; current facade requires async `(db, workspace, actorUserId, opts)`. Do not run the historical harness as current cloud evidence. Copilot remains Experimental; cloud quality is NOT RUN until actual new evidence exists. MERGED: NO. PUBLIC PRODUCTION APPROVED: NO.
