# AI providers

This is the provider record for the AI hub. It says which providers are implemented, which are unsuitable or
deferred, and why. Endpoint, pricing and terms descriptions below are the repository's **2026-09-29 research
snapshot**, checked against the registry/catalogue in this pass; current vendor terms, availability and prices are
**unverified**. This is not a fresh vendor or legal certification.

- **Source of truth:** `artifacts/ai-hub/research/providers-2026-09-29.md`. It uses official vendor sources only and
  was checked on **2026-09-29**. Every endpoint, auth scheme, error rule and price in the code cites a URL from it.
- **Code:** `src/ai/hub/registry.ts` holds the provider definitions (sources, verdict, evidence). Curated prices are
  in `src/ai/hub/catalogue.ts`.
- **Where the research says UNKNOWN,** the code keeps it unknown. Unknown prices are not 0. Unknown capabilities are
  `UNKNOWN`, not `SUPPORTED`.

## Verification levels

| Level | Meaning | Status |
|---|---|---|
| IMPLEMENTED | The adapter exists and can be connected. | All implemented providers |
| CONTRACT VERIFIED | Tested against a protocol-accurate test double built from the documented shapes (`e2e/fakes/ai-protocols.ts`): request/response, endpoint, discovery and pagination, streaming, tools, schema rejection, usage, errors and provider quirks. | All implemented providers |
| LIVE VERIFIED | Evidence from a real call on an owner-authorised connection; no automatic promotion in current code. | No live certification evidence located; current account/key state is unverified. The private-beta spend cap remains **$0**. |

## Core providers (15)

| Provider | Status | Verdict | Protocol(s) | Discovery | Connection fields | Free tier | Training on API data | Live |
|---|---|---|---|---|---|---|---|---|
| OpenAI | IMPLEMENTED | SUITABLE | Chat Completions (default), Responses (per connection) | `GET /v1/models` | optional org / project IDs, API choice | none | no | NOT RUN |
| Anthropic | IMPLEMENTED | SUITABLE | Messages (native; the OpenAI compat layer is test-only and is not used) | `GET /v1/models` (cursor, capabilities) | optional workspace ID | trial credits | no | NOT RUN |
| Google Gemini API | IMPLEMENTED | SUITABLE WITH LIMITS | generateContent / streamGenerateContent (`x-goog-api-key` header only) | `GET /v1beta/models` (pageToken; chat models only) | — | limited free tier (training + human review) | depends on tier | NOT RUN |
| xAI | IMPLEMENTED | SUITABLE WITH LIMITS | Responses (default), legacy Chat | `GET /v1/models` (per key) | API choice | none | unknown | NOT RUN |
| Groq | IMPLEMENTED | SUITABLE WITH LIMITS | Chat (default), Responses | `GET /openai/v1/models` | API choice | limited free plan | no | NOT RUN |
| OpenRouter (gateway) | IMPLEMENTED | SUITABLE WITH LIMITS | Chat (canonical) | `GET /api/v1/models` (offset; prices, supported_parameters) | — | `:free` variants (quota) | depends on upstream | NOT RUN |
| Mistral AI | IMPLEMENTED | SUITABLE WITH LIMITS | Chat | `GET /v1/models` | — | free mode (may train) | depends on mode | NOT RUN |
| Cohere | IMPLEMENTED | SUITABLE WITH LIMITS (weakest) | v2 chat (native) | `GET /v1/models?endpoint=chat` (page_token) | — | trial keys (non-commercial) | depends (opt-out) | NOT RUN |
| DeepSeek | IMPLEMENTED | SUITABLE WITH LIMITS | Chat (json_object only → prompted schema) | `GET /models` | — | none | unknown | NOT RUN |
| Z.ai (GLM) | IMPLEMENTED | SUITABLE WITH LIMITS (pay-as-you-go keys only) | Chat (`/api/paas/v4`) | **static catalogue** (no list endpoint) | pay-as-you-go attestation | some models listed "Free" | no | NOT RUN |
| Moonshot (Kimi) | IMPLEMENTED | SUITABLE WITH LIMITS (legal review) | Chat | `GET /v1/models` | pay-as-you-go attestation | trial-style voucher | yes (default) | NOT RUN |
| MiniMax | IMPLEMENTED | SUITABLE WITH LIMITS (provisional) | Chat (in-band `base_resp` errors handled) | `GET /v1/models` | pay-as-you-go attestation | none | unknown | NOT RUN |
| Alibaba Model Studio | IMPLEMENTED | SUITABLE WITH LIMITS | Chat on the **workspace domain** `https://{workspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1` (not the legacy `dashscope-intl`) | **static catalogue** | region (Singapore / Beijing) + workspace ID + attestation | trial quota | no (excerpt) | NOT RUN |
| OpenCode Zen | **UNSUITABLE** | UNSUITABLE | — | — | — | — | — | not built |
| Command Code Provider API | **UNSUITABLE** (pending owner review) | UNSUITABLE_PENDING_OWNER_REVIEW | — | — | — | — | — | not built |

