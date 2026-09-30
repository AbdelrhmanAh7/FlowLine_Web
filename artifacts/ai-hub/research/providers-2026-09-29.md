# Flowline AI provider hub: provider research (BYOK)

Checked on **2026-09-29**, using official vendor sources only. Each fact in the per-provider sections carries its URL. **UNKNOWN** means the point could not be confirmed, and the attempt is noted. Some pages were read through a fetch tool that summarizes them. Where that happened, and where a fact rests only on a search-engine excerpt of an official page, the text says so. Check the exact wording of any legal clause before relying on it contractually.

## Findings that matter most

- **Retired, do not build: GitHub Models.** It closed to new customers on 2026-06-16 and was fully retired on 2026-07-30, including the inference API and BYOK (GitHub docs and changelog, section B9).
- **Unsuitable on their terms:**
  - **OpenCode Zen:** its terms limit use to "own internal use … not on behalf of or for the benefit of any third party".
  - **OpenCode Go:** it is limited to coding agents, requires a coding-agent User-Agent and an `x-opencode-session` header, and carries the same internal-use terms.
  - **NVIDIA API catalog:** its trial terms §1.2 and §1.4 allow "internal testing and evaluation … not in production".
- **Coding-plan keys must be refused.** This covers the Z.ai GLM Coding Plan, Kimi Code, the MiniMax Token Plan, the Alibaba Coding/Token Plans and OpenCode Go. The UI should recognise their base URLs or error codes and reject them with a reason.
- **Clauses against sharing credentials need owner/legal review before BYOK launch.** The model is a customer giving Flowline their key to call the provider on their behalf.
  - Cohere SaaS §4(a)(i).
  - Moonshot/Kimi §3.2(6): no buying, selling or transferring keys "to or with a third party".
  - Fireworks §1.2(d): "not share … authentication credentials".
  - DeepInfra §11(a)(viii).
  - Cloudflare §2.2.1(a): no signing up on behalf of a third party.
  - Keys may not be bought, sold or transferred at OpenAI (OSA §3.3(g)), Groq, Mistral (search excerpt) or Cerebras (search excerpt), and no reselling at OpenRouter (ToS §7(4)).
  - These clauses generally target resale or transfer. Flowline's use is the customer's own key, used for the customer's own benefit, which is permitted "Customer Application" usage where the terms say so (OpenAI OSA §2.2, Anthropic Commercial Terms, Groq §3.1, DeepSeek §1.1). The final call is legal's.