## Expansion providers (8)

| Provider | Status | Verdict | Protocol | Discovery | Fields | Notes | Live |
|---|---|---|---|---|---|---|---|
| Cerebras | IMPLEMENTED | SUITABLE WITH LIMITS | Chat | `GET /v1/models` | — | $5 trial credits (30-day expiry); prices UNKNOWN | NOT RUN |
| Together AI | IMPLEMENTED | SUITABLE | Chat | `GET /v1/models` (bare array) | — | 403 means context too long; recommend ZDR | NOT RUN |
| Fireworks AI | IMPLEMENTED | SUITABLE WITH LIMITS | Chat (`/inference/v1`) | `GET /v1/accounts/fireworks/models` (pageToken) | — | §1.2(d) credential-sharing clause: legal question | NOT RUN |
| DeepInfra | IMPLEMENTED | SUITABLE WITH LIMITS | Chat (`/v1/openai`) | public `GET /models/list` | — | §11(a)(viii) credential clause; listing units undocumented, so prices stay unknown | NOT RUN |
| Hugging Face Inference Providers | IMPLEMENTED | SUITABLE WITH LIMITS | Chat (default), Responses (beta) | `GET /v1/models` | API choice, optional `X-HF-Bill-To` | features vary per routed provider | NOT RUN |
| Cloudflare Workers AI | IMPLEMENTED | SUITABLE WITH LIMITS | Chat (`/client/v4/accounts/{accountId}/ai/v1`) | `…/ai/models/search` (page/per_page) | account ID | model ids read from `result[].name` (field names not in the research; live check pending) | NOT RUN |
| Vercel AI Gateway | IMPLEMENTED | SUITABLE | Chat | public `GET /v1/models` (prices, tags) | — | free credit only on a subset of models; needs a card | NOT RUN |
| NVIDIA API catalog | **UNSUITABLE** | UNSUITABLE | — | — | — | Trial Terms §1.2 / §1.4: evaluation only, not production | not built |

## Deferred enterprise clouds (3): documented, not built

| Provider | What building it needs |
|---|---|
| Amazon Bedrock | Region, a choice of key type (SigV4 access key + secret, or Bedrock API keys: short-term keys expire within 12 h, and long-term keys are "for exploration only"), the `bedrock-runtime …/openai/v1/chat/completions` endpoint (no `/models`) or `bedrock-mantle` (has `/models`), `ListFoundationModels` / `ListInferenceProfiles` discovery, and cross-region profile ids. |
| Azure OpenAI / Microsoft Foundry | Resource name, `api-key`, deployment names as model ids (there is no global catalogue), and an allowlist of each resource's `{resource}.openai.azure.com` host. |
| Google Vertex AI | Project and location, storage and refresh for a service-account credential (or OAuth), and per-location `{location}-aiplatform.googleapis.com` hosts. Express-mode API keys are positioned for testing. |

## Unsuitable: the evidence

These entries stay in the registry with their verdict (no core target is dropped silently). They are never
connectable, and the UI lists them without a connect card.