- **Region is checked where the request comes from.** For OpenAI and others, with BYOK that is Flowline's server region, not the customer's country. Egypt is confirmed supported for OpenAI, Anthropic and Gemini. Every other provider either does not list it or gives no country list at all, so it is UNKNOWN (Z.ai and Cohere's restricted lists do not include Egypt). Command Code says payments must be made "within the United States".
- **Cost in the response:** only xAI (`cost_in_usd_ticks`) and OpenRouter (`usage.cost`) report it inline. Vercel AI Gateway exposes cost for each request through a lookup.
- **Model lists with pricing:** OpenRouter, xAI `/v1/language-models`, Together, DeepInfra, HF router and Vercel. Z.ai and Alibaba have no list endpoint, so they need a static catalog.
- **"Out of balance" is not always a 429 you can retry.**
  - DeepSeek returns 402.
  - Z.ai returns 429 with code 1113.
  - Kimi returns a 429 quota error type.
  - MiniMax returns body code 1008.
  - Alibaba returns 400 `Arrearage`.
  - Anthropic's spend-cap 429 has no retry-after.
  - OpenAI distinguishes `insufficient_quota` (quota exhausted) from rate limiting.
  - Mistral's quota 429 lasts until the billing cycle ends.
  - Also handle Anthropic 529, Groq 498/499, and OpenRouter errors that arrive mid-stream after HTTP 200.
- **Alibaba's legacy domain `dashscope-intl` gets no new features after 2026-09-30.** The recommended endpoints are per workspace, so the connection form needs the region and workspace ID as well as the key.
- **Anthropic's OpenAI-compatible layer is documented as test-only.** It ignores `response_format` and strict tools, so use native Messages. Accept Console API keys only, never Claude.ai Free/Pro/Max credentials.

## Pages that could not be read directly

- **OpenAI:** platform.openai.com, help.openai.com and openai.com/policies returned 403, so developers.openai.com and the OSA PDF on cdn.openai.com were used instead.
- **xAI** (x.ai/legal) and **Mistral** (legal.mistral.ai): terms come from search excerpts only.
- **Cerebras** (terms page is script-rendered) and **MiniMax** (platform ToS is script-rendered): terms are search snippets only, or UNKNOWN.

---

# Part A: core providers (OpenAI, Anthropic, Gemini, xAI, Groq, OpenRouter, Mistral, Cohere)

## 1. OpenAI (API platform)

1. **Status:** active. Chat Completions is **not deprecated** and has no shutdown date. Assistants API shutdown: Aug 26 2026 (replaced by Responses + Conversations). Model snapshots are retired regularly; for example, older GPT-5/o3 snapshots shut down on Dec 11 2026. Source: https://developers.openai.com/api/docs/deprecations
2. **Endpoints:** base `https://api.openai.com/v1`. Inference uses `POST /v1/responses` (OpenAI Responses, the vendor's primary API) and `POST /v1/chat/completions` (Chat Completions). Sources: https://developers.openai.com/api/reference/overview, https://developers.openai.com/api/reference/resources/responses/methods/create, https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create (found by search; a direct fetch returned 404 that day).
3. **Auth:** `Authorization: Bearer <key>`. Optional `OpenAI-Organization: <org id>` and `OpenAI-Project: <project id>`. Optional `X-Client-Request-Id` (≤512 ASCII). The response carries `x-request-id`. Key guidance: "Don't share it with others or expose it in any client-side code… Load API keys from an environment variable or key management service on the server." Key prefix: UNKNOWN (not stated on the fetched pages). Source: https://developers.openai.com/api/reference/overview
4. **Discovery:** `GET /v1/models` returns `{object:"list", data:[{id, created, object:"model", owned_by, shutdown_date}]}`. It has **no** context length, pricing or capabilities, and no pagination is documented. Whether it lists only models the key can access: UNKNOWN (not stated on the fetched page). Source: https://developers.openai.com/api/reference/resources/models/methods/list
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE on both APIs. Responses streams typed events such as `response.output_text.delta`. In Chat Completions, usage appears in the stream only when `stream_options.include_usage` is set, and `stream_options` is allowed only with `stream:true`.
   - Tools: `tools` (function calling) on both APIs.
   - Structured output: Chat uses `response_format:{type:"json_schema", json_schema:{…, strict:true}}` (json_object also exists). Responses uses `text.format`.
   - Usage fields: Responses has `input_tokens`, `output_tokens`, `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens`. Chat has `prompt_tokens`/`completion_tokens`; its `…_details.cached_tokens`/`reasoning_tokens` are shown by Anthropic's compatibility table rather than confirmed verbatim on an OpenAI page.
   - Cost: none seen in the response (UNKNOWN whether any exists).
   - Cancellation: Responses supports `background` mode. The cancel endpoint path was not confirmed.
   - Sources: https://developers.openai.com/api/docs/guides/structured-outputs, https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events
6. **Errors:**
   - 401: invalid auth, incorrect key, not in an org, or IP not allowlisted.
   - **403: "Country, region, or territory not supported".**
   - 429 comes in several variants that must be told apart: rate limit, "Slow down", **credit balance exhausted** (prepaid), org/project spend limit, and org usage limit.
   - 500: server error. 503: model overloaded.
   - Rate-limit headers: `x-ratelimit-limit|remaining|reset-requests|tokens` (plus project-scoped variants). Retry-After is not listed on the fetched page.
   - Sources: https://developers.openai.com/api/docs/guides/error-codes, https://developers.openai.com/api/reference/overview
7. **Pricing:**
   - Published at https://developers.openai.com/api/docs/pricing, per 1M tokens (input / cached input / output). Example: gpt-4o-mini costs $0.15 / $0.075 / $0.60.
   - Free: only `omni-moderation-latest` is listed as "Free". There is **no free inference tier**; billing is prepaid credits (see the 429 "credit balance exhausted" error).
   - Data: "As of March 1, 2023, data sent to the OpenAI API is not used to train or improve OpenAI models (unless you explicitly opt in)". Abuse-monitoring logs are kept up to 30 days, and ZDR is available for eligible endpoints. Source: https://developers.openai.com/api/docs/guides/your-data
8. **BYOK terms** (OpenAI Services Agreement, ONLINE v.010126, https://cdn.openai.com/osa/openai-services-agreement.pdf):
   - §2.2 grants the right "to integrate the Services into Customer Applications and to make Customer Applications available to End Users."
   - §3.1: "Customer will not share Account access credentials or individual login credentials between multiple users. Customer may not resell or lease access to its Account."
   - **§3.3(g): Customer will not "buy, sell, or transfer API keys from, to, or with a third party."**
   - §16.12: no access or offering outside Supported Countries.
   - Interpretation (not legal advice): BYOK is the customer using its own key through Flowline as a tool, with no sale or transfer, so it is **permitted with care**. Flowline must never pool keys, share one customer's key across workspaces, or charge a markup framed as reselling OpenAI access. Treat the key as the customer's own credential.
9. **Eligibility and region:** **Egypt is listed** in "Supported countries and territories" (https://developers.openai.com/api/docs/supported-countries). The 403 region error applies to the request origin, so Flowline's server region matters. §16.11 of the OSA bars embargoed countries.
10. **Verdict: SUITABLE.** Prefer Responses for new work; Chat Completions is still supported. Map the 429 subtypes (quota exhausted vs rate limit) to distinct UI states. Discovery lacks context length and pricing, so that metadata needs a curated table.

---

## 2. Anthropic (Claude API)

1. **Status:** active. Some old models are retired (Haiku 3.5, Sonnet 4, Opus 4/4.1 "retired, except on Bedrock and Google Cloud"). Sources: https://platform.claude.com/docs/en/about-claude/pricing and its link to model-deprecations. docs.anthropic.com now 301-redirects to platform.claude.com.
2. **Endpoints:** base `https://api.anthropic.com`.
   - Native Messages: `POST /v1/messages` (Anthropic Messages).
   - **OpenAI-compatible layer:** base `https://api.anthropic.com/v1/`, `chat.completions`. Anthropic says it is "primarily intended to test and compare model capabilities, and is not considered a long-term or production-ready solution".
   - The compat layer silently **ignores `response_format`** and **ignores the tool `strict` flag**, has no prompt caching, and returns `usage.*_details` "Always empty".
   - Sources: https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk (redirect target of /docs/en/api/openai-sdk)
3. **Auth:**
   - `x-api-key: <key>` plus **`anthropic-version: 2023-06-01`** (required, per the example) and optional `anthropic-beta`.
   - `anthropic-workspace-id` is optional, but required for keys that span several workspaces.
   - Responses carry the `request-id` header.
   - Key prefix: UNKNOWN (not stated on the fetched pages).
   - Sources: https://platform.claude.com/docs/en/api/models-list, https://platform.claude.com/docs/en/api/errors
4. **Discovery (best of the eight):** `GET /v1/models` with cursor pagination `before_id`/`after_id`/`limit` (default 20, max 1000). The response has `first_id`, `last_id`, `has_more`.
   - Per model: `id`, `display_name`, `created_at`, **`max_input_tokens`**, **`max_tokens`**, and **`capabilities`**: batch, citations, code_execution, context_management, effort levels, image_input, pdf_input, **structured_outputs**, and thinking types.
   - **No pricing.**
   - The page says the list shows "which models are available for use in the API", newest first. Per-key filtering is not explicitly stated.
   - Source: https://platform.claude.com/docs/en/api/models-list
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE. Errors can arrive mid-stream after an HTTP 200 as an `error` event (https://platform.claude.com/docs/en/api/errors).
   - Tools: `tools` / `tool_use` blocks. **Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1 reject forced `tool_choice` (`any`/`tool`) with a 400**; only `auto`/`none` work there.
   - Structured output: "structured outputs" via `output_config.format`, plus strict tool use.
   - Usage fields: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and `server_tool_use.*`. Total input = cache_read + cache_creation + input_tokens.
   - Cost: not reported.
   - Model-specific 400s to handle: prefill is unsupported on 4.6+, and `thinking.type` values vary per model.
   - Sources: https://platform.claude.com/docs/en/api/errors, https://platform.claude.com/docs/en/api/rate-limits, https://platform.claude.com/docs/en/about-claude/pricing
6. **Errors:**
   - 400 `invalid_request_error` (also returned for a **user-set spend limit**)
   - 401 `authentication_error`
   - **402 `billing_error`**
   - 403 `permission_error`
   - 404 `not_found_error`
   - 409 `conflict_error`
   - 413 `request_too_large` (32 MB for Messages)
   - 429 `rate_limit_error` with `retry-after`. The **spend-cap 429 has no retry-after** and carries `error.details.error_code:"enforced_spend_limit_reached"`.
   - 500 `api_error`, 504 `timeout_error`, **529 `overloaded_error`**
   - Headers: `anthropic-ratelimit-{requests,tokens,input-tokens,output-tokens}-{limit,remaining,reset}`
   - Sources: https://platform.claude.com/docs/en/api/errors, https://platform.claude.com/docs/en/api/rate-limits
7. **Pricing:**
   - Published at https://platform.claude.com/docs/en/about-claude/pricing (canonical: claude.com/pricing), per MTok. Examples: Haiku 4.5 costs $1 in / $5 out; Sonnet 5.5 costs $2 / $10; Opus 5.5 costs $4 / $20.
   - Cache reads cost 0.1× input (0.05× on Opus 5.5). Batch is −50%. `inference_geo:"us"` costs 1.1×.
   - Free: "New users receive a small amount of free credits to test the API". That is **trial credits**; there is no permanent free tier and no zero-priced models.
   - Monthly spend caps per tier: Start $500, Build $1,000, Scale $200k.
   - Data: Commercial Terms §B says "Anthropic may not train models on Customer Content from Services" (https://www.anthropic.com/legal/commercial-terms).
8. **BYOK terms:**
   - Commercial Terms §A.1 permits using the Services "to power products and services Customer makes available to its own customers and end users".
   - §D.4 forbids reselling "except as expressly approved".
   - Claude Code legal page (https://code.claude.com/docs/en/legal-and-compliance): developers "should use API key authentication through Claude Console". Anthropic does not permit third parties "to route requests through Free, Pro, or Max plan credentials on behalf of their users" or to "collect, store, or intermediate Claude.ai credentials or session tokens".
   - The same page allows provisioning **API keys** where "usage is billed to the key owner… and is not resold or intermediated". Strictly, that page is about Claude Code; treat it as a strong signal for general API BYOK.
   - For Flowline: accept **Console API keys only, never claude.ai OAuth or subscription tokens**.
9. **Eligibility and region:** **Egypt is listed** in Supported regions (https://platform.claude.com/docs/en/api/supported-regions). New organizations may start in a lower "Evaluation" tier (rate-limits page).
10. **Verdict: SUITABLE.** Use native Messages, not the OpenAI-compat layer: the compat layer drops structured output and strict tools. Handle 529, 402, the two spend-limit shapes (a 400 for a user-set limit, a 429 without retry-after for the tier cap), and per-model 400s such as forced tool_choice and the thinking modes.

---

## 3. Google Gemini API (AI Studio / generativelanguage.googleapis.com)

1. **Status:** active. The docs are live and there is no service deprecation notice. Individual model retirements were not checked.
2. **Endpoints:**
   - Native: `POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent` and `…:streamGenerateContent?alt=sse` (Gemini generateContent). Source: https://ai.google.dev/api/generate-content
   - **OpenAI-compatible:** base `https://generativelanguage.googleapis.com/v1beta/openai/`. It supports chat completions, streaming, function calling, `response_format` structured output, embeddings, and models list/retrieve. It is "**in beta** while we extend feature support". Source: https://ai.google.dev/gemini-api/docs/openai
   - No Anthropic-compatible endpoint was found.
3. **Auth:** `x-goog-api-key: <key>` header; the examples also show a `key=` query parameter. Prefer the header so the key stays out of URLs and logs. The OpenAI-compat layer uses a Bearer key. Key prefix: UNKNOWN (not stated).
4. **Discovery:** `GET /v1beta/models` with `pageSize` (default 50, max 1000) and `pageToken`.
   - Fields: `inputTokenLimit`, `outputTokenLimit`, **`supportedGenerationMethods[]`**, `thinking` (bool), `temperature`/`maxTemperature`/`topP`/`topK`.
   - **No pricing.**
   - Whether it lists all public models or only per-key models: UNKNOWN (not stated).
   - Source: https://ai.google.dev/api/models
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE via `alt=sse`.
   - Tools: `tools.functionDeclarations`.
   - Structured output: `generationConfig.responseMimeType` + `responseSchema`.
   - `usageMetadata` verified fields: `promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`, `totalTokenCount`. A reasoning-token field (e.g. `thoughtsTokenCount`) was **UNKNOWN**: it did not appear in the fetched summary, so re-verify.
   - Cost: not reported. Cancellation: not documented on the fetched pages.
6. **Errors:**
   - 400 `invalid_request`
   - 400 `failed_precondition` ("for example, disabled billing")
   - 401 `authentication`
   - **402 `payment_required`** ("Your Prepay credit balance is depleted")
   - 403 `permission_denied`
   - 404 `not_found`
   - 429 `rate_limit_exceeded` (per-minute) **vs** 429 `quota_exceeded` (daily)
   - 500 `api_error`, 503 `service_unavailable`, 504 `deadline_exceeded`
   - No Retry-After or `retryDelay` is documented; the advice is exponential backoff.
   - Limits are **per project, not per key**. Tier 1+ has rolling 10-minute spend caps ($10 on Tier 1).
   - Sources: https://ai.google.dev/gemini-api/docs/api-errors, https://ai.google.dev/gemini-api/docs/rate-limits
7. **Pricing:**
   - Published at https://ai.google.dev/gemini-api/docs/pricing, per 1M tokens. Example: Gemini 3.5 Flash costs $1.50 in / $9.00 out (paid).
   - **Permanent free tier with quota:** many models are "Free of charge" on the Free tier (e.g. Gemini 3.x Flash / Flash-Lite, 2.5 Pro/Flash, Gemma 4), subject to low RPM/RPD limits.
   - **Data (important):** on the free tier, content is "used to improve our products = Yes". The Additional Terms say for Unpaid Services "human reviewers may read, annotate, and process your API input and output". On the paid tier, content is not used.
   - Sources: https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/terms (last modified Mar 23 2026)
8. **BYOK terms:**
   - Gemini API Additional Terms: the user must be 18+, and there is a no-competing-models rule.
   - "**You may use only Paid Services when making API Clients available to users in the EEA, Switzerland, or the UK.**"
   - No explicit clause on sharing or transferring keys was found on that page; underlying Google APIs ToS not fetched (UNKNOWN).
   - For Flowline: a customer who pastes a **free-tier key** means their prompts and data may be human-reviewed and used for training. Disclose this in the UI. Free keys must not be used to serve EEA/CH/UK users.
9. **Eligibility and region:** **Egypt is listed** as an available region (https://ai.google.dev/gemini-api/docs/available-regions). Outside listed regions, Google directs users to Vertex (Gemini Enterprise Agent Platform).
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - Free-tier keys carry data-training and human-review terms and low per-project quotas; Flowline can't tell free from paid until a 429 or 402 arrives.
    - EEA/UK/CH users need paid keys.
    - The OpenAI-compat layer is beta, so prefer native generateContent.

---

## 4. xAI (Grok API)

1. **Status:** active; the brand now shows as "SpaceXAI" on docs/site. **Chat Completions is "offered as a legacy endpoint"** (deprecated, no shutdown date found). The **Anthropic-compatible Messages / Completions endpoints are listed as "deprecated"** in the API reference (per a search excerpt of docs.x.ai; not confirmed on a fetched page). Sources: https://docs.x.ai/developers/model-capabilities/legacy/chat-completions, https://docs.x.ai/developers/api-reference
2. **Endpoints:**
   - Base `https://api.x.ai/v1`. Optional US-residency base `https://us.api.x.ai/v1`, which serves only grok-4.7 and grok-4.6 (https://docs.x.ai/developers/advanced-api-usage/regions).
   - Primary: `POST /v1/responses` (OpenAI Responses-style). Legacy: `/v1/chat/completions` (OpenAI Chat-compatible).
   - Stored responses are kept 30 days and can be fetched with `GET`/`DELETE /v1/responses/{id}`.
3. **Auth:** `Authorization: Bearer <XAI_API_KEY>`. Keys are bound to teams. Key prefix: UNKNOWN (not stated).
4. **Discovery:**
   - `GET /v1/models` lists "all models available to the authenticating API key", so the list is **per-key**.
   - `GET /v1/language-models` (plus image and video variants) adds **pricing** (USD cents per 100M tokens, cached price, long-context tiers), **context length**, modalities and reasoning-effort levels.
   - No pagination is documented.
   - Source: https://docs.x.ai/developers/rest-api-reference/inference/models
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE, data-only, ending with `data: [DONE]`.
   - Tools: `tools` (up to 350).
   - Structured output: `text.format` exists; json_schema support was not confirmed on the fetched page (UNKNOWN).
   - Usage fields: `input_tokens`, `output_tokens`, `total_tokens`, `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens`, `num_sources_used`, `num_server_side_tools_used`.
   - **Cost is reported per response:** `cost_in_usd_ticks` ("Accurate cost of this request in USD ticks") and `cost_in_nano_usd`.
   - Source: https://docs.x.ai/developers/rest-api-reference/inference/responses
6. **Errors:**
   - 400; 401 (no or invalid token); 403 (permission, needs team admin); 404; 405; 415; 422 (invalid field format); 429 (rate limit); 202 for deferred requests.
   - 5xx and Retry-After are **not documented** (UNKNOWN).
   - Rate limits are RPS + TPM per model. Tiers are based on cumulative prepaid spend (Tier 0 starts at $0).
   - Sources: https://docs.x.ai/developers/debugging, https://docs.x.ai/developers/rate-limits
7. **Pricing:**
   - Published at https://docs.x.ai/developers/pricing, per 1M tokens. Example: grok-4.7 costs $2 in / $0.50 cached / $6 out.
   - **No API free tier or free credits are mentioned** on that page. Any data-sharing credit program: UNKNOWN (not found).
   - Data/training terms: UNKNOWN (the x.ai legal pages returned 403). The Enterprise ToS processes personal data as a processor under the DPA (search excerpt).
8. **BYOK terms** (Enterprise ToS, https://x.ai/legal/terms-of-service-enterprise, via search excerpts only):
   - "Customer may only provide End Users with access to the Services as part of a Bundled Service". Customer is "fully responsible and liable" for End Users.
   - No explicit key-transfer clause was confirmed.
   - Treat as permitted for a BYOK tool when the customer is the xAI account holder, but **flag for legal review**: the full text couldn't be read.
9. **Eligibility and region:** no country list was found on docs.x.ai. **UNKNOWN whether Egypt is supported** (tried the regions docs and a site search).
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - Build against Responses: Chat Completions is legacy and the Anthropic-compat endpoints are deprecated.
    - Terms and country eligibility are unverified.
    - 5xx and Retry-After are undocumented.
    - Upside: per-request cost and a per-key model list with pricing.

---

## 5. Groq (GroqCloud)

1. **Status:** active. Models are split into Production and **Preview** ("evaluation purposes only… may be discontinued at short notice"). Source: https://console.groq.com/docs/models
2. **Endpoints:** base `https://api.groq.com/openai/v1`. Inference uses `POST /chat/completions` (OpenAI Chat-compatible) and `POST /responses` (OpenAI Responses-compatible). No Anthropic-compatible endpoint was found. Source: https://console.groq.com/docs/api-reference
3. **Auth:** `Authorization: Bearer <key>`. Key prefix: UNKNOWN (not stated on fetched pages).
4. **Discovery:** `GET /models` returns metadata including context window and max completion tokens. **No pricing** is returned. Pagination and per-key filtering: UNKNOWN. Source: https://console.groq.com/docs/api-reference
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE (OpenAI-style).
   - Tools: supported.
   - Structured output: `response_format` JSON Schema.
   - Usage fields: `prompt_tokens`, `completion_tokens`, `queue_time`, `prompt_time`, `completion_time`, with cached and reasoning token details "for supported models".
   - Cost: not reported.
   - **Cancellation: custom 499 "Request Cancelled".**
6. **Errors:**
   - 400; 401; 403; 404; 413; 422; 424 (remote MCP auth); 429
   - **498 Flex tier capacity exceeded**; 499 cancelled
   - 500, 502, 503
   - Headers: `x-ratelimit-*` and **`retry-after`**. Limits are per organization; cached tokens don't count.
   - Sources: https://console.groq.com/docs/errors, https://console.groq.com/docs/rate-limits
7. **Pricing:**
   - Per 1M tokens, shown on the models page. Example: GPT OSS 120B costs $0.15 in / $0.60 out.
   - groq.com/pricing didn't render its prices in the fetch; the pricing console is https://console.groq.com/settings/billing/plans.
   - **Free plan with limited quota** ("downgrade to the Free tier at any time"; Developer plan for higher limits). Source: https://console.groq.com/docs/billing-faqs via search excerpt, plus the rate-limits page.
   - Data: "By default, Groq does not retain customer data for inference requests" (up to 30 days for abuse or reliability; ZDR toggle for everyone; the page shows no free-vs-paid difference) (https://console.groq.com/docs/your-data).
   - Services Agreement §4.2: "Groq is not permitted to use Inputs or Outputs for training… unless explicitly granted permission".
8. **BYOK terms** (Groq Services Agreement, effective June 22 2026, https://console.groq.com/docs/legal/services-agreement):
   - §3.1 grants the right "to integrate… into your Customer Application and to make [them] available to End Users".
   - §3.2: "Customer may not resell or lease access to its Account".
   - §6.3(c): no sell/resell/sublicense/transfer "except as expressly approved".
   - Search excerpt: will not permit End Users to "sell, resell, transfer… API or api log-ins of keys to a third party".
   - For Flowline: permitted for the key owner's own use through Flowline.
9. **Eligibility and region:** no country list was found. Data centers are in the US, AU, CA, FI and SA (community FAQ). §6.3(d)(v) requires export-control compliance. **Egypt: UNKNOWN.**
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - Free-plan keys have tight org-level quotas.
    - Preview models may vanish at short notice, so filter them or label them "preview".
    - Handle 498 and 499.
    - Country eligibility is unverified.

---

## 6. OpenRouter (gateway)

1. **Status:** active. ToS last updated Aug 31 2026 (https://openrouter.ai/terms).
2. **Endpoints:** base `https://openrouter.ai/api/v1`.
   - `POST /chat/completions` (OpenAI Chat-compatible, "normalizes the schema across models and providers").
   - `POST /responses` (OpenAI Responses format).
   - **`POST /messages` (Anthropic Messages-compatible, the "Anthropic Skin")**.
   - Model families: OpenRouter documents all three as model-agnostic and routes any model id (`vendor/model`) to upstream providers. Per-family parity (e.g. whether non-Anthropic models support every Messages feature) was **not verified**. Rely on Chat Completions as the canonical endpoint.
   - Sources: https://openrouter.ai/docs/api/reference/overview, openrouter.ai search excerpts for /messages and /responses.
3. **Auth:** `Authorization: Bearer <key>`. Optional attribution headers `HTTP-Referer` and `X-OpenRouter-Title` (older docs used `X-Title`). Key prefix: UNKNOWN.
4. **Discovery:** `GET /api/v1/models` with filters (category, supported_parameters, output_modalities, sort) and **offset/limit pagination** (default 500, max 1000, `total_count`, `links.next`).
   - Fields: `id`, `context_length`, **`pricing.prompt` / `pricing.completion` (USD strings)**, `architecture`, **`supported_parameters`**, `top_provider` (context, max completion tokens, moderated), `expiration_date`.
   - It lists the whole catalog, not per-key.
   - The fetched page said auth is required; UNKNOWN whether the endpoint also works without auth (conflicts with common understanding; re-verify).
   - A `/models/user` endpoint was **not found** on the page.
   - `GET /api/v1/key` returns remaining credit and free-model daily requests.
   - Sources: https://openrouter.ai/docs/api/api-reference/models/get-models, https://openrouter.ai/docs/api/reference/limits
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE. **Mid-stream errors arrive after a 200** as a chunk with a top-level `error` and `finish_reason:"error"`, plus `error.metadata.error_type`.
   - Tools: `tools`. Structured output: `response_format` (support depends on the upstream model; check `supported_parameters`).
   - Usage fields: native token counts, **`cost` (credits) and `cost_details`**. The response also carries `native_finish_reason`.
6. **Errors:**
   - 400; 401 (invalid or disabled key, expired OAuth)
   - **402 insufficient credits** (also returned for free models when the balance is negative)
   - 403 guardrail or moderation block
   - 408 timeout; 429 rate limited
   - 502 model down or invalid upstream response
   - 503 no provider meets the routing requirements
   - Source: https://openrouter.ai/docs/api/reference/errors-and-debugging
7. **Pricing:** per-model prices come from the models API, in USD per token as strings.
   - **Zero-priced `:free` model variants** with quota: 20 req/min, and **50 req/day if lifetime credits purchased < $10, 1,000/day if ≥ $10**. These are limited free variants whose availability can change, not guaranteed permanent free models.
   - Data: ToS §6.1 says "Some Models may store or train on your Inputs… as described in their Model Terms". The terms depend on the upstream provider; free variants in particular may log. Show the provider's data policy.
8. **BYOK terms:**
   - §7(4) bars using the Service "for purposes of reselling API access to Models or otherwise developing a competing service".
   - §5.2: the user must ensure its "Authorized Users and customers" comply.
   - §3.2: the user is responsible for key confidentiality.
   - §5.7: model providers' country restrictions apply and must not be circumvented.
   - For Flowline: a customer's own OpenRouter key used inside Flowline is fine. Flowline must not position itself as an OpenRouter-access reseller.
9. **Eligibility and region:** OpenRouter publishes no country list of its own; §5.7 defers to each model provider's restrictions. **Egypt: UNKNOWN / per-model.**
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - One key reaches many families and the response includes cost.
    - Free-variant quotas are tiny, and upstream data terms vary.
    - Mid-stream errors come after a 200.
    - The /models auth requirement and per-family endpoint parity need re-verification.

---

## 7. Mistral (La Plateforme / "Mistral Studio")

1. **Status:** active (docs live; La Plateforme is now marketed as "Mistral Studio"). Per-model deprecation is exposed in the models API.
2. **Endpoints:** base `https://api.mistral.ai/v1`. Inference uses `POST /v1/chat/completions` (OpenAI Chat-compatible shape), plus Conversations/Agents endpoints. No Anthropic-compatible endpoint was found. Source: https://docs.mistral.ai/api
3. **Auth:** `Authorization: Bearer <key>`. Keys are per workspace (https://docs.mistral.ai/getting-started/quickstarts/admin/manage-workspaces, title only). Key prefix: UNKNOWN.
4. **Discovery:** `GET /v1/models` returns "all models available to the user", including the org's fine-tunes.
   - Fields: `id`, **`capabilities`** (`completion_chat`, `completion_fim`, `function_calling`, `vision`, `fine_tuning`, `classification`), **`max_context_length`**, `aliases`, `archived`, deprecation, type.
   - **No pricing**; no pagination documented.
   - Source: https://docs.mistral.ai/api/endpoint/models
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE. Tools: `tools`.
   - Structured output: `response_format` (JSON mode and JSON schema).
   - Usage fields: `prompt_tokens`/`completion_tokens`, plus cached-token accounting (`prompt_cache_key`). The exact cached-token field name is UNKNOWN.
   - Cost: not reported.
6. **Errors:**
   - 401, 403, 404, 422 (validation), 429, 500, 503. Retry with exponential backoff on 429 and 5xx.
   - Error JSON has `message`, `type`, `param`, `code`.
   - Header: `X-RateLimit-Remaining` (search excerpt). **No Retry-After documented.**
   - A workspace that hits its usage limit gets 429 "until the next billing cycle", so Flowline can't tell that from a transient rate limit by status code alone.
   - Sources: https://docs.mistral.ai/resources/error-glossary, https://docs.mistral.ai/admin/user-management-finops/tier
7. **Pricing:**
   - Per 1M tokens (https://mistral.ai/pricing/api/). Example: Mistral Small 4 costs $0.15 in / $0.60 out. Batch costs half price.
   - **Free mode** (default): "lets you create API keys and use included monthly usage within the limits". That is a limited free tier with monthly quota; pay-as-you-go extends it.
   - The general pricing page mentions "$10/mo in API credits" on the Free plan (https://mistral.ai/pricing/).
   - **Data:** the Help Center says Studio **Free mode: "we may use your data (input and output) to train our artificial intelligence models"**, while pay-as-you-go can opt out (https://help.mistral.ai/en/articles/347617). **Conflict:** a search excerpt claimed "Data sent through the API isn't used for model training". The Help Center article is more specific; treat free-mode keys as training-eligible.
8. **BYOK terms** (Commercial ToS, https://legal.mistral.ai/terms/commercial-terms-of-service/, from search excerpts because a direct fetch failed):
   - Customers may not "buy, sell, or transfer API keys or any type of Mistral AI account from, to, or with a third party".
   - "Customer Offering" (products made available to third parties) and "End User" are defined, and use-restriction pass-through is required.
   - Excerpt: "cannot grant any third party access… without prior written authorization or except as provided under these Terms".
   - For Flowline: the customer using its own key through Flowline appears permitted, but **flag for legal review**.
9. **Eligibility and region:** no country list was found (usage-and-limits page; searched). **Egypt: UNKNOWN.**
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - Free-mode keys may be used for training (disclose this).
    - The quota-exhausted 429 lasts until the billing cycle ends.
    - Terms could only be read via excerpts, and country eligibility is unverified.

---

## 8. Cohere (API platform)

1. **Status:** active. The models API exposes deprecation status. Legacy Command models are still priced. Source: https://docs.cohere.com/reference/list-models
2. **Endpoints:**
   - Native: `POST https://api.cohere.com/v2/chat` (Cohere v2 chat).
   - **OpenAI-compatible:** base `https://api.cohere.ai/compatibility/v1`. Note the different domain, `.ai`, as documented. It supports chat completions with streaming, `response_format` JSON Schema, tools with `strict`, and embeddings. `reasoning_effort` accepts only `none`/`high`, and Cohere-specific features (documents, citations) are unavailable.
   - No Anthropic-compatible endpoint.
   - Sources: https://docs.cohere.com/reference/chat, https://docs.cohere.com/docs/compatibility-api
3. **Auth:** `Authorization: Bearer <key>`. **Trial vs production key** is a key-level distinction. Key prefix: UNKNOWN.
4. **Discovery:** `GET https://api.cohere.com/v1/models` with `page_size` (default 20, max 1000), `page_token`/`next_page_token`, an `endpoint` filter (e.g. `chat`) and `default_only`.
   - Fields: `name`, `endpoints`, `finetuned`, **`context_length`**, `tokenizer_url`, `features`, deprecation.
   - **No pricing.**
   - Source: https://docs.cohere.com/reference/list-models
5. **Streaming, tools, JSON, usage:**
   - Streaming: SSE with typed events (`message-start`, `content-delta`, `tool-call-*`, `message-end`).
   - Tools: `tools`, with `finish_reason:"TOOL_CALL"`.
   - Structured output: `response_format` `json_object`, with optional JSON schema.
   - Usage fields: `usage.billed_units` (input/output tokens), `usage.tokens`, `cached_tokens`.
   - Cost: not reported.
   - Cancellation: 499 "user cancels the request".
6. **Errors:**
   - 400; 401 (missing, invalid or expired key)
   - **402 (billing limit reached)**
   - 404
   - 429 ("You are using a Trial key, which is limited to 40 API calls / minute")
   - 499, 500
   - The models reference also lists 403, 422 and 498–504.
   - Retry-After: UNKNOWN.
   - Source: https://docs.cohere.com/reference/errors
7. **Pricing:**
   - https://cohere.com/pricing, per 1M tokens. The page showed legacy examples only (Command R+ 08-2024 costs $2.50 in / $10 out); current Command A prices were not rendered (UNKNOWN).
   - **Trial keys are free**: rate-limited, "limited to 1,000 API calls a month", and **"not permitted to be used for production or commercial purposes"**.
   - Production keys are billed monthly or at $250.
   - Data: SaaS Agreement §3(a) grants Cohere rights to use Customer Data to "improve and enhance the Services… including by sharing API Data… with Third Parties", and §3(a) itself has no opt-out.
   - **Conflict:** the Enterprise Data Commitments page says "You can opt out from your prompts and generations being used to train Cohere models in your dashboard settings" (Data Controls toggle). Logs are deleted after 30 days; ZDR is enterprise-only.
   - Sources: https://docs.cohere.com/docs/rate-limits, https://cohere.com/saas-agreement (last updated Apr 8 2025), https://cohere.com/enterprise-data-commitments
8. **BYOK terms:**
   - SaaS Agreement §4(a)(i): Access Credentials are Cohere confidential info and "will not share such Access Credentials with any third party without Cohere's prior consent".
   - §4(a)(ii) allows incorporating the API into Customer's products.
   - §2(d): may not "distribute, sub-license, permit access to, or otherwise make the Services… available to any Person except to a Permitted User"; Permitted Users are employees and contractors.
   - **Tension:** a customer handing its key to Flowline (a third party) is arguably "sharing Access Credentials" without Cohere consent. Flowline acting as the customer's processor or contractor may fit, but this is unclear.
   - **Trial keys cannot be used commercially at all.**
9. **Eligibility and region:** SaaS Agreement §2(d)(vi) names Restricted Locations: Belarus, China, Iran, North Korea, Russia, Syria. **Egypt is not listed**, so not restricted per the agreement. There is no positive supported-country list.
10. **Verdict: SUITABLE-WITH-LIMITS, and the weakest of the eight.**
    - The credential-sharing clause needs legal review or Cohere consent.
    - Trial keys must be rejected or flagged as non-commercial; detect them via the trial 429 message.
    - Default training/data-sharing terms mean the customer should be told to switch off Data Controls.

---

## Conflicts and unknowns (summary)

- **Mistral training on API data:** the Help Center (free mode may train) conflicts with a search excerpt ("API data isn't used for training"). The Help Center is treated as authoritative.
- **Cohere training:** SaaS §3(a) grants broad data use with no opt-out, but Enterprise Data Commitments offers a dashboard opt-out.
- **Cohere domains:** the native API is `api.cohere.com`, but the OpenAI-compat base is `api.cohere.ai`.
- **OpenRouter `/models`:** the fetched docs say auth is required. Commonly it has been public; re-verify.
- **xAI:** the Anthropic-compat deprecation, the terms and the country list come from search excerpts only (x.ai/legal returns 403).
- **Countries:** Egypt is confirmed for OpenAI, Anthropic and Gemini. Cohere does not restrict it (restricted list only). xAI, Groq, Mistral and OpenRouter are UNKNOWN.
- **API key prefixes:** not confirmed for any provider. Don't hard-validate prefixes; validate with a live `GET /models` call instead.
- **Gemini:** reasoning-token field name unverified. **OpenAI:** whether the model list is per-key, and the Responses cancel path, are unverified.


---

# Part B: core providers (DeepSeek, Z.ai, Moonshot, MiniMax, Alibaba, OpenCode Zen, Command Code), plus separate evaluations (OpenCode Go, GitHub Models)

## B1. DeepSeek (core)

1. **Status:** Active. Current models are `deepseek-flash` (DeepSeek-V4.1-Flash) and `deepseek-v4-pro` (V4-Pro-0813). The legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` "are still accepted, but the corresponding models have been retired". Those requests now go to V4.1-Flash at Flash pricing. Source: https://api-docs.deepseek.com/
2. **Endpoints:**
   - OpenAI-compatible base `https://api.deepseek.com`, with `POST /chat/completions`.
   - Anthropic-compatible base `https://api.deepseek.com/anthropic`.
   - The pricing page also lists "Responses API" as a supported feature. I found no path documented for it, so the path is UNKNOWN.
   - Sources: https://api-docs.deepseek.com/ , https://api-docs.deepseek.com/api/create-chat-completion , https://api-docs.deepseek.com/quick_start/pricing
3. **Auth:** `Authorization: Bearer <key>`. Keys are created at platform.deepseek.com/api_keys. The key prefix is not documented. There are no org or region headers. An optional `user_id` body parameter isolates end users (pattern `[a-zA-Z0-9\-_]+`, max 512 characters, no sensitive data). Sources: https://api-docs.deepseek.com/ , https://api-docs.deepseek.com/quick_start/rate_limit
4. **Discovery:** `GET /models` returns `{object:"list", data:[...]}`. Each model has these fields: `id`, `object`, `owned_by`, `name`, `context_window`, `max_output_tokens`, `input_modalities`, `output_modalities`, `effort{supported_levels, default_level}` and `api_capabilities`. There is no pricing field and no pagination. Whether the list is all models or only those the key can use is not stated, but only two models exist. Source: https://api-docs.deepseek.com/api/list-models
5. **Runtime behaviour:**
   - **Streaming:** SSE `data:` chunks carrying `delta`, ending with `data: [DONE]`. While a request waits, streaming connections receive SSE keep-alive comments and non-streaming ones receive blank lines. The server closes the connection if inference has not started within 10 minutes.
   - **Tools:** supported through `tools`, with a beta `strict` mode.
   - **Structured output:** only `response_format: {type:"json_object"}`, and the prompt must also ask for JSON. `json_schema` is not documented.
   - **Usage fields:** `prompt_tokens`, `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, `completion_tokens`, `reasoning_tokens` (thinking mode only), `total_tokens`.
   - **Cost:** not returned in responses.
   - **Cancellation:** not documented, so UNKNOWN.
   - Sources: https://api-docs.deepseek.com/api/create-chat-completion , https://api-docs.deepseek.com/quick_start/rate_limit
6. **Errors:**

   | Status | Meaning |
   |---|---|
   | 400 | invalid format |
   | 401 | authentication fails (wrong key) |
   | **402** | insufficient balance |
   | 422 | invalid parameters |
   | 429 | rate limit reached |
   | 500 | server error |
   | 503 | server overloaded |

   - No `Retry-After` header is documented.
   - The 429 limit is concurrency-based: 2500 concurrent requests for flash and 500 for v4-pro, per account.
   - The unknown-model error code is not documented (UNKNOWN; it is probably 400 or 422).
   - Sources: https://api-docs.deepseek.com/quick_start/error_codes , https://api-docs.deepseek.com/quick_start/rate_limit
7. **Pricing:** Per 1M tokens, with off-peak prices at half of peak. Peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday.

   | Model | Input, cache hit | Input, cache miss | Output |
   |---|---|---|---|
   | flash, off-peak | $0.003 | $0.15 | $0.60 |
   | v4-pro, off-peak | $0.022 | $0.66 | $1.98 |

   - Charges are taken from "granted balance first", then from topped-up balance. There is no permanent free tier. The size and terms of the granted balance are UNKNOWN.
   - Data training/retention for API inputs: the Open Platform ToS has no explicit clause on DeepSeek's own use of API data, so this is UNKNOWN (the privacy policy was not reviewed).
   - Source: https://api-docs.deepseek.com/quick_start/pricing
8. **BYOK terms:**
   - **Permitted:** ToS §1.1 allows integrating DeepSeek "into various downstream systems, applications... providing services to both internal and external end users".
   - **Risk:** §2.2 says "do not share or publicly disclose your API key with others". A customer who hands their key to Flowline arguably conflicts with this literal wording. It is not clearly a ban on server-side custody by a processor, but disclose it in the product.
   - **Conflict:** the web-search snippet of the same ToS mentioned a ban on "copying, transferring, leasing, lending, selling, or sub-licensing" the Services without authorization. A direct fetch of the ToS found no such clause. It may be in the separate Terms of Use (https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html, not verified).
   - The ToS was released 2026-04-22, effective 2026-04-29, under PRC law (§10.1).
   - Source: https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html
9. **Eligibility:** §1.4 says there is "no warranty that the Services are available... in certain jurisdictions". No country list is given, Egypt is not mentioned, and there is no separate China endpoint.
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - Handle 402 as its own error.
    - Offer only json_object structured output; there is no json_schema.
    - Peak and off-peak pricing makes cost estimates time-dependent.
    - Tell users that their key is stored server-side, given ToS §2.2.

---

## B2. Z.ai / GLM (core; international platform, with bigmodel.cn as its China counterpart)

1. **Status:** Active. Current models include GLM-5.3, GLM-5.3-Flash/FlashX and GLM-5.2. Sources: https://docs.z.ai/guides/overview/pricing , https://docs.z.ai/api-reference/introduction
2. **Endpoints:**
   - General pay-as-you-go API: `https://api.z.ai/api/paas/v4`, with `POST /chat/completions` (OpenAI-compatible).
   - China counterpart: `https://open.bigmodel.cn/api/paas/v4`. It is a separate platform with its own keys.
   - GLM Coding Plan: `https://api.z.ai/api/anthropic` (Anthropic-compatible, for Claude Code and Goose) and `https://api.z.ai/api/coding/paas/v4` (for other tools).
   - I found no documented Anthropic endpoint for the general API; the Anthropic endpoint is presented only for the Coding Plan. UNKNOWN whether pay-as-you-go keys work there.
   - Sources: https://docs.z.ai/api-reference/introduction , https://docs.z.ai/api-reference/llm/chat-completion.md , https://docs.z.ai/devpack/faq.md , https://docs.bigmodel.cn/cn/api/introduction
3. **Auth:** `Authorization: Bearer <ZAI_API_KEY>`. The key prefix is not documented. There are no region headers; the region is chosen by domain (z.ai or bigmodel.cn). Source: https://docs.z.ai/api-reference/introduction
4. **Discovery:** No list-models endpoint is documented. I searched docs.z.ai and read llms.txt and the API introduction. Models appear only as an enum in the chat-completion schema. **Flowline would need a static catalog.** Sources: https://docs.z.ai/llms.txt , https://docs.z.ai/api-reference/llm/chat-completion.md
5. **Runtime behaviour:**
   - **Streaming:** SSE ending with `data: [DONE]`.
   - **Tools:** types `function`, `web_search` and `retrieval`. `tool_choice` accepts **only `"auto"`**.
   - **Structured output:** `response_format` accepts only `text` or `json_object`; there is no json_schema.
   - **Thinking:** a `thinking{type: enabled|disabled}` object, enabled by default on GLM-4.5 and later, plus `reasoning_effort`.
   - **Usage fields:** `prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`, `total_tokens`. No reasoning-token field is documented.
   - **Cost and cancellation:** no cost field; cancellation UNKNOWN.
   - Sources: https://docs.z.ai/api-reference/llm/chat-completion.md , https://docs.z.ai/guides/capabilities/struct-output.md
6. **Errors:** Z.ai uses business codes on top of HTTP statuses.

   | Code | HTTP | Meaning |
   |---|---|---|
   | 1000–1005 | 401 | authentication (1003 = token expired) |
   | **1113** | **429** | insufficient balance or no resource package |
   | **1211** | 400 | unknown model |
   | 1212 | 400 | call method not supported by the model |
   | 1214 | 400 | invalid parameter |
   | 1302 | 429 | rate limit |
   | 1305 | 429 | overloaded |
   | 1308 / 1310 | 429 | usage or quota limits |
   | 1313 | 429 | fair-use violation |
   | **1309** | 429 | Coding Plan expired |
   | **1315** | 429 | key restricted to enterprise coding package |
   | 500 / 1200 / 1230 | 500 | server-side errors |

   - Balance errors come back as **429, not 402**, so they must be told apart from real rate limits by `code`.
   - `Retry-After` is UNKNOWN: the rate-limit doc redirects (307) to the logged-in console at https://z.ai/manage-apikey/rate-limits.
   - Source: https://docs.z.ai/api-reference/api-code.md
7. **Pricing:** Per 1M tokens, on https://docs.z.ai/guides/overview/pricing .
   - GLM-5.3-Flash: $0.15 in / $0.03 cached / $0.50 out.
   - GLM-5.3: $1.4 / $0.26 / $4.4.
   - Listed as **"Free"** with no quota stated: GLM-4.7-Flash, GLM-4.5-Flash and GLM-4.6V-Flash. Whether these are permanently free or rate-limited is not stated, so their durability is UNKNOWN.
   - Cached-input storage is "Limited-time Free". There are no trial credits.
   - **Data:** API "End User Content" is not used to develop or improve Services unless the customer explicitly agrees (Additional Terms §3(b)). Individual users' content may be used (Terms §IV.3(a)). Source: https://docs.z.ai/legal-agreement/terms-of-use.md
8. **BYOK terms:**
   - **General API is OK.** Terms §III.9 says that if you use the Services to serve third parties you take full responsibility, and Additional Terms §1(b) requires agreements with End Users. The same Terms (§II) say keys should not be shared or publicly disclosed, which is the same caveat as DeepSeek.
   - **Coding Plan keys are NOT permitted:** "strictly limited to use within officially supported tools and products... shall not use the subscription benefits in any unsupported tools or scenarios". Account sharing and multi-user access are prohibited, violations can lead to freezing, and more than three violations can mean a ban.
   - Operator: JINGSHENG HENGXING TECHNOLOGY PTE. LTD. under Singapore law; terms updated 2026-04-14.
   - Sources: https://docs.z.ai/legal-agreement/terms-of-use.md , https://docs.z.ai/devpack/usage-policy.md , https://docs.z.ai/devpack/faq.md
9. **Eligibility:** Users confirm they are not located in Iran, North Korea, Cuba, Crimea, Donetsk or Zaporizhzhia (Terms §X.3). Egypt is not listed, so it is not excluded. bigmodel.cn is the China platform (its eligibility was not reviewed). Source: https://docs.z.ai/legal-agreement/terms-of-use.md
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - General pay-as-you-go keys only. Reject or warn on Coding Plan keys: the `/api/coding/` base URL and code 1315/1309 are the signals.
    - Discovery needs a static catalog.
    - No json_schema, and `tool_choice` is auto-only.

---

## B3. Moonshot / Kimi (core)

1. **Status:** Active. The international console moved to **platform.kimi.ai**: platform.moonshot.ai returns a 301 there. Current models are `kimi-k3` (1M context), `kimi-k2.6`, `kimi-k2.7-code` and `kimi-k2.7-code-highspeed`. Sources: https://platform.kimi.ai/docs/api/chat , https://platform.kimi.ai/docs/pricing/chat.md
2. **Endpoints:**
   - International: `https://api.moonshot.ai/v1` with `POST /chat/completions` (OpenAI-compatible).
   - Anthropic Messages at `https://api.moonshot.ai/anthropic/v1/messages`, **for `kimi-k3` only**.
   - China: `https://api.moonshot.cn/v1` via platform.moonshot.cn / platform.kimi.com. These are separate accounts (inferred from separate consoles; not stated explicitly).
   - Kimi Code (the membership coding plan) is separate again: `https://api.kimi.ai/coding/v1` (OpenAI) and `https://api.kimi.ai/coding/` (Anthropic) for overseas, and `api.kimi.com/coding/...` for China.
   - Sources: https://platform.kimi.ai/docs/api/chat , https://platform.kimi.ai/docs/api/messages.md , https://www.kimi.com/code/docs/en/ , search listing https://platform.moonshot.cn/docs/api
3. **Auth:** `Authorization: Bearer <MOONSHOT_API_KEY>`, including on the Anthropic endpoint. The key prefix is not documented. A key only works on the platform (.ai or .cn) that issued it ("Confirm key is from correct platform"). Source: https://platform.kimi.ai/docs/api/errors.md
4. **Discovery:** `GET /v1/models` returns these fields: `id`, `object`, `created`, `owned_by`, **`context_length`**, `supports_image_in`, `supports_video_in` and `supports_reasoning`. There is no pricing field and no pagination. Whether the list is all models or only key-accessible ones is not stated. Source: https://platform.kimi.ai/docs/api/list-models.md
5. **Runtime behaviour:**
   - **Streaming:** SSE ending with `[DONE]`; `stream_options.include_usage` adds usage to the final chunk.
   - **Tools:** supported, with `tool_choice` of auto, none or required.
   - **Structured output:** `json_object` **and `json_schema`**.
   - **Usage fields:** `prompt_tokens`, `completion_tokens`, `total_tokens`, `cached_tokens`, `prompt_tokens_details.cached_tokens` and `prompt_tokens_details.cache_write_tokens`.
   - **Cost and cancellation:** no cost field; cancellation UNKNOWN.
   - **Timeouts:** the gateway returns 504 if the response takes over 900 s, so use streaming.
   - Sources: https://platform.kimi.ai/docs/api/chat , https://platform.kimi.ai/docs/api/errors.md
6. **Errors:**

   | Status | Types |
   |---|---|
   | 400 | `content_filter`, `invalid_request_error` |
   | 401 | `invalid_authentication_error`, `incorrect_api_key_error` |
   | 403 | `permission_denied_error` |
   | **404** | `resource_not_found_error` (model unavailable) |
   | 429 | `engine_overloaded_error`, **`exceeded_current_quota_error`** (insufficient balance), `rate_limit_reached_error` |
   | 500 | `server_error` |
   | 503 | `server_unavailable` |
   | 504 | gateway timeout |

   - The docs say to wait **per `Retry-After`** on overload and rate-limit errors.
   - 429 responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.
   - Sources: https://platform.kimi.ai/docs/api/errors.md , https://platform.kimi.ai/docs/pricing/limits
7. **Pricing:** Per 1M tokens, on https://platform.kimi.ai/docs/pricing/chat.md .
   - kimi-k3: $3 in, $0.30 cached, $15 out, with cache writes at $3 (5-minute TTL) or $6 (1-hour TTL).
   - kimi-k2.6: $0.95 miss / $0.16 hit / $4 out.
   - **No free tier.** A $1 minimum recharge is needed to start, and a **$5 voucher** is granted when cumulative recharge reaches $5 (a trial-style credit).
   - Tier 0 limits ($1 recharged) are concurrency 1, 3 RPM and 1.5M TPD. **That is too low for multi-user use until the customer tops up to at least $10.** Source: https://platform.kimi.ai/docs/pricing/limits
   - **Data:** Moonshot may use content "to provide, maintain, develop, support, and improve the Services" unless an enterprise agreement says otherwise, so training is not excluded by default. Source: https://platform.kimi.ai/docs/agreement/modeluse.md
8. **BYOK terms:**
   - Customer Applications may be offered to End Users (§1).
   - **But §3.2(6) prohibits "buy, sell, or transfer API keys from, to or with a third party"**, and the terms bar making the account accessible to others. A customer entering their key into Flowline could be read as transferring it to a third party. **This is the strongest BYOK wording among the core providers.** It needs owner or legal review.
   - **Kimi Code membership keys:** these are for "third-party development tools", and the client User-Agent must not be tampered with. They are coding-scoped and unsuitable for Flowline.
   - Operator: Moonshot AI PTE. LTD. under Singapore law and SIAC arbitration; terms updated 2026-07-30.
   - Sources: https://platform.kimi.ai/docs/agreement/modeluse.md , https://www.kimi.com/code/docs/en/
9. **Eligibility:** Sanctioned parties and regions are excluded, with no country list given. Egypt is not mentioned. The international (.ai) and China (.cn) platforms are separate.
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - Technically the best fit of the core providers: `/models` with context_length, json_schema support and Retry-After.
    - The §3.2(6) key-transfer clause and training-by-default are legal risks that need owner sign-off.
    - Tier 0 rate limits are tiny.
    - Reject Kimi Code keys and `api.kimi.ai/coding` endpoints.

---

## B4. MiniMax (core)

1. **Status:** Active. Current models: MiniMax-M3.1-Flash-Preview, M3, M2.7(-highspeed), M2.5(-highspeed), M2.1(-highspeed) and M2. The music APIs were discontinued for new users on 2026-08-20. M3.1-Flash-Preview is "available only through Token Plan and MiniMax Code for now". Sources: https://platform.minimax.io/docs/api-reference/text-chat-anthropic.md , https://platform.minimax.io/docs/api-reference/responses-create , https://platform.minimax.io/docs/guides/pricing-paygo.md
2. **Endpoints:**
   - International: `https://api.minimax.io/v1`.
   - `POST /v1/chat/completions` (OpenAI-compatible).
   - `POST /v1/responses` (OpenAI Responses).
   - `POST /anthropic/v1/messages` (Anthropic-compatible; the docs call the Anthropic SDK "Recommended").
   - China: `https://api.minimaxi.com/v1` (platform.minimaxi.com).
   - Sources: https://platform.minimax.io/docs/api-reference/text-chat-openai.md , https://platform.minimax.io/docs/api-reference/responses-create , https://platform.minimax.io/docs/api-reference/text-chat-anthropic.md , search results for https://platform.minimaxi.com/docs/api-reference/text-openai-api
3. **Auth:**
   - `Authorization: Bearer <key>`. The Anthropic endpoint also accepts `x-api-key`, and Bearer wins if both are sent. The list-models doc describes the key as a JWT; the prefix is not documented.
   - Token Plan "Subscription Keys" are **not interchangeable** with pay-as-you-go API keys.
   - Sources: https://platform.minimax.io/docs/api-reference/text-chat-anthropic.md , https://platform.minimax.io/docs/token-plan/intro.md
4. **Discovery:**
   - `GET /v1/models` (OpenAI-style) returns only `id`, `object`, `created` and `owned_by`. There is no context length, no pricing and no pagination.
   - An Anthropic-style list also exists at https://platform.minimax.io/docs/api-reference/models/anthropic/list-models.md (not read in detail).
   - Source: https://platform.minimax.io/docs/api-reference/models/openai/list-models.md
5. **Runtime behaviour:**
   - **Streaming:** SSE via `stream:true`; the exact chunk format was not verified.
   - **Tools:** supported. The deprecated `function_call` is not; use `tools`. In multi-turn tool use, the full assistant message must be appended back to keep reasoning continuity.
   - **Structured output:** `response_format` json_schema is documented **only for MiniMax-Text-01** (per search snippet from https://platform.minimax.io/docs/api-reference/text-post). It is not documented for the M-series or on the Anthropic endpoint, so treat it as **unsupported for current models**.
   - **Other limits:** `n` must be 1 and temperature is in [0, 2].
   - **Usage fields:** `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details.cached_tokens`.
   - **Cost and cancellation:** no cost field; cancellation UNKNOWN.
   - Sources: https://platform.minimax.io/docs/api-reference/text-openai-api , https://platform.minimax.io/docs/api-reference/text-chat-openai.md
6. **Errors:** Errors come back in a `base_resp{status_code, status_msg}` body.

   | Code | Meaning |
   |---|---|
   | 1000 | unknown |
   | 1002 | rate limit |
   | 1004 | not authorized |
   | **1008** | insufficient balance |
   | 1039 | token limit |
   | 2013 | parameter error |
   | **2049** | invalid API key |

   - **The HTTP status mapping and Retry-After are not documented** (UNKNOWN). HTTP 200 with a nonzero `base_resp.status_code` has to be treated as an error, which is my inference from the error design, not a doc quote.
   - Sources: https://platform.minimax.io/docs/api-reference/errorcode.md , https://platform.minimax.io/docs/guides/rate-limits.md
7. **Pricing:**
   - MiniMax-M3: $0.30 in / $1.20 out per 1M tokens for contexts up to 512k (listed as "Permanent 50% off"), with double rates above 512k.
   - No free LLM tier or trial credits are documented. The rate-limit doc mentions a "free tier" only as not having speech-to-text.
   - Token Plan: $22, $55 or $132 a month, with 5-hour and weekly windows.
   - Data training/retention: **UNKNOWN**. The platform terms page is JS-rendered and returned no text to either fetch or curl.
   - Sources: https://platform.minimax.io/docs/guides/pricing-paygo.md , https://platform.minimax.io/docs/token-plan/intro.md
8. **BYOK terms:**
   - **Token Plan keys: NOT permitted.** They are built for coding tools (OpenClaw, Claude Code, Cursor, TRAE, Hermes Agent), and own products must use pay-as-you-go keys. Source: https://platform.minimax.io/docs/token-plan/intro.md
   - Pay-as-you-go ToS: **UNKNOWN**. https://platform.minimax.io/protocol/terms-of-service and https://www.minimax.io/terms-of-service-v2.html only render client-side; I tried WebFetch and curl. The operator is Nanonoble Pte. Ltd., Singapore (per a search snippet from minimax.io).
9. **Eligibility:** Separate international (minimax.io) and China (minimaxi.com) platforms. Country restrictions and Egypt: UNKNOWN (terms not readable).
10. **Verdict: SUITABLE-WITH-LIMITS (provisional).**
    - Only pay-as-you-go keys; reject Token Plan keys.
    - No json_schema on current models, and discovery gives no metadata.
    - HTTP error mapping and Retry-After are undocumented.
    - The ToS must be read in a browser before launch.

---

## B5. Alibaba Cloud Model Studio / DashScope (hosted Qwen) (core)

1. **Status:** Active, with an **endpoint migration under way**. The legacy `dashscope-intl.aliyuncs.com` domain "will no longer support new features after September 30, 2026", which is tomorrow relative to the check date. It still works, but the workspace-dedicated domains are recommended. Sources: https://www.alibabacloud.com/help/en/model-studio/regions , https://www.alibabacloud.com/help/en/model-studio/base-url
2. **Endpoints:**
   - Workspace domain: `https://{WorkspaceId}.{region}.maas.aliyuncs.com`, with these paths:
     - `/compatible-mode/v1/chat/completions` (OpenAI Chat)
     - `/compatible-mode/v1/responses` (OpenAI Responses)
     - `/apps/anthropic/v1/messages` (Anthropic Messages)
     - `/api/v1` (native DashScope)
   - Regions: Singapore `ap-southeast-1` (scope "International"), Beijing `cn-beijing` (Chinese Mainland), Frankfurt, Tokyo, Hong Kong, and US Virginia (`https://dashscope-us.aliyuncs.com/compatible-mode/v1`).
   - Legacy international base: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.
   - Coding Plan: `https://coding-intl.dashscope.aliyuncs.com/`. Token Plan: `https://token-plan.ap-southeast-1.maas.aliyuncs.com/`.
   - **BYOK therefore needs the customer's region and WorkspaceId, not just a key.**
   - Sources: https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope , https://www.alibabacloud.com/help/en/model-studio/compatibility-with-openai-responses-api , https://www.alibabacloud.com/help/en/model-studio/base-url , https://www.alibabacloud.com/help/en/model-studio/regions
3. **Auth:** `Authorization: Bearer <key>`. The Anthropic path also accepts `x-api-key`. Keys start with `sk-`. A key "is bound to the region in which it was created", and a region mismatch is a common cause of 401. Sources: https://www.alibabacloud.com/help/en/model-studio/error-code , https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope , search snippet from https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages
4. **Discovery:** **UNKNOWN or none.** The Anthropic-compatible path explicitly "does not provide a model list endpoint (/v1/models)". For `compatible-mode/v1/models` I found no official doc after two searches. Plan on a static catalog, or probe the endpoint live with a key. Source: https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages (search snippet)
5. **Runtime behaviour:**
   - **Streaming:** SSE, with `stream_options.include_usage`.
   - **Tools:** function type only.
   - **Conflict:** the OpenAI-compatible page says "Tools parameter cannot be used with stream=True simultaneously". This may be stale; verify live.
   - **Structured output:** `json_object` for most Qwen models (the prompt must contain "JSON"). `json_schema` only for selected models (Qwen3.7-Plus/Flash/Max, Qwen3.8-Max/Flash). Thinking mode does not guarantee valid JSON.
   - **Usage fields:** `prompt_tokens`, `completion_tokens`, `total_tokens`. Cached and reasoning token fields were not verified.
   - **Cost and cancellation:** no cost field; cancellation UNKNOWN.
   - Sources: https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope , https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output
6. **Errors:**

   | Status | Code | Meaning |
   |---|---|---|
   | 401 | `InvalidApiKey` | invalid key |
   | 403 | `AccessDenied` / `AccessDenied.Unpurchased` | no access / service not activated |
   | **404** | `ModelNotFound` | unknown model (sometimes `400 InvalidParameter "Model not exist"`) |
   | **400** | **`Arrearage`** | account overdue (the balance error is a 400) |
   | 403 | `AllocationQuota.FreeTierOnly` | free quota exhausted in free-only mode |
   | 429 | `Throttling.AllocationQuota` | token consumption exceeded |
   | 429 | `BudgetLimitExceeded` | budget limit reached |
   | 400 | `DataInspectionFailed` | content moderation |
   | 500 | `InternalError(.Algo)` | server error |

   - No `Retry-After` is documented.
   - Source: https://www.alibabacloud.com/help/en/model-studio/error-code
7. **Pricing:**
   - Per 1M tokens; some models price by tiers of input length per request. Singapore examples:

     | Model | Input | Output |
     |---|---|---|
     | Qwen3.8-Flash | $0.15 | $0.47 |
     | Qwen3.7-Plus, up to 256K | $0.4 | $1.6 |
     | Qwen3.8-Max | $2 | $6 |

   - **Free quota:** a limited trial of typically 1M tokens per model for 90 days. It is available **only in Singapore, International scope**, applies to real-time inference only, and expires whether used or not. A "Free Quota Only" mode stops charges.
   - Some distilled DeepSeek models are marked "Limited-time free". None are permanently free.
   - **Data:** "does not use customer business data to develop or improve models without explicit consent" (search snippets from privacy and FAQ docs), and request data is stored in the selected region.
   - Sources: https://www.alibabacloud.com/help/en/model-studio/model-pricing , https://www.alibabacloud.com/help/en/model-studio/new-free-quota , https://www.alibabacloud.com/help/en/model-studio/privacy-notice (snippet) , https://www.alibabacloud.com/help/en/model-studio/regions
8. **BYOK terms:**
   - **Pay-as-you-go:** the Alibaba Cloud International customer agreement and Model Studio product terms were **not reviewed**, so BYOK-specific clauses are UNKNOWN. The docs describe normal application backends as the standard use.
   - **Coding Plan keys: NOT permitted.** They are for "interactive use in programming tools", "should not be used for automated scripts, application backends, or other non-interactive scenarios", "personal use only and must not be shared". Violations can lead to suspension or key revocation. The same likely applies to the Token Plan, which was not verified.
   - Sources: search snippets from https://www.alibabacloud.com/help/en/model-studio/coding-plan and https://www.alibabacloud.com/help/en/model-studio/coding-plan-faq
9. **Eligibility:** Egypt is not stated. International customers use Singapore or the other non-Beijing regions; Beijing is Chinese Mainland scope. The free quota is Singapore only. The account must complete account information to activate.
10. **Verdict: SUITABLE-WITH-LIMITS.**
    - The connection form needs region plus WorkspaceId, or else the legacy domain, which is frozen from 2026-09-30.
    - No documented model-list API.
    - json_schema only on selected models, and tools with streaming may be restricted.
    - Reject Coding Plan and Token Plan keys (the `coding-intl` and `token-plan` hosts).

---

## B6. OpenCode Zen (core; the hosted gateway from sst/opencode)

1. **Status:** Active. Source: https://opencode.ai/docs/zen/
2. **Endpoints:** Base `https://opencode.ai/zen/v1`. The route depends on the model family:

   | Model family | Endpoint | Example |
   |---|---|---|
   | OpenAI models (e.g. GPT) | `/responses` (OpenAI Responses) | gpt-6-astra |
   | Anthropic models | `/messages` (Anthropic Messages) | claude-opus-5-5 |
   | Gemini | `/models/{model-id}` (Google generateContent style, `@ai-sdk/google`) | gemini-3.8-flash |
   | Open-weight models (Qwen, DeepSeek, MiniMax, GLM, Kimi) | `/chat/completions` (OpenAI Chat) | deepseek-v4-flash |

   - One summary also listed a `/systemone` route for "TypeSafe (Jev)". It was not confirmed in the verbatim pass; treat it as UNKNOWN. Command Code, by contrast, documents a `/systemone` route explicitly.
   - Source: https://opencode.ai/docs/zen/
3. **Auth:** `Authorization: Bearer $OPENCODE_API_KEY`. The key prefix is not documented. Workspaces can set monthly spend limits. Source: https://opencode.ai/docs/zen/
4. **Discovery:** `GET https://opencode.ai/zen/v1/models` returns `{object:"list", data:[{id, object:"model", created, owned_by:"opencode"}]}`. It was **readable without auth**, so it lists all public models, not only key-accessible ones. It has **no context length, pricing or endpoint-family field**, so the endpoint for each model has to be mapped from the docs table. Sources: https://opencode.ai/zen/v1/models , https://opencode.ai/docs/zen/
5. **Runtime behaviour:** Streaming, tools and structured output follow each upstream protocol (Zen is a pass-through for the SDK packages listed). A Zen-specific usage/cost field, error codes and cancellation behaviour are UNKNOWN; the docs page did not document them.
6. **Errors:** UNKNOWN. No Zen error table was found on https://opencode.ai/docs/zen/ .
7. **Pricing:**
   - Pay-as-you-go per 1M tokens from prepaid credit, with auto-reload at a $5 threshold (default reload $20).
   - **Verified zero-priced models:** Big Pickle, Space Bunny Free, LongCat 2.5 Preview Free, MiMo-V2.6-Flash Free, MiMo-V2.5 Free, Ling 3.0 Flash Fin Free, Nemotron 3 Ultra Free, Nemotron 3.5 Lightning Free, Muse Spark 1.3 Contributor Free, and Jev 1.13 Free (Jev's output price differs).
   - These are **promotional or free-trial models, not a permanent free tier.** The data terms differ for free models: Big Pickle, MiMo, Ling and Nemotron may use data to improve models; NVIDIA Nemotron is "Trial use only — do not submit personal or confidential data"; Muse Spark allows Meta training.
   - Paid models are zero-retention, except OpenAI and Anthropic (30-day retention). Everything is hosted in the US.
   - Source: https://opencode.ai/docs/zen/
8. **BYOK terms: NOT permitted for Flowline's use.**
   - The OpenCode ToS says: "You will only use the Services for your own internal use, and not on behalf of or for the benefit of any third party". Zen is named as a Service ("Certain of these large language models are provided directly by us if you use the OpenCode Zen paid offering ('Zen')").
   - A Flowline workspace running its customers' automations through a Zen key would be use "for the benefit of" third parties. It is arguable if the workspace itself is the only beneficiary, but the wording is restrictive.
   - **Conflict:** one summary of the Zen docs said Zen keys may be used in external apps. The verbatim pass showed that sentence is actually about using your *own* OpenAI or Anthropic keys inside Zen, not Zen keys elsewhere.
   - Terms effective 2026-08-15, Delaware law.
   - Source: https://opencode.ai/legal/terms-of-service
9. **Eligibility:** Export-control compliance is required, with no country list; Egypt is not mentioned. Models are hosted in the US.
10. **Verdict: UNSUITABLE** as a supported BYOK provider.
    - The ToS limits use to "internal use, and not on behalf of or for the benefit of any third party".
    - Discovery gives no metadata, and errors are undocumented.
    - At most a workspace could use it for its own internal automations, and that would need owner or legal sign-off.

---

## B7. Command Code Provider API (core; the Command Code coding tool by Langbase, not Cohere)

1. **Status:** Active. The Provider API was announced 2026-05-21. Sources: https://commandcode.ai/blog/command-code-provider-api , https://commandcode.ai/docs/provider
2. **Endpoints:** Base `https://api.commandcode.ai/provider/v1`.
   - `POST /chat/completions` (OpenAI Chat)
   - `POST /responses` (OpenAI Responses)
   - `POST /messages` (Anthropic Messages)
   - `GET /models`
   - `POST /systemone` ("System One decisions (typesafe/jev)")
   - Models must be sent to the endpoint that serves them; the API validates this.
   - Source: https://commandcode.ai/docs/provider
3. **Auth:** `Authorization: Bearer <CMD_API_KEY>`, or `x-api-key` for Anthropic SDKs. Keys are created in Command Code Studio; the prefix is not documented. The optional header `x-cmd-zdr: 1` enforces zero data retention and returns 422 if no ZDR upstream exists. Source: https://commandcode.ai/docs/provider
4. **Discovery:** `GET /models` returns a live list, with a **`supported_endpoints`** field per model. Other fields (context length, pricing) and pagination are UNKNOWN. Source: https://commandcode.ai/docs/provider
5. **Runtime behaviour:**
   - **Streaming:** SSE via `stream:true`. Chat Completions clients get a final `usage` chunk automatically.
   - **Tools:** `function` and `custom` tools run client-side. Remote `mcp` tools are rejected. Under ZDR only `function`, `custom` and `local_shell` are allowed.
   - **Structured output:** not documented (UNKNOWN).
   - **Usage and cost:** requests bill "at the underlying API rates. No markup". Whether a cost field is returned is UNKNOWN.
   - Source: https://commandcode.ai/docs/provider
6. **Errors:** 400 `unsupported_model` / `invalid_request_error`; 401 `authentication_error`; **403 `upgrade_required`** (plan has no API access); **422 `cmd_zdr_no_providers`**; 429 `rate_limit_error`. Retry-After is UNKNOWN. Source: https://commandcode.ai/docs/provider
7. **Pricing:**
   - **Provider plan** $15/month plus a $1.01 card fee, which includes $15 of usage. Top-ups "never expire", billed at cost.
   - Coding plans: Go $1, GOAT $10, Pro $20, Max $100/$200 a month, with 5-hour and weekly windows.
   - **Promotional free models:** "Space Bunny Alpha, Pixel Canary, Laguna S 2.1 (100% off)" and MiMo V2.5 Pro (99% off). These are limited promotions, not a permanent free tier.
   - Data: "We never train on your data or sell it". ZDR is available through the header; free and promotional models may be under different provider terms.
   - Sources: https://commandcode.ai/provider , https://commandcode.ai/docs/resources/pricing-limits
   - **Conflict: which plans include API access.**

     | Source | What it says |
     |---|---|
     | https://commandcode.ai/docs/provider | "Every plan except the Go plan has API access" |
     | https://commandcode.ai/blog/command-code-provider-api | "Pro plan or higher" |
     | https://commandcode.ai/docs/resources/pricing-limits | the separate Provider plan is "ideal for API-only users" |

8. **BYOK terms: restrictive.**
   - The Terms prohibit you to "Sublicense, resell, rent, lease, transfer, or assign the services to any third party" and state "You may not rent, lease, sell, or transfer access... to a third party".
   - "Automated tools, such as bots or scripts, must not be used to... perform automated requests". This is aimed at scraping or multi-account abuse, but it is literally broad.
   - The Provider page markets "Use it anywhere" and does not explicitly allow or forbid SaaS use.
   - Terms last updated 2026-09-20; Langbase, Inc. d/b/a Command Code; Delaware law.
   - Sources: https://commandcode.ai/terms , https://commandcode.ai/provider
9. **Eligibility:** The Terms say "All payments must be made in U.S. dollars and within the United States". Egyptian customers may not be able to pay directly (literal wording; practical enforcement UNKNOWN).
10. **Verdict: SUITABLE-WITH-LIMITS, leaning UNSUITABLE.**
    - Technically clean: OpenAI Chat/Responses plus Anthropic Messages, and `/models` with `supported_endpoints`.
    - The terms' transfer and automated-request wording, US-only payment wording and conflicting plan eligibility need owner or legal review before it is offered.
    - If offered, only Provider or API-enabled plan keys will work; handle 403 `upgrade_required`.

---

## B8. OpenCode Go (separate evaluation)

1. **Status:** Active subscription: "Go" at $10/month and "Go Plus" at $40/month. Source: https://opencode.ai/docs/go/
2. **Endpoints:** `https://opencode.ai/zen/go/v1/responses`, `/v1/chat/completions` or `/v1/messages` depending on the model. Model IDs look like `opencode-go/<model-id>`. There are 34 models, including DeepSeek V4.x, Qwen3.8, GLM-5.3 and Kimi K3. Source: https://opencode.ai/docs/go/
3. **Auth:** The OpenCode API key. Clients are also expected to identify themselves with their own User-Agent ("such as `my-coding-agent/1.0`, rather than a generic SDK or HTTP-library name") and to "Send a stable session ID in `x-opencode-session`". Source: https://opencode.ai/docs/go/
4. **Discovery:** No Go-specific list endpoint was found (UNKNOWN).
5. **Runtime behaviour:** Streaming, tools and structured output are per upstream protocol; these details are UNKNOWN.
6. **Errors and limits:** Error codes are UNKNOWN. Per-model dollar limits: 5-hour window 20% of the monthly limit, weekly 50%, monthly 100%. Traffic is monitored for abuse.
7. **Pricing:** Subscription only. Some models, such as "LongCat 2.5 Preview Free" and "Space Bunny Free", have temporary unlimited use. Most models have 0-day retention. Grok and GPT Luna models keep data 30 days. Muse Spark Contributor data trains Meta models. The DeepSeek ZDR agreement is "valid through October 31, 2026". Source: https://opencode.ai/docs/go/
8. **BYOK terms: NOT permitted for general-purpose SaaS inference.**
   - The Go docs say: "OpenCode Go is designed for OpenCode and other coding agents that produce similar types of requests". Clients must "Send typical coding agent traffic", and validated clients are coding agents only (Hermes, Claude Code, Codex, ZCode, Pi, jcode, Kilo Code CLI).
   - The OpenCode ToS also restricts use to "your own internal use, and not on behalf of or for the benefit of any third party".
   - Sources: https://opencode.ai/docs/go/ , https://opencode.ai/legal/terms-of-service
9. **Eligibility:** "Designed primarily for international users". No country list is given.
10. **Verdict: UNSUITABLE.** It is coding-agent traffic only, workflow automation traffic is not "typical coding agent traffic", it needs coding-agent User-Agent and session identification, and the ToS internal-use clause applies too.

---

## B9. GitHub Models (models.github.ai / models.inference.ai.azure.com) (separate evaluation)

1. **Status: RETIRED.**
   - Closed to new customers on 2026-06-16.
   - Brownouts ran on 2026-07-16 and 2026-07-23.
   - **Fully retired 2026-07-30:** "The playground, model catalog, inference API, and bring your own key (BYOK) are no longer available to any customer."
   - Sources: https://docs.github.com/en/github-models/about-github-models , https://github.blog/changelog/2026-07-30-github-models-is-now-retired/ , https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/ , https://github.blog/changelog/2026-06-16-github-models-is-no-longer-available-to-new-customers/
2. **Items 2 to 9:** Not applicable because the service is retired. GitHub points users to Microsoft (Azure AI) Foundry or GitHub Copilot instead. I found no other GitHub-hosted general inference API currently offered. Copilot is not a general BYOK inference API and was not evaluated.
10. **Verdict: UNSUITABLE.** Retired on 2026-07-30; do not implement.

---

## Cross-cutting notes, conflicts and unknowns

- **Coding-plan keys are never allowed for BYOK.** This applies to the Z.ai GLM Coding Plan (`/api/coding/paas/v4`, `/api/anthropic`), Kimi Code (`api.kimi.ai/coding`), the MiniMax Token Plan, the Alibaba Coding Plan and Token Plan (`coding-intl.dashscope…`, `token-plan…`), and OpenCode Go. Flowline should reject these base URLs, and surface codes such as Z.ai 1309/1315, with a clear reason.
- **Balance errors differ by provider:**

  | Provider | Balance error |
  |---|---|
  | DeepSeek | 402 |
  | Z.ai | 429, code 1113 |
  | Kimi | 429, `exceeded_current_quota_error` |
  | MiniMax | `base_resp` 1008 |
  | Alibaba | 400, `Arrearage` |

  **Do not treat every 429 as retryable.**
- **Retry-After is documented only by Kimi.** It is explicitly absent from the DeepSeek and Alibaba docs and UNKNOWN for the others.
- **json_schema support:** Kimi yes, Alibaba on selected models, DeepSeek, Z.ai and MiniMax (current models) json_object only or none, Command Code UNKNOWN.
- **Discovery metadata:** Kimi and DeepSeek return context length. MiniMax and Zen return ids only. Command Code returns `supported_endpoints`. Z.ai and Alibaba have no documented list endpoint.
- **Conflicts:**
  - DeepSeek resale clause: the search snippet says it exists, the direct ToS fetch did not find it.
  - OpenCode Zen "use keys in external apps": resolved as a misread of the "use your own OpenAI/Anthropic keys" sentence.
  - Command Code API-eligible plans: three different statements.
  - Alibaba tools with streaming: "cannot be used simultaneously" may be stale.
- **Unreadable sources:** the MiniMax platform ToS (JS-rendered) and the Z.ai rate-limit doc (redirects to the logged-in console).
- **Egypt:** no provider mentions Egypt explicitly. Z.ai's restricted list excludes it. The Command Code US-only payment wording may block Egyptian payers.


---

# Part C: expansion and deferred providers

## 1. Cerebras (inference cloud)

1. **Status:** active. Docs are live, and the docs example lists the models `gpt-oss-120b` and `qwen-3.8-27b` (https://inference-docs.cerebras.ai/api-reference/models).
2. **Endpoint:** base `https://api.cerebras.ai`, `POST /v1/chat/completions`. **Protocol:** OpenAI Chat Completions-compatible (https://inference-docs.cerebras.ai/api-reference/chat-completions). Responses, Anthropic and Gemini-compatible endpoints: UNKNOWN (none seen).
3. **Auth:** `Authorization: Bearer <key>` (https://inference-docs.cerebras.ai/api-reference/authentication). The auth page documents no key prefix and no org header.
4. **Discovery:** `GET /v1/models` needs auth. It returns only `id, object, created, owned_by`: no context length, pricing or capabilities, and no pagination documented (https://inference-docs.cerebras.ai/api-reference/models). Context and pricing have to be kept in a static catalog.
5. **Features:** streaming (`stream`, `chat.completion.chunk` deltas); `tools` and `tool_choice` (none, auto, required, or a named function); `response_format` `json_schema` with `strict`. Usage fields: `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`, `image_tokens`. No cost field (https://inference-docs.cerebras.ai/api-reference/chat-completions). Cancellation: UNKNOWN (nothing documented; assume closing the HTTP connection).
6. **Errors:** 400 BadRequest, 401 Authentication, 403 PermissionDenied, 404 NotFound, 408 timeout, 422 Unprocessable, 429 RateLimit, 500, 503 (https://inference-docs.cerebras.ai/support/error). The 429 message says whether the uncached or the total token limit was exceeded (https://inference-docs.cerebras.ai/support/rate-limits). Retry-After and rate-limit headers: UNKNOWN (not on the rate-limits page; `/api-reference/rate-limits` returned 404).
7. **Pricing:** the page is https://www.cerebras.ai/pricing (Developer tier plus Enterprise). The per-token numbers did not render in the fetch, so they are UNKNOWN. **Free:** trial credits only. New accounts get "$5 in free credits" that "expire 30 days after they're granted", and "Cerebras doesn't currently offer a no-cost tier that renews automatically". Trial limits: 5 RPM, 30K uncached TPM, 90K total TPM, 1M TPH, 1M TPD per model (https://inference-docs.cerebras.ai/support/rate-limits). Data retention and training terms: UNKNOWN (not on the pricing page; the ToS page is JS-rendered).
8. **BYOK terms (search snippet from https://cloud.cerebras.ai/terms; the page itself is JS-rendered and the fetch returned no text):** users may not "buy, sell or transfer API keys without prior written consent", nor "resell, distribute, modify, alter, or create derivative works of any part of the Service". I could not read the exact section numbers or any clause on credential sharing. **Risk:** a customer storing their key in Flowline is not a key sale or transfer, but this needs legal confirmation.
9. **Eligibility / Egypt:** UNKNOWN (not stated on any page I could read).
10. **Verdict: SUITABLE-WITH-LIMITS.** The protocol is a clean OpenAI Chat Completions match. Limits: a very small catalog; discovery has no metadata, so a static catalog is needed; the $5, 30-day trial is not a free tier; ToS text is not verified.

## 2. Together AI

1. **Status:** active (https://docs.together.ai/reference/chat-completions-1).
2. **Endpoint:** `https://api.together.ai/v1/chat/completions`. The reference also lists an "Inference" base `https://api-inference.together.ai/v2`, whose role is unclear, so use `/v1`. **Protocol:** OpenAI Chat Completions-compatible. Also OpenAI-compatible: completions, embeddings, images, audio, and `/models`. **Not supported:** Assistants, the OpenAI-shaped Batch and Files APIs, and Moderations (https://docs.together.ai/docs/openai-api-compatibility). No Anthropic or Responses endpoint is mentioned.
3. **Auth:** `Authorization: Bearer <TOGETHER_API_KEY>`. No key prefix or org header is documented.
4. **Discovery:** `GET /v1/models` returns `id, type` (chat, language, code, image, embedding, moderation or rerank), `display_name, organization, license, context_length`, and `pricing{input, output, cached_input, base, finetune, hourly}`. It has no pagination (one array) and an optional `dedicated` filter (https://docs.together.ai/reference/models-1). Capability flags for tools or JSON: UNKNOWN (not in the list fields).
5. **Features:** SSE streaming ending with `data: [DONE]`; `tools` and `tool_choice`; `response_format` `json_schema` or `json_object`; `reasoning` and `reasoning_effort`. Usage fields: `prompt_tokens`, `completion_tokens`, `total_tokens`. Cached and reasoning token fields are not documented in the schema. No cost field (https://docs.together.ai/reference/chat-completions-1). Cancellation: UNKNOWN.
6. **Errors:** 400; 401 missing or invalid key; **402 monthly spending limit exceeded**; **403 means input + max_tokens is over the context length (not a permissions error)**; 404 bad URL or unavailable model; 429 rate limit or GPU quota; 500; 503 high traffic; 504; 524; 529 (https://docs.together.ai/docs/error-codes). 429 responses carry an `x-ratelimit-reset` header in seconds. Limits are dynamic per model, with no published tiers (https://docs.together.ai/docs/rate-limits).
7. **Pricing:** https://www.together.ai/pricing lists prices per 1M tokens with cached-input and batch columns. One model was listed at $0.00/$0.00: "Ternary Bonsai 27B". Whether that is permanent or a promotion is UNKNOWN. **No free trial:** a $5 minimum credit purchase is required and the service is fully prepaid (https://docs.together.ai/docs/billing-credits). **Data:** by default Together stores prompts and responses and "may use them for product improvements". Admins can turn on Zero Data Retention. Sharing data for training is opt-in (https://docs.together.ai/docs/privacy-and-security, search snippet; ToS §3(3) on ZDR, paraphrased by fetch). Some models are passthrough and follow the upstream provider's data policy (same page).
8. **BYOK terms (https://www.together.ai/terms-of-service, paraphrased by fetch):** §4(3)(d) prohibits "transfer, distribute, resell, lease, license, or assign the Services **or otherwise offer the Services on a standalone basis**". Embedding the service in a product is not standalone, so BYOK looks permissible. §2(3) makes the user responsible for their credentials. I found no clause that explicitly bans BYOK.
9. **Eligibility:** age 13+ (§2(1)); export law applies (§4(3)(e)). Egypt: not stated. Serverless has no region selection (privacy docs, search snippet).
10. **Verdict: SUITABLE.** The best discovery of this group (context length and pricing). Caveats: remap 403 to "context too long"; Flowline should recommend that customers enable ZDR.

## 3. Fireworks AI

1. **Status:** active. ToS "Last Updated: July 10, 2026" (https://fireworks.ai/terms-of-service redirects to a sanity.io PDF, which I read verbatim).
2. **Endpoints:** OpenAI Chat Completions at `https://api.fireworks.ai/inference/v1/chat/completions`, plus `/completions` (https://docs.fireworks.ai/tools-sdks/openai-compatibility). **Anthropic Messages-compatible** `POST /v1/messages` with base `https://api.fireworks.ai/inference`, streaming supported (https://docs.fireworks.ai/api-reference/anthropic-messages, search snippet). A "Response API" is named in ToS §3.6. Model IDs look like `accounts/fireworks/models/<name>` (https://docs.fireworks.ai/api-reference/post-chatcompletions).
3. **Auth:** `Authorization: Bearer <key>`. No key prefix is documented.
4. **Discovery:** `GET https://api.fireworks.ai/v1/accounts/{account_id}/models`, with `account_id=fireworks` for public models. Pagination uses `pageSize` (max 200, default 50) and `pageToken`. Fields include `contextLength`, `supportsTools`, `supportsImageInput`, `serverlessModes`, and `skuInfos` (pricing SKUs) (https://docs.fireworks.ai/api-reference/list-models). Whether an OpenAI-shaped `/inference/v1/models` exists is UNKNOWN; the compatibility page only implies one.
5. **Features:** SSE with `[DONE]`; tools; `response_format` `json_object`, `json_schema` or `grammar`. Usage fields: `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`. **Usage is returned in the final streaming chunk by default.** No cost field; optional `perf_metrics_in_response`. **Difference from OpenAI:** if the context would overflow, `max_tokens` is silently truncated unless `context_length_exceeded_behavior: "error"` is set (compatibility page). Cancellation: UNKNOWN.
6. **Errors:** specific codes are not documented on the pages I fetched, so UNKNOWN. Rate-limit headers and Retry-After: UNKNOWN (https://docs.fireworks.ai/guides/quotas_usage/rate-limits).
7. **Pricing:** per 1M tokens with Standard, Priority and Fast tiers (https://docs.fireworks.ai/serverless/pricing, search snippet). **Free:** $1 of credits for new accounts (search snippet). Without a payment method an account is limited to **10 RPM**; with one, up to 6,000 RPM, plus spend tiers of $50, $500 and $5,000 (rate-limits page). **Data:** ToS §3.6 says Fireworks "will not use your Content to train our own models", with Zero Data Retention for inference. This does **not** cover "the Response API and any training, fine-tuning, or agent features".
8. **BYOK terms (ToS PDF, verbatim):**
   - §2.1: access is "solely for your personal use or internal business purposes". A customer using Flowline for its own business is arguably internal use.
   - §1.2(d): "you will not share your password(s) and/or any other authentication credentials with anyone else". **This is a direct BYOK risk:** a customer giving Flowline its API key could count as sharing credentials.
   - §2.2(d): no "buy, sell or transfer API keys without our prior written consent".
   - §2.2(e): no "sublicense, resell, distribute".
   - §18: export control; the user may not be located in a US-embargoed country, and this also applies to any "person to whom you make the Service available".

   Get written clarification from Fireworks before launch.
9. **Eligibility / Egypt:** §18 sanctions; Egypt not stated.
10. **Verdict: SUITABLE-WITH-LIMITS.** Technically strong: OpenAI plus Anthropic protocols and rich discovery. Limits: the §1.2(d) credential-sharing clause is a real legal question for BYOK; the no-card 10 RPM cap makes trial keys nearly useless; the silent `max_tokens` truncation must be overridden.

## 4. DeepInfra

1. **Status:** active. ToS "Last Updated: August 17th, 2026" (https://deepinfra.com/terms). Docs moved to docs.deepinfra.com through 308 redirects.
2. **Endpoint:** base `https://api.deepinfra.com/v1/openai`, `POST /chat/completions`. **Protocol:** OpenAI Chat Completions-compatible, plus embeddings and images. There is also a native API at `/v1/inference/{model_name}` (https://docs.deepinfra.com/chat/overview, https://docs.deepinfra.com/api-reference/introduction). Anthropic and Responses compatibility: UNKNOWN (not seen).
3. **Auth:** `Authorization: Bearer $DEEPINFRA_API_KEY`. No key prefix is documented.
4. **Discovery:** `GET https://api.deepinfra.com/models/list` is **public, with no auth**. Fields: `model_name, type, reported_type, pricing` (8 pricing kinds including token-based, with discount expiry), `max_tokens` (context, nullable), `tags, deprecated, quantization, private`. No pagination is documented (https://docs.deepinfra.com/api-reference/models/models-list). Whether an OpenAI-shaped `/v1/openai/models` exists: UNKNOWN.
5. **Features:** streaming; `tools` and `tool_choice`; `response_format` (JSON); `reasoning_effort`; service tiers (priority is +50%, flex is −20%); fail-fast option. The chat overview mentions a 16,384-token output cap for most models (https://docs.deepinfra.com/chat/overview). Usage fields: `prompt_tokens`, `completion_tokens`. **A cost field is reported:** `usage.estimated_cost` (search snippet from deepinfra.com; not seen in the fetched chat overview, so verify with a live call). Cached and reasoning token fields: UNKNOWN. Cancellation: UNKNOWN.
6. **Errors:** 429 "Rate limited". The limit is **200 concurrent requests per model**, not RPM, and 429s can occur under the limit while autoscaling (https://docs.deepinfra.com/account/rate-limits). Other codes and Retry-After: UNKNOWN.
7. **Pricing:** per 1M tokens (https://deepinfra.com/pricing). **Free:** none on the pricing page, which says "You have to add a card or pre-pay or you won't be able to use our services". **Conflict:** a search snippet claims "Free users get a small monthly quota", but the official pricing page does not say this. Startup program DeepStart: "up to 1B tokens" (https://deepinfra.com/deepstart, search snippet). **Data:** ToS §7(b) says DeepInfra "will not use Customer Data to train, fine-tune, or otherwise improve any model", with Zero Data Retention (paraphrased by fetch).
8. **BYOK terms (ToS, paraphrased by fetch):** §11(a)(viii) prohibits "resell, sublicense, rent, distribute, or otherwise make the Services available to any third party except as expressly permitted" and "sell, transfer, or share any account or access credentials". **This is a BYOK risk similar to Fireworks:** credential sharing is explicitly forbidden. §11(a)(i) forbids competitive use.
9. **Eligibility:** §20(e): no users located in comprehensively sanctioned countries. Egypt: not stated.
10. **Verdict: SUITABLE-WITH-LIMITS.** Excellent public discovery and possibly a per-request cost field. Limits: the "share … access credentials" clause needs legal sign-off; no free tier (card required); concurrency-based 429s.

## 5. Hugging Face Inference Providers (router.huggingface.co)

1. **Status:** active. The Responses API is labelled **beta** (https://huggingface.co/docs/inference-providers/en/guides/responses-api).
2. **Endpoints (router, base `https://router.huggingface.co/v1`):**
   - `POST /chat/completions`: OpenAI Chat Completions-compatible, **chat tasks only**.
   - `POST /responses`: OpenAI Responses (beta). "All Inference Providers chat completion models should be compatible."
   - `GET /models`.
   - Other tasks (text-to-image, embeddings, speech) go through HF's own clients or provider-specific routes, not the OpenAI-compatible endpoint.
   - **Model families:** every chat LLM/VLM from all partners goes through the same `/v1/chat/completions` and `/v1/responses`. Partners: Baseten, Cerebras, Cohere, DeepInfra, Featherless, Fireworks, Groq, HF Inference, Novita, Nscale, OVHcloud, Public AI, Scaleway, Together and Z.ai. Fal, Replicate and WaveSpeed are image, video or speech only.
   - **Provider selection:** suffix `model:provider`, `:fastest` (default), `:cheapest` or `:preferred` (https://huggingface.co/docs/inference-providers/index).
   - Anthropic Messages: UNKNOWN (not documented).
3. **Auth:** `Authorization: Bearer hf_…`, using a **fine-grained token with the "Make calls to Inference Providers" permission** (https://huggingface.co/docs/inference-providers/tasks/chat-completion). Org billing header: `X-HF-Bill-To: <org>` or a resource-group ID, for Team and Enterprise (https://huggingface.co/docs/inference-providers/pricing).
4. **Discovery:** `GET /v1/models` "returns available models across all providers, including per-provider pricing, context length, latency, and throughput when available" (index page). Pagination: UNKNOWN. Also the Hub API filter `inference_provider=all` and `hf models ls --warm`.
5. **Features (chat):** `stream` plus `stream_options.include_usage` (SSE); `tools` and `tool_choice` (auto, none, required, or a named function); `response_format` `json_schema` (with `strict`) or `json_object`; `reasoning_effort`. Parameter support depends on the provider and model. Usage fields: `prompt_tokens`, `completion_tokens`, `total_tokens` only. No cost field in the response; there is a usage breakdown in settings (chat-completion task page). Responses API: semantic SSE events (`response.created`, `output_text.delta`, `response.completed`), tools, structured outputs, remote MCP, `reasoning.effort`. Cancellation: UNKNOWN.
6. **Errors / 429 / Retry-After:** UNKNOWN (no error page found). Automatic failover happens only with `provider="auto"` (index page).
7. **Pricing:** pass-through, "no extra markup on provider rates". **Monthly credits:** Free users $0.10 ("subject to change"), PRO $2.00, Team/Enterprise $2.00 per seat. Pay-as-you-go beyond credits requires buying credits. **Custom Provider Key mode:** the provider bills directly and HF credits don't apply (pricing page). Data retention and training under the HF router: UNKNOWN (HF ToS summary: "We will not sell your Content"; provider data policies apply).
8. **BYOK terms:** the HF ToS (https://huggingface.co/terms-of-service, "Last Updated: September 15, 2022", paraphrased by fetch) has no specific resale ban found. The user must keep credentials confidential and is "solely responsible for any action taken with your Account". Inference Providers fees may be in Supplemental Terms, which I did not locate (UNKNOWN). No explicit prohibition of BYOK SaaS was found.
9. **Eligibility:** natural person aged 13+ or a registered legal entity; US export and sanctions compliance. Egypt: not stated.
10. **Verdict: SUITABLE-WITH-LIMITS.** One key reaches many providers, discovery is rich, and there are both Chat and Responses endpoints. Limits: the free credit ($0.10/month) is negligible; feature support varies by the routed provider (tools and JSON are not guaranteed); the error and retry contract is undocumented; the Responses API is beta.

## 6. Cloudflare Workers AI

1. **Status:** active (https://developers.cloudflare.com/workers-ai/).
2. **Endpoints (account ID is in the URL):**
   - OpenAI-compatible base `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1`: `/chat/completions` ("most" text-generation models), `/embeddings`, and `/responses` (**only `@cf/openai/gpt-oss-120b` and `-20b`, and `stream:false` only**) (https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/).
   - Native: `POST /client/v4/accounts/{account_id}/ai/run/{model}`, with the envelope `{result, success, errors, messages}` (https://developers.cloudflare.com/workers-ai/get-started/rest-api/).
   - BYOK therefore needs **two customer inputs: an account ID and an API token.**
3. **Auth:** `Authorization: Bearer <API token>`. The token needs **Workers AI – Read + Edit** (REST get-started page). The model-search API also accepts API Email + API Key headers.
4. **Discovery:** `GET /client/v4/accounts/{account_id}/ai/models/search`, with pagination `page`/`per_page` and filters `task, search, author, source, hide_experimental, include_deprecated`. There is an option `format=openrouter` (https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/). Exact fields (context and pricing): UNKNOWN; the capability "properties" are not detailed.
5. **Features:**
   - Streaming is supported on chat, but the SSE format under the OpenAI-compatible path is UNKNOWN.
   - Function calling: "traditional", on models with the function-calling property, plus Cloudflare's own "embedded" helper (https://developers.cloudflare.com/workers-ai/features/function-calling/).
   - **JSON Mode:** `response_format` `json_object` or `json_schema` on **only 6 listed models**. It "can't guarantee" schema compliance (the error is "JSON Mode couldn't be met") and **does not support streaming** (https://developers.cloudflare.com/workers-ai/features/json-mode/).
   - Usage and cost fields: UNKNOWN. Cancellation: UNKNOWN.
6. **Errors:** when the daily free allocation is exceeded, operations fail with an error (pricing page); the error code is UNKNOWN. RPM limits by task: text generation 300 RPM; models that need the Paid plan get 20 RPM, or 50 with prepaid AI Gateway credits (https://developers.cloudflare.com/workers-ai/platform/limits/). 429 format and Retry-After: UNKNOWN.
7. **Pricing:** billed in Neurons at "$0.011 / 1,000 Neurons", with per-token equivalents published. **Free: permanent daily allocation of "10,000 Neurons per day at no charge"**, reset at 00:00 UTC, on both the Free and Paid plans. Some models (Kimi, GLM, DeepSeek variants) need Workers Paid or prepaid AI Gateway credits (https://developers.cloudflare.com/workers-ai/platform/pricing/). **Data:** "Cloudflare does not use your Customer Content to (1) train any AI models made available on Workers AI". Content is stored only if you use a storage service (https://developers.cloudflare.com/workers-ai/platform/data-usage/).
8. **BYOK terms:** Self-Serve Subscription Agreement (effective September 12, 2025; https://www.cloudflare.com/terms/, paraphrased by fetch):
   - §2.2.1(a) forbids selling access "to any third party, or sign up for the Services on behalf of a third party". **Flowline must not create Cloudflare accounts for customers; the customer must sign up themselves.**
   - §2.3: the customer is responsible for the confidentiality of credentials "(such as API tokens…)". Cloudflare is not liable for third-party access through those credentials, which is not a ban.
   - The models are Third-Party Products with licensor terms (https://www.cloudflare.com/service-specific-terms-other-terms/, search snippet).
9. **Eligibility:** §7.1 sanctions and export. Egypt: not stated.
10. **Verdict: SUITABLE-WITH-LIMITS.** A genuine permanent free allocation, and clear no-training terms. Limits: account ID plus token in the URL; JSON mode on only 6 models and not while streaming; weak tool calling; Responses limited to gpt-oss and non-streaming; discovery fields are unclear.

## 7. Vercel AI Gateway

1. **Status:** active. Docs last updated 2026-09-08 to 2026-09-18.
2. **Endpoints (base `https://ai-gateway.vercel.sh`):**
   - **OpenAI Chat Completions** `/v1/chat/completions`, plus `/v1/embeddings` and `/v1/models` (https://vercel.com/docs/ai-gateway/openai-compat, which redirects to …/sdks-and-apis/openai-chat-completions).
   - **OpenAI Responses** `/v1/responses` and `/v1/responses/compact`, with a WebSocket mode (https://vercel.com/docs/ai-gateway/sdks-and-apis/responses).
   - **Anthropic Messages** `/v1/messages` and `/v1/messages/count_tokens` (https://vercel.com/docs/ai-gateway/anthropic-compat, which redirects).
   - OpenResponses and Cohere-compatible APIs are also listed (FAQ).
   - **Model families:** all families (anthropic/*, openai/*, google/* and so on) are callable through every endpoint using `provider/model` IDs. `cache_control` passthrough works only for Anthropic, Vertex-Anthropic and Bedrock-Anthropic models (Anthropic-compat page).
3. **Auth:** AI Gateway API key as `Authorization: Bearer`; the Messages endpoint also accepts `x-api-key`. Vercel OIDC tokens work on Vercel deployments. "If an API key is specified it will take precedence over any OIDC token, even if the API key is invalid." No key prefix is documented.
4. **Discovery:** `GET /v1/models` needs **no auth**. Fields: `id, name, description, released, context_window, max_tokens, type, tags` (e.g. `tool-use`, `reasoning`, `vision`), `supported_parameters, reasoning_options`, and `pricing{input, output, input_cache_read, input_cache_write, *_tiers, image, web_search}` per token. `GET /v1/models/{creator}/{model}/endpoints` gives per-provider context, pricing, `supported_parameters`, uptime and latency. Pagination: none documented (https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api).
5. **Features:** streaming (SSE; Responses also has WebSocket); tools; structured outputs (`response_format` on Chat, `text.format` on Responses, JSON Schema on Messages); reasoning controls. **Cost reporting:** `GET /v1/generation?id=gen_…` returns `total_cost, market_cost, upstream_inference_cost` (BYOK), `native_tokens_prompt/completion/reasoning/cached/cache_creation` and `is_byok`. Ingestion is async, so an early lookup returns "Usage event not found". `GET /v1/credits` returns the balance. Messages usage fields: `input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens`. Cancellation: UNKNOWN.
6. **Errors (FAQ https://vercel.com/docs/ai-gateway/faq):**
   - 401: bad, missing or revoked key.
   - 402: no credit balance; with `quota_for_entity_exceeded`, a budget was hit.
   - 403 `customer_verification_required`: a payment method is needed **even to use free credits**.
   - 403 naming the free tier: model not in the free-tier subset.
   - 403 naming team restrictions: allowlist.
   - 404: model not found.
   - 429: may come from the gateway or the upstream provider. "Some `429` responses include a `retry-after` header" (https://vercel.com/docs/ai-gateway/rate-limits). Gateway body: `{"error":{"message":"Rate limit exceeded","type":"rate_limit_exceeded"}}`.
   - 500 and 503.
7. **Pricing:** "no markup and no platform fee on tokens", at provider list price. **Free tier:** a monthly included credit, "not an expiring trial", limited to a **subset of models** with lower per-model rate limits. The amount is **$5 per 30 days** according to https://vercel.com/academy/ai-gateway/use-ai-credits (search snippet); the fetched docs pages don't state the amount. Buying credits moves the team to the paid tier and **ends the monthly free credit**. Purchased credits expire after 1 year. Provider BYOK inside Vercel requires purchased credits (https://vercel.com/docs/ai-gateway/pricing). **Data:** "Vercel does not train on your prompts, and AI Gateway itself does not retain prompt or response content". Per-request ZDR routing is Pro/Enterprise (FAQ). **Conflict:** AI Product Terms §8.4 gives a *contractual* no-training warranty only to Enterprise customers (https://vercel.com/legal/ai-product-terms, effective March 31, 2026, paraphrased by fetch), while the FAQ says no training for everyone.
8. **BYOK terms:** AI Product Terms §8.3: "You are solely responsible for any application that you offer that interacts with AI Gateway". The operator must give its own ToS and privacy policy and disclose AI use. §8.1: provider terms apply to content. §8.2: "Stealth Models" may be trained on by providers and must not process personal data. **Building a customer-facing app is explicitly contemplated.** I found no clause on a customer handing its gateway key to a third-party SaaS, so that point is UNKNOWN.
9. **Eligibility:** needs a Vercel team account plus a payment method for free credits (403 `customer_verification_required`). Egypt: not stated. Regional inference exists as a control (FAQ).
10. **Verdict: SUITABLE.** The strongest BYOK target of the group: three protocols, public discovery rich in metadata, per-request cost lookup, and documented errors and retry. Limits: free credit only on subset models and needs a card; exclude or flag Stealth models; show `retry-after` only when it is present.

## 8. NVIDIA hosted API catalog (build.nvidia.com / integrate.api.nvidia.com)

1. **Status:** active as a **trial** service. The terms are "NVIDIA API TRIAL TERMS OF SERVICE", v. September 19, 2025 (https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf, read verbatim).
2. **Endpoint:** `https://integrate.api.nvidia.com/v1/chat/completions`. **Protocol:** OpenAI Chat Completions-compatible (https://docs.api.nvidia.com/nim/reference/llm-apis, https://docs.api.nvidia.com/nim/reference/meta-llama-3_3-70b-instruct-infer). Model IDs look like `meta/llama-3.3-70b-instruct`.
3. **Auth:** `Authorization: Bearer $NVIDIA_API_KEY`; the key prefix is **`nvapi-`** (llm-apis page).
4. **Discovery:** a `/v1/models` endpoint and its fields are UNKNOWN (not confirmed on a fetched page). Metadata (context, pricing) is not documented, so UNKNOWN.
5. **Features:** `stream` (SSE); `tools` and `tool_choice`. The per-model page does **not** list `response_format` or `guided_json`, so structured output on hosted models is UNKNOWN; the llm-apis overview claims "structured output options" generally. Usage fields: `prompt_tokens, completion_tokens, total_tokens`. No cost field. Per-model limits apply, for example `max_tokens` max 4096 on llama-3.3-70b.
6. **Errors:** documented codes are 200, **202 "Result is pending. Client should poll using the requestId"**, 422 and 500. 401, 402, 404 and 429 are not documented. The **40 RPM** default limit comes only from NVIDIA Developer Forum user posts (e.g. https://forums.developer.nvidia.com/t/request-for-nvidia-build-api-rate-limit-increase-40-rpm-200-rpm/377433). That is an official domain but not vendor documentation, so treat it as unverified.
7. **Pricing:** there is no pay-as-you-go price for the hosted catalog. Trial Terms §1.4: "NVIDIA may extend trial service credits ('Credits') … for trial purposes only". Production needs a "Subscription" from NVIDIA or a Service Provider. Self-hosted NIM production needs NVIDIA AI Enterprise, "$4500 per GPU per year or ~ $1 per GPU per hour" (https://docs.api.nvidia.com/nim/docs/product). **Data:** §2.3: NVIDIA "will not store or use User Content or Generated Content at the end of each API Service session", with exceptions for logging for security, fraud and abuse (§2.4 and §3.3), which may be "shared with third party service providers".
8. **BYOK terms (verbatim):**
   - §1.2: "access to the API Service for limited trial purposes only and **without use of the API Service or Generated Content in production**".
   - §1.4: "Unless you purchase a Subscription … you may only use the API Service for **internal testing and evaluation purposes, not in production**".
   - The NIM FAQ defines production as including "any non-testing activity including activity serving real end-users".
   - §4.12: no use to build competing products.

   **Flowline running customer workflows is production use.** A trial key must not be offered as a production provider.
9. **Eligibility:** §15.4 export and sanctions; the user must be an adult of legal age. Egypt: not stated.
10. **Verdict: UNSUITABLE for production BYOK.** The trial terms prohibit production use. At most, offer it as a clearly labelled "evaluation only, not for production" connection, and only if the owner approves that; otherwise defer.

---

## Deferred providers (document only)

## D1. AWS Bedrock
- **Status:** active.
- **Auth:**
  - SigV4 (IAM).
  - **Bedrock API keys**, sent as `Authorization: Bearer` or `AWS_BEARER_TOKEN_BEDROCK`. **Short-term** keys last up to 12 hours, inherit the IAM principal, and are "Recommended for production use". **Long-term** keys create an IAM user with a service-specific credential and are "for exploration only". Use of either is governed by `bedrock:CallWithBearerToken` and `bedrock-mantle:CallWithBearerToken` (https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html).
- **Endpoints:**
  - Native: `https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse`.
  - **OpenAI Chat Completions:** `https://bedrock-runtime.{region}.amazonaws.com/openai/v1/chat/completions` (recommended; SigV4 or API key; **no `GET /models`**).
  - `https://bedrock-mantle.{region}.api.aws/v1/chat/completions` (compatibility endpoint; has `/models`).
  - Both endpoints also support the Responses API and the Anthropic Messages API, varying by model. For example, GPT-OSS on bedrock-runtime supports Chat but not Responses (https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html, plus a search snippet for Responses and Messages).
- **Region and model:** the base URL is per region. Model IDs can be cross-region inference profiles (e.g. `us.anthropic.claude-sonnet-4-6`). Discovery uses ListFoundationModels and ListInferenceProfiles. Each endpoint has its own per-model quotas.
- **BYOK verdict: DEFERRED, medium-high complexity.** The customer must supply region plus key, and short-term keys expire within 12 hours. A long-term key is simple but AWS discourages it for production. SigV4 means storing an access key and secret. The OpenAI-compatible path lowers the protocol cost, but model availability per region, endpoint and API is a matrix.

## D2. Azure OpenAI / Azure AI Foundry (now titled "Microsoft Foundry")
- **Status:** active. The v1 API has been GA since Aug 2025 (https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle, which canonicalizes to /azure/foundry/…).
- **Auth:** `api-key: <key>` header, **or** Microsoft Entra ID `Authorization: Bearer <token>` (scope `https://ai.azure.com/.default`, role `Cognitive Services OpenAI User`).
- **Endpoint:** `https://{RESOURCE}.openai.azure.com/openai/v1/` or `https://{RESOURCE}.services.ai.azure.com/openai/v1/`, with `/responses` and `/chat/completions`. **`api-version` is no longer required on v1.** `model` = **your deployment name**. Non-OpenAI Foundry models (DeepSeek, Grok, MAI-DS-R1) work through v1 chat completions and Responses.
- **Region and deployment:** needs a resource in a supported region plus at least one model deployment.
- **BYOK verdict: DEFERRED, medium complexity.** Protocol-compatible with OpenAI. The customer must supply resource name plus key plus deployment names; there is no global model catalog, so the model list is the customer's deployments. Entra ID is not practical for BYOK.

## D3. Google Vertex AI (docs now titled "Gemini Enterprise Agent Platform")
- **Status:** active (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/openai; the name change is seen in page titles).
- **Auth:** OAuth access token from ADC or a service account (scope `cloud-platform`). **API keys** exist: express mode and Google Cloud API keys. The docs recommend API keys for testing and ADC for production (search snippet from https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart?usertype=apikey and https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys?usertype=expressmode).
- **Endpoints:**
  - Native: `https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`.
  - **Express mode:** `https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:generateContent?key=API_KEY`, with methods countTokens, generateContent and streamGenerateContent (search snippet; https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/vertex-ai-express-mode-api-reference).
  - **OpenAI-compatible:** `https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/openapi/chat/completions`, with an OAuth token passed as the API key. Whether it also accepts an API key is UNKNOWN (search snippet; the fetched page was truncated).
- **Express-mode quotas, free usage and eligibility:** UNKNOWN (the overview page fetch was empty).
- **BYOK verdict: DEFERRED, high complexity.** Needs project plus location plus a service-account JSON (a sensitive secret) or OAuth. Express-mode API keys are simpler but positioned for testing and limited to Gemini generateContent. The OpenAI-compatible path still needs an OAuth token that must be refreshed.

---

## Notable conflicts and unknowns
- **DeepInfra free tier:** a search snippet says there is a "small monthly quota", but the official pricing page requires a card or prepayment and names no free tier. Treat it as **no free tier**.
- **Vercel no-training:** the FAQ says Vercel does not train on prompts for anyone, but AI Product Terms §8.4 gives a contractual warranty only to Enterprise. Stealth models are trainable by their providers (§8.2).
- **Vercel free amount:** "$5 / 30 days" appears only on the Vercel Academy page (search snippet), not on the docs pricing page. Free credits also need a payment method on file (403 `customer_verification_required`).
- **Together:** the reference shows two bases (`api.together.ai/v1` and `api-inference.together.ai/v2`) and doesn't explain the second. Its 403 means context overflow, not a permissions problem.
- **Credential-sharing clauses that affect BYOK:** Fireworks §1.2(d) (verbatim) and DeepInfra §11(a)(viii) (paraphrased) forbid sharing credentials; Cerebras forbids transferring keys (search snippet). **These need owner and legal review before launch.**
- **NVIDIA:** the trial terms prohibit production use; the 40 RPM figure is from forum posts only.
- **Egypt:** no provider's page names Egypt as eligible or ineligible. All say US export and sanctions laws apply. UNKNOWN; confirm at signup.
- **UNKNOWN across the board:** cancellation semantics (none documented; assume closing the HTTP connection); Retry-After for Cerebras, Fireworks, DeepInfra, HF and Cloudflare; model-list fields for Cloudflare and NVIDIA; the HF error contract.

---


---

# Summary table (all providers, checked 2026-09-29)

| provider | tier | protocol(s) | discovery | tools | structured output | streaming | free tier type | BYOK terms | verdict | sources checked |
|---|---|---|---|---|---|---|---|---|---|---|
| OpenAI | core | OpenAI Responses (primary); OpenAI Chat Completions (supported) | GET /v1/models: id/created/owned_by/shutdown_date; no ctx/pricing; no pagination | yes | json_schema strict (Chat `response_format`, Responses `text.format`) | SSE; Chat usage only with `stream_options.include_usage` | none (moderation only free); prepaid credits | allowed for Customer Apps; OSA §3.3(g) no buy/sell/transfer of keys; §3.1 no credential sharing | SUITABLE | 2026-09-29 |
| Anthropic | core | Anthropic Messages native; OpenAI-compat (test-only, drops response_format/strict) | GET /v1/models: cursor pagination; max_input_tokens, max_tokens, capabilities; no pricing | yes (forced tool_choice rejected on Opus/Sonnet 5.5) | output_config.format structured outputs + strict tools | SSE, mid-stream error events | small trial credits | Commercial Terms A.1 allows powering customer products; API keys only, never claude.ai/Pro/Max OAuth | SUITABLE | 2026-09-29 |
| Google Gemini API | core | Gemini generateContent native; OpenAI-compat (beta) | GET /v1beta/models: pageToken; input/outputTokenLimit, supportedGenerationMethods, thinking; no pricing | yes | responseMimeType + responseSchema | SSE (`alt=sse`) | permanent free tier with quota; free-tier data used for training/human review | allowed; only paid services for EEA/CH/UK users | SUITABLE-WITH-LIMITS | 2026-09-29 |
| xAI | core | OpenAI Responses-style (primary); Chat Completions (legacy); Anthropic-compat (deprecated) | GET /v1/models (per key) + /v1/language-models with pricing & context | yes | text.format (json_schema UNKNOWN) | SSE, `[DONE]` | none found | Enterprise ToS: End Users only via "Bundled Service" (search excerpt; legal review) | SUITABLE-WITH-LIMITS | 2026-09-29 |
| Groq | core | OpenAI Chat-compatible; OpenAI Responses-compatible | GET /models: context window, max completion; no pricing | yes | response_format json_schema | SSE; 499 cancel | free plan with org quota | Services Agreement §3.1 allows End Users via Customer App; no key resale/transfer | SUITABLE-WITH-LIMITS | 2026-09-29 |
| OpenRouter | core (gateway) | OpenAI Chat (canonical); OpenAI Responses; Anthropic Messages ("Skin") | GET /api/v1/models: offset/limit; context_length, pricing, supported_parameters, expiration_date | yes (model-dependent) | response_format (model-dependent) | SSE; mid-stream error after 200 | `:free` variants: 20 rpm, 50/day (<$10 credits) or 1000/day | ToS §7(4) no reselling API access; upstream model terms apply | SUITABLE-WITH-LIMITS | 2026-09-29 |
| Mistral | core | OpenAI Chat-compatible shape (native /v1/chat/completions) | GET /v1/models: capabilities, max_context_length, deprecation; no pricing | yes | response_format JSON mode/schema | SSE | free mode with monthly included usage; free-mode data may be used for training | no buy/sell/transfer of keys (search excerpt; legal review) | SUITABLE-WITH-LIMITS | 2026-09-29 |
| Cohere | core | Cohere v2 chat native; OpenAI-compat (api.cohere.ai/compatibility/v1) | GET /v1/models: page_token; context_length, endpoints, features; no pricing | yes | response_format json_object + schema | SSE typed events | trial key: 1,000 calls/mo, non-commercial only | SaaS §4(a)(i) credentials not shared with third parties without consent; §2(d) Permitted Users only (legal review) | SUITABLE-WITH-LIMITS (weakest) | 2026-09-29 |
| DeepSeek | core | OpenAI Chat; Anthropic Messages (`/anthropic`); Responses listed as supported but path UNKNOWN | `GET /models` with context_window, max_output_tokens, modalities, effort; no price | yes (`strict` beta) | json_object only | SSE + `[DONE]`, keep-alive comments | granted balance possible (details UNKNOWN); no free tier | downstream end-user apps allowed (§1.1); §2.2 "do not share key" caveat | SUITABLE-WITH-LIMITS | 2026-09-29 |
| Z.ai / GLM | core | OpenAI Chat (`/api/paas/v4`); Anthropic only on Coding Plan | none documented (static catalog) | yes; `tool_choice` auto only | json_object only | SSE + `[DONE]` | GLM-4.7-Flash, 4.5-Flash and 4.6V-Flash listed "Free" (quota and durability UNKNOWN) | general API OK (§III.9); Coding Plan keys restricted to supported tools | SUITABLE-WITH-LIMITS (pay-as-you-go keys only) | 2026-09-29 |
| Moonshot / Kimi | core | OpenAI Chat; Anthropic Messages (kimi-k3 only) | `GET /v1/models` with context_length, image/video/reasoning flags | yes (auto/none/required) | json_object + json_schema | SSE + `[DONE]`, `include_usage` | trial-style $5 voucher after $5 recharge; no free tier | end-user apps OK, but §3.2(6) bans transferring keys "to or with a third party"; Kimi Code keys coding-only | SUITABLE-WITH-LIMITS (legal review) | 2026-09-29 |
| MiniMax | core | OpenAI Chat; OpenAI Responses; Anthropic Messages (recommended) | `GET /v1/models` ids only | yes | json_schema only on legacy Text-01; none for M-series | SSE | none documented | pay-as-you-go ToS UNKNOWN (JS-rendered); Token Plan keys coding-tools only | SUITABLE-WITH-LIMITS (provisional) | 2026-09-29 |
| Alibaba Model Studio | core | OpenAI Chat; OpenAI Responses; Anthropic Messages; native DashScope | none documented (Anthropic path says no `/models`) | yes (function; streaming+tools conflict) | json_object; json_schema on selected Qwen3.7/3.8 | SSE, `include_usage` | limited trial quota (~1M tokens/model, 90 days, Singapore only) | pay-as-you-go terms not reviewed; Coding Plan: no backends/automation | SUITABLE-WITH-LIMITS (region + WorkspaceId; legacy domain frozen 2026-09-30) | 2026-09-29 |
| OpenCode Zen | core | Responses (OpenAI models), Messages (Anthropic), Google-style (Gemini), Chat (open models) | public `GET /zen/v1/models`, ids only | per upstream | per upstream | per upstream | promotional zero-priced models; some train on data | ToS: "own internal use... not for the benefit of any third party" | UNSUITABLE | 2026-09-29 |
| Command Code Provider API | core | OpenAI Chat; OpenAI Responses; Anthropic Messages; `/systemone` | `GET /models` with `supported_endpoints` | yes (client-side; no remote MCP) | UNKNOWN | SSE, final usage chunk | promotional 100%-off models; Provider plan $15/mo | ToS bans resell/transfer of access; US-payment wording; plan eligibility conflicts | SUITABLE-WITH-LIMITS, leaning UNSUITABLE (legal review) | 2026-09-29 |
| OpenCode Go | separate eval | Responses / Chat / Messages under `/zen/go/v1` | UNKNOWN | per upstream | per upstream | per upstream | subscription; temporary unlimited promo models | "designed for OpenCode and other coding agents"; coding-agent traffic, User-Agent and session ID required; ToS internal use | UNSUITABLE | 2026-09-29 |
| GitHub Models | separate eval | n/a (retired) | n/a | n/a | n/a | n/a | n/a | n/a | UNSUITABLE (retired 2026-07-30) | 2026-09-29 |
| Cerebras | expansion | OpenAI Chat | `/v1/models` (auth; id/owned_by only) | yes | json_schema strict | SSE | trial credits ($5, 30-day expiry) | no key buying/selling/transfer; no resale (snippet; page JS-only) | SUITABLE-WITH-LIMITS | 2026-09-29 |
| Together AI | expansion | OpenAI Chat (+ embeddings, images, audio) | `/v1/models` (context_length + pricing, no pagination) | yes | json_schema, json_object | SSE | none ($5 minimum prepay); one $0 model listed | no standalone resale §4(3)(d); ZDR opt-in | SUITABLE | 2026-09-29 |
| Fireworks AI | expansion | OpenAI Chat, Anthropic Messages | `/v1/accounts/fireworks/models` (paginated; contextLength, supportsTools, SKUs) | yes | json_object, json_schema, grammar | SSE (usage in last chunk) | trial credits ($1, snippet); 10 RPM without card | internal-business use §2.1; **no credential sharing §1.2(d)**; ZDR §3.6 | SUITABLE-WITH-LIMITS | 2026-09-29 |
| DeepInfra | expansion | OpenAI Chat (+ native) | `/models/list` public (pricing, max_tokens) | yes | response_format JSON | yes | none (card or prepay required) | **no sharing credentials, no third-party availability §11(a)(viii)**; no training §7(b) | SUITABLE-WITH-LIMITS | 2026-09-29 |
| HF Inference Providers | expansion | OpenAI Chat, OpenAI Responses (beta) | `/v1/models` (per-provider pricing, context, latency) | yes (varies by provider) | json_schema, json_object (varies) | SSE / Responses events | permanent monthly credit (Free $0.10, PRO $2) | no explicit ban found; user responsible for account | SUITABLE-WITH-LIMITS | 2026-09-29 |
| Cloudflare Workers AI | expansion | OpenAI Chat (+ Responses for gpt-oss only), native `/ai/run` | `/ai/models/search` (paginated; fields unclear) | limited | JSON mode on 6 models, no streaming | yes | permanent 10,000 Neurons/day | no signing up on behalf of a third party §2.2.1(a); no training | SUITABLE-WITH-LIMITS | 2026-09-29 |
| Vercel AI Gateway | expansion | OpenAI Chat, OpenAI Responses, Anthropic Messages, OpenResponses | `/v1/models` public (context, pricing, tags) + `/endpoints` | yes | yes (all 3 APIs) | SSE (+ WS for Responses) | permanent monthly credit, subset models, card required ($5 per Academy page) | app operator responsible §8.3; Enterprise-only no-train warranty §8.4 | SUITABLE | 2026-09-29 |
| NVIDIA API catalog | expansion | OpenAI Chat | UNKNOWN | yes | UNKNOWN (hosted) | SSE | trial credits only | **trial only, no production** §1.2/§1.4 | UNSUITABLE (production) | 2026-09-29 |
| AWS Bedrock | deferred | native Converse, OpenAI Chat/Responses, Anthropic Messages (by endpoint and model) | ListFoundationModels / ListInferenceProfiles; `/models` on mantle only | yes | model-dependent (UNKNOWN) | yes | none verified | IAM-governed API keys; long-term keys "exploration only" | DEFERRED (medium-high complexity) | 2026-09-29 |
| Azure OpenAI / Foundry | deferred | OpenAI v1 (Responses, Chat) | customer deployments (no global catalog) | yes | yes (OpenAI parity) | yes | none verified | api-key or Entra ID; deployment names required | DEFERRED (medium complexity) | 2026-09-29 |
| Google Vertex AI | deferred | Gemini generateContent, OpenAI Chat (`endpoints/openapi`) | UNKNOWN | yes | yes (per OpenAI-compat page nav) | yes | express mode (quotas UNKNOWN) | OAuth/service account; API keys positioned for testing | DEFERRED (high complexity) | 2026-09-29 |