- **OpenCode Zen:**
  - The ToS (effective 2026-08-15, https://opencode.ai/legal/terms-of-service) says: "You will only use the Services
    for your own internal use, and not on behalf of or for the benefit of any third party". Zen is named as a Service.
  - Discovery returns ids only, and errors are undocumented.
  - OpenCode Go is unsuitable too: it is for coding-agent traffic only, and needs a coding-agent User-Agent and a
    session header.
- **Command Code Provider API (pending owner review):**
  - The Terms (updated 2026-09-20, https://commandcode.ai/terms) forbid sublicensing or transferring access and
    "automated requests".
  - Payments must be made "within the United States".
  - Three official pages disagree on which plans include API access.
  - It is technically clean (Chat, Responses, Messages, and `/models` with `supported_endpoints`).
  - The owner or legal review decides. If it is approved, handle `403 upgrade_required`.
- **NVIDIA API catalog:**
  - Trial Terms §1.2: "without use of the API Service or Generated Content in production". §1.4: "internal testing
    and evaluation purposes, not in production".
  - Running customer workflows is production use.
- **GitHub Models:** retired on 2026-07-30, including the inference API and BYOK
  (https://github.blog/changelog/2026-07-30-github-models-is-now-retired/). It is **not registered**, only recorded
  in `RETIRED_NOT_ADDED`.

## Coding-plan and subscription keys

These providers' coding or subscription plans forbid use outside their supported coding tools.

- **Flowline only calls the pay-as-you-go endpoints.** No custom base URL is accepted, so coding endpoints
  (`/api/coding/paas/v4`, `api.kimi.ai/coding`, `coding-intl.dashscope…`, `token-plan…`) can never be reached.
- **Z.ai, Moonshot, MiniMax and Alibaba connections need an explicit pay-as-you-go attestation.** The connect dialog
  shows the warning. The API returns `422 AI_PLAN_ATTESTATION_REQUIRED` without the attestation.
- **Detectable error codes are refused with a reason:**
  - Z.ai `1309` / `1315` → `AI_PLAN_NOT_ALLOWED`.
  - Cohere trial-key 429 → `AI_TRIAL_KEY`.
- **Key prefixes are not documented for any provider,** so keys are never refused by their shape.

## Out-of-balance errors are never retried

| Provider | Signal | Code |
|---|---|---|
| OpenAI | 429 `insufficient_quota` | `AI_QUOTA_EXCEEDED` |
| Anthropic | 402 `billing_error`; spend-cap 429 **without** retry-after | `AI_QUOTA_EXCEEDED` |
| Gemini | 402 `payment_required`; 429 `quota_exceeded` (daily) | `AI_QUOTA_EXCEEDED` |
| DeepSeek | 402 | `AI_QUOTA_EXCEEDED` |
| Z.ai | 429 with code 1113 (1308/1310 quota) | `AI_QUOTA_EXCEEDED` |
| Moonshot | 429 `exceeded_current_quota_error` | `AI_QUOTA_EXCEEDED` |
| MiniMax | `base_resp.status_code` 1008 (even in a 200) | `AI_QUOTA_EXCEEDED` |
| Alibaba | 400 `Arrearage`, 429 `BudgetLimitExceeded`, 403 `AllocationQuota.FreeTierOnly` | `AI_QUOTA_EXCEEDED` |
| OpenRouter / Together / Vercel / Cohere | 402 | `AI_QUOTA_EXCEEDED` |

Other quirks are handled and contract-tested:

- Anthropic 529 and Groq 498 → overloaded (retryable).
- Groq and Cohere 499 → cancelled.
- OpenRouter errors after a 200 (in-band or mid-stream).
- Together 403 → context too long.
- Vercel `customer_verification_required` → account action required.
- Gemini `FAILED_PRECONDITION` → account action required.
- Moderation blocks (Kimi `content_filter`, Alibaba `DataInspectionFailed`, OpenRouter 403) → `AI_SAFETY_REFUSAL`,
  which is never retried or routed elsewhere.

## Prices (curated, version 1, checked 2026-09-29)

- **Official pages only.** Prices come only from official pricing pages, or from a documented list API (OpenRouter and
  Vercel list USD per token). Each price carries its source URL and check date, and is in USD.
- **Another currency or region means unknown.** A workspace in another currency gets an unknown price, never a
  converted one. Alibaba prices apply to Singapore connections only.
- **DeepSeek prices are the peak prices.** Off-peak is half, so estimates are an upper bound.
- **MiniMax-M3 prices double above 512k input tokens.**
- **Qwen3.7-Plus above 256K tokens is unpriced.** The research has no price for that tier.
- **Ids taken from display names are flagged "unverified id" in the picker until a live list confirms them.** This
  covers the Anthropic, Gemini, Groq, Z.ai, Alibaba and Cohere entries.
- **No price is invented.** Mistral, Cerebras, Fireworks, Cloudflare and HF prices, and Cohere's current models, are
  UNKNOWN in the research and are left unknown.

## Legal review before a public BYOK launch

The research flags these clauses for owner or legal review:

- Cohere SaaS §4(a)(i).
- Moonshot §3.2(6).
- Fireworks §1.2(d).
- DeepInfra §11(a)(viii).
- Cloudflare §2.2.1(a).
- xAI and Mistral terms, which were only readable as search excerpts.
- MiniMax pay-as-you-go ToS, which could not be read.

The code does not hide these clauses. Each one is shown on its provider card (`termsNotes`, `verdictEvidence`).
