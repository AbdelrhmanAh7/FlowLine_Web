import type { AiModelCapabilities } from "@/db/schema";

/**
 * AI provider hub — provider DEFINITIONS (what a provider is), separate from workspace CONNECTIONS (a BYOK credential),
 * ROUTES (connection + model + protocol) and POLICY (how a route is chosen).
 *
 * Rules for this file:
 * - Nothing here is invented. Base URLs, paths, hosts, auth, discovery and error semantics come from the official
 *   sources recorded in the provider research (artifacts/ai-hub/research/providers-2026-09-29.md, checked
 *   2026-09-29) and are cited in `sources`. Where the research says UNKNOWN it stays unknown (a note, never a guess).
 * - `verifiedAt` is the date the cited sources were checked for THIS entry, not a live-call certification. Live
 *   verification is recorded per connection (`ai_connection.verification = LIVE_VERIFIED`) and needs owner keys.
 * - UNSUITABLE / DEFERRED providers stay listed with their verdict and evidence, but have no base URL, hosts or
 *   protocols: nothing about them is executable and the UI shows no connection card for them.
 * - Local inference (Ollama, LM Studio, vLLM, llama.cpp) is out of scope: the web release is cloud-only. The
 *   `local-runner` transport kind is reserved as an extension point and is NOT implemented.
 */

export type ProviderTier = "core" | "expansion" | "deferred";
/** IMPLEMENTED = connectable and executable; UNSUITABLE = documented, won't be built; DEFERRED = documented, later scope. */
export type ProviderStatus = "IMPLEMENTED" | "PENDING" | "UNSUITABLE" | "DEFERRED";
/** Research verdict (terms + technical fit), recorded with its evidence. */
export type ProviderVerdict = "SUITABLE" | "SUITABLE_WITH_LIMITS" | "UNSUITABLE" | "UNSUITABLE_PENDING_OWNER_REVIEW" | "DEFERRED";
export type Protocol = "openai-chat" | "openai-responses" | "anthropic-messages" | "gemini" | "cohere-v2";
/** `local-runner` is reserved for a future local companion; no code path executes it. */
export type TransportKind = "https" | "local-runner";
export type AuthScheme = "bearer" | "x-api-key" | "x-goog-api-key" | "none";
export type DiscoveryMethod =
  | "openai-models-list"
  | "anthropic-models-list"
  | "gemini-models-list"
  | "cohere-models-list"
  | "openrouter-models-list"
  | "vercel-models-list"
  | "deepinfra-models-list"
  | "fireworks-models-list"
  | "cloudflare-models-search"
  | "static-catalogue"
  | "none";
/** direct = the model's author serves it; gateway = a router forwarding to upstream providers. */
export type RouteKind = "direct" | "gateway";

export interface ProviderSource {
  label: string;
  url: string;
}

/** A non-secret, provider-specific connection field (validated by `pattern`; never free-form into a URL). */
export interface ConnectionField {
  key: string;
  label: string;
  required: boolean;
  /** Anchored regular expression source the value must match. */
  pattern: string;
  options?: { value: string; label: string }[];
  /** When set, the value is sent as this request header (e.g. OpenAI-Organization). */
  header?: string;
  help?: string;
}

/** How a provider's free usage works (surfaced in the UI; FREE_ONLY only trusts verified zero prices). */
export interface FreeTierInfo {
  type: "none" | "permanent_zero_price" | "limited_free_tier" | "trial_credits" | "monthly_credit" | "unknown";
  note: string;
}
/** Whether the provider documents that API data is used for training (per the research). */
export interface PrivacyInfo {
  training: "no" | "yes" | "depends" | "unknown";
  note: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  tier: ProviderTier;
  status: ProviderStatus;
  verdict: ProviderVerdict;
  /** Why the verdict is what it is (quoted/paraphrased from the cited sources). */
  verdictEvidence: string;
  routeKind: RouteKind;
  transport: TransportKind;
  /** Official base URL; `{field}` placeholders are filled from validated connection fields. Null = not executable. */
  baseUrl: string | null;
  /** Exact hosts the hub may call (host or host:port, `{field}` placeholders allowed). Anything else is refused before DNS. */
  allowedHosts: string[];
  auth: AuthScheme;
  /** Fixed, non-secret headers the provider requires (e.g. anthropic-version). */
  staticHeaders?: Record<string, string>;
  /** Implemented protocols this provider is called with. */
  protocols: Protocol[];
  /** Protocol used when the connection doesn't choose one (defaults to protocols[0]). */
  defaultProtocol?: Protocol;
  /** Per-protocol path overrides (relative to baseUrl). */
  paths?: Partial<Record<Protocol, string>>;
  discovery: DiscoveryMethod;
  /** Model-list path relative to baseUrl (default "/models"), or to the origin when `discoveryFromOrigin`. */
  discoveryPath?: string;
  discoveryFromOrigin?: boolean;
  /** The listing is the provider's PUBLIC catalogue (not per-credential), so its metadata may enter ai_model. */
  listingIsPublic?: boolean;
  /**
   * Whether the model-list endpoint AUTHENTICATES the key (CXH-11), from the research record:
   * - "key-required": documented to need the key → a successful listing proves the key (no paid request);
   * - "public": documented as readable without auth (DeepInfra, Vercel) → it proves nothing about the key;
   * - "unverified": the sources conflict or don't say (OpenRouter) → treated like "public".
   * Absent = not documented = not a key check. Only "key-required" (or `keyCheckPath`) counts as a check.
   */
  listingAuth?: "key-required" | "public" | "unverified";
  /**
   * A documented authenticated, NON-billable endpoint that checks the key when the listing can't (path relative to
   * baseUrl; must answer 2xx with a JSON object). E.g. OpenRouter GET /key (key information).
   */
  keyCheckPath?: string;
  /** Name of the output-token cap in an OpenAI-Chat-compatible request. */
  maxTokensParam?: "max_completion_tokens" | "max_tokens";
  connectionFields?: ConnectionField[];
  /** Shown in the connect dialog: plan/key types the provider forbids for this use (coding plans, trial keys…). */
  planWarning?: string;
  /** The owner must confirm the key is a pay-as-you-go API key before it is saved. */
  requiresPlanAttestation?: boolean;
  /** Provider-wide documented facts (only UNSUPPORTED facts belong here; SUPPORTED comes per model). */
  capabilityFloor?: Partial<AiModelCapabilities>;
  freeTier: FreeTierInfo;
  privacy: PrivacyInfo;
  /** BYOK/terms caveats that need owner/legal review (never hidden). */
  termsNotes?: string;
  /** Official documentation and terms consulted for this entry. */
  sources: ProviderSource[];
  termsUrl: string | null;
  verifiedAt: string | null;
  /** What the owner must provide to connect (shown in the UI). */
  requirements: string[];
  /** Contract tests exist against a documented-shape double (never implies a live call happened). */
  contractVerified: boolean;
  notes?: string;
}

export const RESEARCH_RECORD = "artifacts/ai-hub/research/providers-2026-09-29.md";
const CHECKED = "2026-09-29";
const NO_EXEC = { transport: "https" as const, baseUrl: null, allowedHosts: [], auth: "bearer" as const, protocols: [], discovery: "none" as const, contractVerified: false, requirements: [] };

const PAYG_ATTESTATION = "Only pay-as-you-go API keys may be used. Coding-plan / subscription keys are restricted by the provider to its supported coding tools and must not be used for automations.";

export const PROVIDERS: ProviderDefinition[] = [
  /* ───────── core (15) ───────── */
  {
    id: "openai",
    name: "OpenAI",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE",
    verdictEvidence: "OSA §2.2 allows integrating the Services into Customer Applications; §3.3(g) forbids buying/selling/transferring keys (a customer's own key used for its own workspace is not a transfer).",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.openai.com/v1",
    allowedHosts: ["api.openai.com"],
    auth: "bearer",
    protocols: ["openai-chat", "openai-responses"],
    defaultProtocol: "openai-chat",
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_completion_tokens",
    connectionFields: [
      { key: "protocol", label: "API", required: false, pattern: "^(openai-chat|openai-responses)$", options: [{ value: "openai-chat", label: "Chat Completions" }, { value: "openai-responses", label: "Responses" }] },
      { key: "organization", label: "Organization ID (optional)", required: false, pattern: "^[A-Za-z0-9_-]{1,128}$", header: "OpenAI-Organization" },
      { key: "project", label: "Project ID (optional)", required: false, pattern: "^[A-Za-z0-9_-]{1,128}$", header: "OpenAI-Project" },
    ],
    freeTier: { type: "none", note: "No free inference tier (only omni-moderation-latest is free); billing is prepaid credits." },
    privacy: { training: "no", note: "API data is not used to train OpenAI models unless you opt in; abuse-monitoring logs up to 30 days." },
    termsNotes: "OSA §3.1: no credential sharing between users; §16.12: supported countries only (requests originate from Flowline's server region).",
    sources: [
      { label: "API reference overview (base URL, auth headers)", url: "https://developers.openai.com/api/reference/overview" },
      { label: "Responses: create", url: "https://developers.openai.com/api/reference/resources/responses/methods/create" },
      { label: "Chat Completions: create", url: "https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create" },
      { label: "Models: list", url: "https://developers.openai.com/api/reference/resources/models/methods/list" },
      { label: "Error codes", url: "https://developers.openai.com/api/docs/guides/error-codes" },
      { label: "Pricing", url: "https://developers.openai.com/api/docs/pricing" },
      { label: "Your data", url: "https://developers.openai.com/api/docs/guides/your-data" },
    ],
    termsUrl: "https://cdn.openai.com/osa/openai-services-agreement.pdf",
    verifiedAt: CHECKED,
    requirements: ["An OpenAI API key (platform.openai.com → API keys)", "Optional: organization / project IDs"],
    contractVerified: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE",
    verdictEvidence: "Commercial Terms §A.1 permits powering products for the customer's own users; API (Console) keys only — never claude.ai Free/Pro/Max credentials.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.anthropic.com",
    allowedHosts: ["api.anthropic.com"],
    auth: "x-api-key",
    staticHeaders: { "anthropic-version": "2023-06-01" },
    // Native Messages only: the OpenAI-compatible layer is documented as test-only and ignores response_format/strict.
    protocols: ["anthropic-messages"],
    discovery: "anthropic-models-list",
    listingAuth: "key-required",
    discoveryPath: "/v1/models",
    listingIsPublic: true,
    connectionFields: [{ key: "workspaceId", label: "Anthropic workspace ID (only for keys spanning several workspaces)", required: false, pattern: "^[A-Za-z0-9_-]{1,128}$", header: "anthropic-workspace-id" }],
    planWarning: "Use an API key from the Claude Console. Claude.ai Free/Pro/Max logins or session tokens are not accepted (Anthropic forbids routing them through third parties).",
    freeTier: { type: "trial_credits", note: "New users receive a small amount of free credits to test the API; no permanent free tier." },
    privacy: { training: "no", note: "Commercial Terms §B: Anthropic may not train models on Customer Content from Services." },
    termsNotes: "§D.4: no resale except as expressly approved.",
    sources: [
      { label: "Models list (pagination, capabilities)", url: "https://platform.claude.com/docs/en/api/models-list" },
      { label: "Errors (529, 402, spend limits, mid-stream error events)", url: "https://platform.claude.com/docs/en/api/errors" },
      { label: "Rate limits", url: "https://platform.claude.com/docs/en/api/rate-limits" },
      { label: "Pricing", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
      { label: "OpenAI SDK compatibility (test-only)", url: "https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk" },
    ],
    termsUrl: "https://www.anthropic.com/legal/commercial-terms",
    verifiedAt: CHECKED,
    requirements: ["An Anthropic API key from the Claude Console"],
    contractVerified: true,
  },
  {
    id: "gemini",
    name: "Google Gemini API",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Suitable, but free-tier keys carry training/human-review terms, and only Paid Services may serve users in the EEA, Switzerland or the UK (Gemini API Additional Terms).",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    allowedHosts: ["generativelanguage.googleapis.com"],
    // Header auth keeps the key out of URLs and logs (the `key=` query form is never used).
    auth: "x-goog-api-key",
    protocols: ["gemini"],
    discovery: "gemini-models-list",
    listingAuth: "key-required",
    listingIsPublic: true,
    planWarning: "Free-tier Gemini keys: your prompts and outputs may be used to improve Google products and read by human reviewers. Use a paid key for users in the EEA, Switzerland or the UK.",
    freeTier: { type: "limited_free_tier", note: "Many models are free of charge on the Free tier with low per-project RPM/RPD limits; Flowline can't tell a free key from a paid key." },
    privacy: { training: "depends", note: "Free tier: content used to improve products and may be human-reviewed. Paid tier: not used." },
    sources: [
      { label: "generateContent / streamGenerateContent", url: "https://ai.google.dev/api/generate-content" },
      { label: "Models (pageToken pagination)", url: "https://ai.google.dev/api/models" },
      { label: "API errors (402 payment_required, 429 quota vs rate)", url: "https://ai.google.dev/gemini-api/docs/api-errors" },
      { label: "Rate limits", url: "https://ai.google.dev/gemini-api/docs/rate-limits" },
      { label: "Pricing", url: "https://ai.google.dev/gemini-api/docs/pricing" },
    ],
    termsUrl: "https://ai.google.dev/gemini-api/terms",
    verifiedAt: CHECKED,
    requirements: ["A Gemini API key (Google AI Studio)"],
    contractVerified: true,
  },
  {
    id: "xai",
    name: "xAI",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Responses is primary (Chat Completions is legacy). Terms and country eligibility were only readable via search excerpts (x.ai/legal returned 403): flagged for legal review.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.x.ai/v1",
    allowedHosts: ["api.x.ai"],
    auth: "bearer",
    protocols: ["openai-responses", "openai-chat"],
    defaultProtocol: "openai-responses",
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    connectionFields: [{ key: "protocol", label: "API", required: false, pattern: "^(openai-chat|openai-responses)$", options: [{ value: "openai-responses", label: "Responses (primary)" }, { value: "openai-chat", label: "Chat Completions (legacy)" }] }],
    freeTier: { type: "none", note: "No API free tier or free credits are mentioned on the pricing page." },
    privacy: { training: "unknown", note: "Data/training terms UNKNOWN (legal pages not readable on 2026-09-29)." },
    termsNotes: "Enterprise ToS (search excerpts): End Users only via a Bundled Service; full text unverified.",
    sources: [
      { label: "Responses reference (usage, cost_in_usd_ticks / cost_in_nano_usd)", url: "https://docs.x.ai/developers/rest-api-reference/inference/responses" },
      { label: "Models (per key) + language-models", url: "https://docs.x.ai/developers/rest-api-reference/inference/models" },
      { label: "Legacy Chat Completions", url: "https://docs.x.ai/developers/model-capabilities/legacy/chat-completions" },
      { label: "Debugging (errors)", url: "https://docs.x.ai/developers/debugging" },
      { label: "Pricing", url: "https://docs.x.ai/developers/pricing" },
    ],
    termsUrl: "https://x.ai/legal/terms-of-service-enterprise",
    verifiedAt: CHECKED,
    requirements: ["An xAI API key (team-bound)"],
    contractVerified: true,
  },
  {
    id: "groq",
    name: "Groq",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Services Agreement §3.1 allows Customer Applications for End Users; free plan has tight org quotas; Preview models may be discontinued at short notice.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.groq.com/openai/v1",
    allowedHosts: ["api.groq.com"],
    auth: "bearer",
    protocols: ["openai-chat", "openai-responses"],
    defaultProtocol: "openai-chat",
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    connectionFields: [{ key: "protocol", label: "API", required: false, pattern: "^(openai-chat|openai-responses)$", options: [{ value: "openai-chat", label: "Chat Completions" }, { value: "openai-responses", label: "Responses" }] }],
    freeTier: { type: "limited_free_tier", note: "Free plan with limited org-level quota; Developer plan for higher limits." },
    privacy: { training: "no", note: "Services Agreement §4.2: Groq may not use Inputs or Outputs for training unless permitted." },
    sources: [
      { label: "API reference", url: "https://console.groq.com/docs/api-reference" },
      { label: "Errors (498 flex capacity, 499 cancelled)", url: "https://console.groq.com/docs/errors" },
      { label: "Rate limits (retry-after)", url: "https://console.groq.com/docs/rate-limits" },
      { label: "Models (production vs preview)", url: "https://console.groq.com/docs/models" },
      { label: "Your data", url: "https://console.groq.com/docs/your-data" },
    ],
    termsUrl: "https://console.groq.com/docs/legal/services-agreement",
    verifiedAt: CHECKED,
    requirements: ["A GroqCloud API key"],
    contractVerified: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "ToS §7(4) forbids reselling API access (a customer's own key inside Flowline is fine). Upstream model terms vary (§6.1); privacy routing controls are not documented in the research, so privacy-restricted policies refuse OpenRouter routes.",
    routeKind: "gateway",
    transport: "https",
    baseUrl: "https://openrouter.ai/api/v1",
    allowedHosts: ["openrouter.ai"],
    auth: "bearer",
    // Chat Completions is the canonical endpoint (per-family parity of /responses and /messages is unverified).
    protocols: ["openai-chat"],
    discovery: "openrouter-models-list",
    // research §6 OpenRouter: lists the whole catalogue (not per key); whether it needs auth is UNKNOWN.
    listingAuth: "unverified",
    // research §6 OpenRouter: "GET /api/v1/key returns remaining credit and free-model daily requests" (authenticated).
    keyCheckPath: "/key",
    listingIsPublic: true,
    maxTokensParam: "max_tokens",
    planWarning: "`:free` model variants are zero-priced but limited (20 req/min; 50 req/day under $10 of lifetime credits). Upstream providers' data terms apply per model.",
    freeTier: { type: "limited_free_tier", note: "Zero-priced `:free` variants with request quotas; availability can change." },
    privacy: { training: "depends", note: "ToS §6.1: some models may store or train on inputs per their model terms." },
    sources: [
      { label: "API overview (chat, responses, messages)", url: "https://openrouter.ai/docs/api/reference/overview" },
      { label: "Models (pricing, supported_parameters)", url: "https://openrouter.ai/docs/api/api-reference/models/get-models" },
      { label: "Errors and debugging (402, 503 routing, mid-stream errors)", url: "https://openrouter.ai/docs/api/reference/errors-and-debugging" },
      { label: "Limits", url: "https://openrouter.ai/docs/api/reference/limits" },
    ],
    termsUrl: "https://openrouter.ai/terms",
    verifiedAt: CHECKED,
    requirements: ["An OpenRouter API key"],
    contractVerified: true,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Commercial ToS (search excerpts): no buy/sell/transfer of keys; flagged for legal review. Free mode may train on data; its quota 429 lasts until the billing cycle ends.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.mistral.ai/v1",
    allowedHosts: ["api.mistral.ai"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    planWarning: "Free-mode keys: Mistral may use your inputs and outputs to train its models (pay-as-you-go can opt out).",
    freeTier: { type: "limited_free_tier", note: "Free mode with included monthly usage within limits." },
    privacy: { training: "depends", note: "Free mode may train on data (Help Center); pay-as-you-go can opt out." },
    sources: [
      { label: "API", url: "https://docs.mistral.ai/api" },
      { label: "Models endpoint", url: "https://docs.mistral.ai/api/endpoint/models" },
      { label: "Error glossary", url: "https://docs.mistral.ai/resources/error-glossary" },
      { label: "Tiers / usage limits", url: "https://docs.mistral.ai/admin/user-management-finops/tier" },
      { label: "Pricing", url: "https://mistral.ai/pricing/api/" },
      { label: "Free mode data use", url: "https://help.mistral.ai/en/articles/347617" },
    ],
    termsUrl: "https://legal.mistral.ai/terms/commercial-terms-of-service/",
    verifiedAt: CHECKED,
    requirements: ["A Mistral API key"],
    contractVerified: true,
  },
  {
    id: "cohere",
    name: "Cohere",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Weakest of the core set: SaaS §4(a)(i) says Access Credentials are not shared with third parties without Cohere's consent (needs legal review); trial keys are not permitted for production or commercial use.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.cohere.com",
    allowedHosts: ["api.cohere.com"],
    auth: "bearer",
    protocols: ["cohere-v2"],
    discovery: "cohere-models-list",
    listingAuth: "key-required",
    discoveryPath: "/v1/models",
    planWarning: "Trial keys are free but \"not permitted to be used for production or commercial purposes\" — use a production key. Switch off Data Controls if you don't want prompts used for training.",
    freeTier: { type: "trial_credits", note: "Trial keys: 1,000 calls/month, rate-limited, non-commercial only." },
    privacy: { training: "depends", note: "SaaS §3(a) grants broad data use; Enterprise Data Commitments offer a dashboard opt-out." },
    termsNotes: "SaaS §2(d): access only for Permitted Users; §4(a)(i) credential-sharing clause.",
    sources: [
      { label: "Chat v2", url: "https://docs.cohere.com/reference/chat" },
      { label: "List models (page_token)", url: "https://docs.cohere.com/reference/list-models" },
      { label: "Errors (402 billing, 499 cancelled)", url: "https://docs.cohere.com/reference/errors" },
      { label: "Rate limits (trial keys)", url: "https://docs.cohere.com/docs/rate-limits" },
    ],
    termsUrl: "https://cohere.com/saas-agreement",
    verifiedAt: CHECKED,
    requirements: ["A Cohere production API key"],
    contractVerified: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "ToS §1.1 allows downstream apps for end users; §2.2 says not to share the API key (disclosed: the key is stored server-side by Flowline). Balance errors are 402; json_object only.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.deepseek.com",
    allowedHosts: ["api.deepseek.com"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    capabilityFloor: { structuredOutput: "UNSUPPORTED" },
    planWarning: "DeepSeek's terms (§2.2) ask you not to share your API key: Flowline stores it encrypted, server-side, and uses it only for this workspace.",
    freeTier: { type: "none", note: "No free tier; a granted balance may exist (terms UNKNOWN). Off-peak prices are half of peak." },
    privacy: { training: "unknown", note: "The Open Platform ToS has no explicit clause on DeepSeek's use of API data." },
    sources: [
      { label: "API docs", url: "https://api-docs.deepseek.com/" },
      { label: "Create chat completion", url: "https://api-docs.deepseek.com/api/create-chat-completion" },
      { label: "List models", url: "https://api-docs.deepseek.com/api/list-models" },
      { label: "Error codes (402 insufficient balance)", url: "https://api-docs.deepseek.com/quick_start/error_codes" },
      { label: "Pricing", url: "https://api-docs.deepseek.com/quick_start/pricing" },
    ],
    termsUrl: "https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html",
    verifiedAt: CHECKED,
    requirements: ["A DeepSeek API key (platform.deepseek.com/api_keys)"],
    contractVerified: true,
  },
  {
    id: "zai",
    name: "Z.ai (GLM)",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "General pay-as-you-go API is permitted (Terms §III.9). GLM Coding Plan keys are restricted to supported coding tools (usage policy) and are refused (codes 1309/1315).",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.z.ai/api/paas/v4",
    allowedHosts: ["api.z.ai"],
    auth: "bearer",
    protocols: ["openai-chat"],
    // No list-models endpoint is documented: a static, versioned catalogue with provenance is used.
    discovery: "static-catalogue",
    maxTokensParam: "max_tokens",
    capabilityFloor: { structuredOutput: "UNSUPPORTED" },
    planWarning: `GLM Coding Plan keys are not accepted (Z.ai limits them to supported coding tools). ${PAYG_ATTESTATION}`,
    requiresPlanAttestation: true,
    freeTier: { type: "permanent_zero_price", note: "GLM-4.7-Flash, GLM-4.5-Flash and GLM-4.6V-Flash are listed as \"Free\"; quota and durability are not stated." },
    privacy: { training: "no", note: "Additional Terms §3(b): API End User Content is not used to improve Services unless the customer agrees." },
    sources: [
      { label: "API introduction (base URL)", url: "https://docs.z.ai/api-reference/introduction" },
      { label: "Chat completion", url: "https://docs.z.ai/api-reference/llm/chat-completion.md" },
      { label: "Error codes (1113 balance, 1211 model, 1309/1315 coding plan)", url: "https://docs.z.ai/api-reference/api-code.md" },
      { label: "Pricing", url: "https://docs.z.ai/guides/overview/pricing" },
      { label: "Coding Plan usage policy", url: "https://docs.z.ai/devpack/usage-policy.md" },
    ],
    termsUrl: "https://docs.z.ai/legal-agreement/terms-of-use.md",
    verifiedAt: CHECKED,
    requirements: ["A Z.ai pay-as-you-go API key (not a GLM Coding Plan key)"],
    contractVerified: true,
  },
  {
    id: "moonshot",
    name: "Moonshot AI (Kimi)",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Technically the best fit, but §3.2(6) forbids transferring API keys \"to or with a third party\" (strongest BYOK wording; needs owner/legal sign-off) and training is not excluded by default. Kimi Code keys are coding-only and refused.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.moonshot.ai/v1",
    allowedHosts: ["api.moonshot.ai"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    planWarning: `Kimi Code membership keys are not accepted (coding tools only). Keys only work on the platform that issued them (.ai, not .cn). ${PAYG_ATTESTATION}`,
    requiresPlanAttestation: true,
    freeTier: { type: "trial_credits", note: "No free tier; a $5 voucher after $5 of cumulative recharge. Tier 0 limits are tiny (3 RPM)." },
    privacy: { training: "yes", note: "Content may be used to improve the Services unless an enterprise agreement says otherwise." },
    termsNotes: "§3.2(6): no buying, selling or transferring API keys to or with a third party.",
    sources: [
      { label: "Chat API", url: "https://platform.kimi.ai/docs/api/chat" },
      { label: "List models", url: "https://platform.kimi.ai/docs/api/list-models.md" },
      { label: "Errors (exceeded_current_quota_error, Retry-After)", url: "https://platform.kimi.ai/docs/api/errors.md" },
      { label: "Pricing", url: "https://platform.kimi.ai/docs/pricing/chat.md" },
      { label: "Limits", url: "https://platform.kimi.ai/docs/pricing/limits" },
    ],
    termsUrl: "https://platform.kimi.ai/docs/agreement/modeluse.md",
    verifiedAt: CHECKED,
    requirements: ["A Moonshot (platform.kimi.ai) pay-as-you-go API key"],
    contractVerified: true,
  },
  {
    id: "minimax",
    name: "MiniMax",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Provisional: pay-as-you-go ToS could not be read (script-rendered). Token Plan subscription keys are for coding tools only and not interchangeable with API keys.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.minimax.io/v1",
    allowedHosts: ["api.minimax.io"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    // json_schema is documented only for the legacy MiniMax-Text-01; treat as unsupported for current models.
    capabilityFloor: { structuredOutput: "UNSUPPORTED" },
    planWarning: `MiniMax Token Plan subscription keys are not accepted (coding tools only). ${PAYG_ATTESTATION}`,
    requiresPlanAttestation: true,
    freeTier: { type: "none", note: "No free LLM tier or trial credits are documented." },
    privacy: { training: "unknown", note: "Platform terms were not readable (script-rendered)." },
    sources: [
      { label: "OpenAI-compatible chat", url: "https://platform.minimax.io/docs/api-reference/text-chat-openai.md" },
      { label: "List models", url: "https://platform.minimax.io/docs/api-reference/models/openai/list-models.md" },
      { label: "Error codes (base_resp 1008 balance)", url: "https://platform.minimax.io/docs/api-reference/errorcode.md" },
      { label: "Pay-as-you-go pricing", url: "https://platform.minimax.io/docs/guides/pricing-paygo.md" },
      { label: "Token Plan", url: "https://platform.minimax.io/docs/token-plan/intro.md" },
    ],
    termsUrl: null,
    verifiedAt: CHECKED,
    requirements: ["A MiniMax (minimax.io) pay-as-you-go API key"],
    contractVerified: true,
  },
  {
    id: "dashscope",
    name: "Alibaba Cloud Model Studio",
    tier: "core",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Uses the recommended workspace-dedicated domains (the legacy dashscope-intl domain gets no new features after 2026-09-30). Coding/Token Plan keys are for interactive coding tools only and refused. Pay-as-you-go product terms were not reviewed.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://{workspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1",
    allowedHosts: ["{workspaceId}.{region}.maas.aliyuncs.com"],
    auth: "bearer",
    protocols: ["openai-chat"],
    // No documented list endpoint (the Anthropic path says it has none): static, versioned catalogue.
    discovery: "static-catalogue",
    maxTokensParam: "max_tokens",
    connectionFields: [
      {
        key: "region",
        label: "Region",
        required: true,
        pattern: "^(ap-southeast-1|cn-beijing)$",
        options: [
          { value: "ap-southeast-1", label: "Singapore (International)" },
          { value: "cn-beijing", label: "Beijing (Chinese Mainland)" },
        ],
        help: "A key is bound to the region it was created in. Other regions' codes are not documented in the research and are not offered yet.",
      },
      { key: "workspaceId", label: "Workspace ID", required: true, pattern: "^[A-Za-z0-9-]{1,64}$", help: "From Model Studio → workspace settings." },
    ],
    planWarning: `Alibaba Coding Plan / Token Plan keys are not accepted (interactive coding tools only, no application backends). ${PAYG_ATTESTATION}`,
    requiresPlanAttestation: true,
    freeTier: { type: "trial_credits", note: "Limited trial quota (~1M tokens per model for 90 days, Singapore only)." },
    privacy: { training: "no", note: "Does not use customer business data to improve models without explicit consent (privacy/FAQ excerpts)." },
    sources: [
      { label: "Base URL / workspace domains", url: "https://www.alibabacloud.com/help/en/model-studio/base-url" },
      { label: "Regions (legacy domain frozen 2026-09-30)", url: "https://www.alibabacloud.com/help/en/model-studio/regions" },
      { label: "OpenAI compatibility", url: "https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope" },
      { label: "Error codes (Arrearage, DataInspectionFailed)", url: "https://www.alibabacloud.com/help/en/model-studio/error-code" },
      { label: "Model pricing", url: "https://www.alibabacloud.com/help/en/model-studio/model-pricing" },
    ],
    termsUrl: null,
    verifiedAt: CHECKED,
    requirements: ["A Model Studio API key (sk-…)", "Region", "Workspace ID"],
    contractVerified: true,
  },
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    tier: "core",
    status: "UNSUITABLE",
    verdict: "UNSUITABLE",
    verdictEvidence:
      "OpenCode ToS (effective 2026-08-15): \"You will only use the Services for your own internal use, and not on behalf of or for the benefit of any third party\" — Zen is named as a Service. Discovery has no metadata and errors are undocumented.",
    routeKind: "gateway",
    ...NO_EXEC,
    freeTier: { type: "limited_free_tier", note: "Promotional zero-priced models; some may use data to improve models." },
    privacy: { training: "depends", note: "Free models may train on data; paid models zero-retention except OpenAI/Anthropic (30 days)." },
    sources: [
      { label: "Zen docs (per-family endpoints)", url: "https://opencode.ai/docs/zen/" },
      { label: "Terms of service", url: "https://opencode.ai/legal/terms-of-service" },
    ],
    termsUrl: "https://opencode.ai/legal/terms-of-service",
    verifiedAt: CHECKED,
    notes: "Documented base https://opencode.ai/zen/v1 (Responses for OpenAI models, Messages for Anthropic, Google-style for Gemini, Chat for open models). Not built: terms forbid use for third parties. OpenCode Go is also unsuitable (coding-agent traffic only).",
  },
  {
    id: "command-code",
    name: "Command Code Provider API",
    tier: "core",
    status: "UNSUITABLE",
    verdict: "UNSUITABLE_PENDING_OWNER_REVIEW",
    verdictEvidence:
      "Terms (updated 2026-09-20) prohibit sublicensing/transferring access and \"automated requests\"; payments \"within the United States\"; three conflicting statements on which plans include API access. Technically clean (Chat, Responses, Messages, /models with supported_endpoints). Not offered until the owner/legal review decides.",
    routeKind: "gateway",
    ...NO_EXEC,
    freeTier: { type: "limited_free_tier", note: "Promotional 100%-off models; Provider plan $15/month." },
    privacy: { training: "no", note: "\"We never train on your data or sell it\"; ZDR via x-cmd-zdr." },
    sources: [
      { label: "Provider API docs", url: "https://commandcode.ai/docs/provider" },
      { label: "Pricing and limits", url: "https://commandcode.ai/docs/resources/pricing-limits" },
      { label: "Announcement", url: "https://commandcode.ai/blog/command-code-provider-api" },
      { label: "Terms", url: "https://commandcode.ai/terms" },
    ],
    termsUrl: "https://commandcode.ai/terms",
    verifiedAt: CHECKED,
    notes: "Documented base https://api.commandcode.ai/provider/v1. Handle 403 upgrade_required if it is ever offered.",
  },

  /* ───────── expansion (8) ───────── */
  {
    id: "cerebras",
    name: "Cerebras",
    tier: "expansion",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "Clean OpenAI Chat Completions match. Terms (search snippet, page script-rendered): no buying/selling/transferring keys — needs legal confirmation. $5 trial credits expire after 30 days.",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.cerebras.ai/v1",
    allowedHosts: ["api.cerebras.ai"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    freeTier: { type: "trial_credits", note: "$5 in free credits that expire 30 days after they're granted; no renewing no-cost tier." },
    privacy: { training: "unknown", note: "Retention/training terms UNKNOWN (ToS page script-rendered)." },
    sources: [
      { label: "Chat completions", url: "https://inference-docs.cerebras.ai/api-reference/chat-completions" },
      { label: "Models", url: "https://inference-docs.cerebras.ai/api-reference/models" },
      { label: "Errors", url: "https://inference-docs.cerebras.ai/support/error" },
      { label: "Rate limits / trial", url: "https://inference-docs.cerebras.ai/support/rate-limits" },
    ],
    termsUrl: "https://cloud.cerebras.ai/terms",
    verifiedAt: CHECKED,
    requirements: ["A Cerebras API key"],
    contractVerified: true,
  },
  {
    id: "together",
    name: "Together AI",
    tier: "expansion",
    status: "IMPLEMENTED",
    verdict: "SUITABLE",
    verdictEvidence: "ToS §4(3)(d) forbids offering the Services on a standalone basis; embedding in a product is permitted. 403 means context overflow (not permissions).",
    routeKind: "gateway",
    transport: "https",
    baseUrl: "https://api.together.ai/v1",
    allowedHosts: ["api.together.ai"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    planWarning: "By default Together stores prompts and responses and may use them for product improvement; enable Zero Data Retention in your Together settings.",
    freeTier: { type: "none", note: "No free trial ($5 minimum prepay); one model listed at $0.00 (durability UNKNOWN)." },
    privacy: { training: "depends", note: "Stored by default and may be used for product improvements; ZDR available; training share is opt-in." },
    sources: [
      { label: "Chat completions", url: "https://docs.together.ai/reference/chat-completions-1" },
      { label: "Models (context_length, pricing)", url: "https://docs.together.ai/reference/models-1" },
      { label: "Error codes (402 spend limit, 403 context)", url: "https://docs.together.ai/docs/error-codes" },
      { label: "OpenAI compatibility", url: "https://docs.together.ai/docs/openai-api-compatibility" },
    ],
    termsUrl: "https://www.together.ai/terms-of-service",
    verifiedAt: CHECKED,
    requirements: ["A Together AI API key"],
    contractVerified: true,
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    tier: "expansion",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "ToS §1.2(d) \"you will not share … authentication credentials with anyone else\" is a direct BYOK question (written clarification advised); §2.1 personal or internal business use.",
    routeKind: "gateway",
    transport: "https",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    allowedHosts: ["api.fireworks.ai"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "fireworks-models-list",
    listingAuth: "key-required",
    discoveryPath: "/v1/accounts/fireworks/models",
    discoveryFromOrigin: true,
    maxTokensParam: "max_tokens",
    freeTier: { type: "trial_credits", note: "$1 of credits for new accounts (search snippet); 10 RPM without a payment method." },
    privacy: { training: "no", note: "ToS §3.6: will not use your Content to train models (not covering Response API / training features)." },
    termsNotes: "§1.2(d) no credential sharing; §2.2(d) no transferring keys.",
    sources: [
      { label: "OpenAI compatibility (context_length_exceeded_behavior)", url: "https://docs.fireworks.ai/tools-sdks/openai-compatibility" },
      { label: "Chat completions", url: "https://docs.fireworks.ai/api-reference/post-chatcompletions" },
      { label: "List models", url: "https://docs.fireworks.ai/api-reference/list-models" },
    ],
    termsUrl: "https://fireworks.ai/terms-of-service",
    verifiedAt: CHECKED,
    requirements: ["A Fireworks API key"],
    contractVerified: true,
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    tier: "expansion",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "ToS §11(a)(viii) forbids sharing account or access credentials (needs legal sign-off); no free tier (card or prepay required). No training on Customer Data (§7(b)).",
    routeKind: "gateway",
    transport: "https",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    allowedHosts: ["api.deepinfra.com"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "deepinfra-models-list",
    // research §4 DeepInfra: "GET /models/list is public, with no auth".
    listingAuth: "public",
    discoveryPath: "/models/list",
    discoveryFromOrigin: true,
    maxTokensParam: "max_tokens",
    freeTier: { type: "none", note: "\"You have to add a card or pre-pay\"." },
    privacy: { training: "no", note: "ToS §7(b): Customer Data is not used to train or improve any model; zero data retention." },
    termsNotes: "§11(a)(viii): no sharing of access credentials.",
    sources: [
      { label: "Chat overview", url: "https://docs.deepinfra.com/chat/overview" },
      { label: "Models list (public)", url: "https://docs.deepinfra.com/api-reference/models/models-list" },
      { label: "Rate limits (concurrency)", url: "https://docs.deepinfra.com/account/rate-limits" },
    ],
    termsUrl: "https://deepinfra.com/terms",
    verifiedAt: CHECKED,
    requirements: ["A DeepInfra API key"],
    contractVerified: true,
    notes: "The public model list also contains non-chat models (its type values are not documented in the research); chat calls to them fail with the provider's error.",
  },
  {
    id: "huggingface",
    name: "Hugging Face Inference Providers",
    tier: "expansion",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "No explicit BYOK prohibition found; feature support varies by routed provider; error/retry contract undocumented; Responses is beta.",
    routeKind: "gateway",
    transport: "https",
    baseUrl: "https://router.huggingface.co/v1",
    allowedHosts: ["router.huggingface.co"],
    auth: "bearer",
    protocols: ["openai-chat", "openai-responses"],
    defaultProtocol: "openai-chat",
    discovery: "openai-models-list",
    listingAuth: "key-required",
    maxTokensParam: "max_tokens",
    connectionFields: [
      { key: "protocol", label: "API", required: false, pattern: "^(openai-chat|openai-responses)$", options: [{ value: "openai-chat", label: "Chat Completions" }, { value: "openai-responses", label: "Responses (beta)" }] },
      { key: "billTo", label: "Bill to organization (optional)", required: false, pattern: "^[A-Za-z0-9_.-]{1,96}$", header: "X-HF-Bill-To" },
    ],
    planWarning: "Use a fine-grained token with the \"Make calls to Inference Providers\" permission.",
    freeTier: { type: "monthly_credit", note: "Monthly credits: Free $0.10, PRO $2.00 (subject to change)." },
    privacy: { training: "unknown", note: "Router data terms UNKNOWN; provider data policies apply." },
    sources: [
      { label: "Inference Providers (routing, /v1/models)", url: "https://huggingface.co/docs/inference-providers/index" },
      { label: "Chat completion task (auth)", url: "https://huggingface.co/docs/inference-providers/tasks/chat-completion" },
      { label: "Responses API (beta)", url: "https://huggingface.co/docs/inference-providers/en/guides/responses-api" },
      { label: "Pricing", url: "https://huggingface.co/docs/inference-providers/pricing" },
    ],
    termsUrl: "https://huggingface.co/terms-of-service",
    verifiedAt: CHECKED,
    requirements: ["A Hugging Face fine-grained token (Inference Providers permission)"],
    contractVerified: true,
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    tier: "expansion",
    status: "IMPLEMENTED",
    verdict: "SUITABLE_WITH_LIMITS",
    verdictEvidence: "No training on Customer Content. §2.2.1(a): no signing up on behalf of a third party — the customer must own the Cloudflare account. JSON mode on few models and not while streaming.",
    routeKind: "gateway",
    transport: "https",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1",
    allowedHosts: ["api.cloudflare.com"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "cloudflare-models-search",
    listingAuth: "key-required",
    discoveryPath: "/client/v4/accounts/{accountId}/ai/models/search",
    discoveryFromOrigin: true,
    maxTokensParam: "max_tokens",
    connectionFields: [{ key: "accountId", label: "Account ID", required: true, pattern: "^[A-Za-z0-9]{1,64}$", help: "Cloudflare dashboard → Workers AI → account ID. The API token needs Workers AI Read + Edit." }],
    freeTier: { type: "limited_free_tier", note: "10,000 Neurons per day at no charge on Free and Paid plans (reset 00:00 UTC); beyond it is billed — not confirmable per request." },
    privacy: { training: "no", note: "Cloudflare does not use your Customer Content to train AI models on Workers AI." },
    sources: [
      { label: "OpenAI compatibility", url: "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/" },
      { label: "REST API (account ID + token)", url: "https://developers.cloudflare.com/workers-ai/get-started/rest-api/" },
      { label: "Models search", url: "https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/" },
      { label: "JSON mode", url: "https://developers.cloudflare.com/workers-ai/features/json-mode/" },
      { label: "Pricing", url: "https://developers.cloudflare.com/workers-ai/platform/pricing/" },
      { label: "Data usage", url: "https://developers.cloudflare.com/workers-ai/platform/data-usage/" },
    ],
    termsUrl: "https://www.cloudflare.com/terms/",
    verifiedAt: CHECKED,
    requirements: ["A Cloudflare API token (Workers AI Read + Edit)", "Account ID"],
    contractVerified: true,
    notes: "Model-search field names are not detailed in the research: model ids are read from result[].name (live verification pending).",
  },
  {
    id: "vercel-gateway",
    name: "Vercel AI Gateway",
    tier: "expansion",
    status: "IMPLEMENTED",
    verdict: "SUITABLE",
    verdictEvidence: "AI Product Terms §8.3 contemplate customer-facing apps; no markup; documented errors and retry-after. Contractual no-training warranty is Enterprise-only (§8.4); Stealth models may be trained on (§8.2).",
    routeKind: "gateway",
    transport: "https",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    allowedHosts: ["ai-gateway.vercel.sh"],
    auth: "bearer",
    protocols: ["openai-chat"],
    discovery: "vercel-models-list",
    // research §7 Vercel: "GET /v1/models needs no auth".
    listingAuth: "public",
    listingIsPublic: true,
    maxTokensParam: "max_tokens",
    planWarning: "Free monthly credit covers a subset of models and needs a payment method on file; Stealth models may be trained on by their providers.",
    freeTier: { type: "monthly_credit", note: "Monthly included credit on a subset of models; buying credits ends it." },
    privacy: { training: "depends", note: "FAQ: no training on prompts; contractual warranty only for Enterprise (§8.4); Stealth models excepted." },
    sources: [
      { label: "OpenAI Chat Completions", url: "https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions" },
      { label: "REST API (/v1/models, pricing)", url: "https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api" },
      { label: "FAQ (errors)", url: "https://vercel.com/docs/ai-gateway/faq" },
      { label: "Rate limits (retry-after)", url: "https://vercel.com/docs/ai-gateway/rate-limits" },
      { label: "Pricing", url: "https://vercel.com/docs/ai-gateway/pricing" },
    ],
    termsUrl: "https://vercel.com/legal/ai-product-terms",
    verifiedAt: CHECKED,
    requirements: ["A Vercel AI Gateway API key"],
    contractVerified: true,
  },
  {
    id: "nvidia",
    name: "NVIDIA API catalog (build.nvidia.com)",
    tier: "expansion",
    status: "UNSUITABLE",
    verdict: "UNSUITABLE",
    verdictEvidence:
      "NVIDIA API Trial Terms §1.2: \"limited trial purposes only and without use of the API Service or Generated Content in production\"; §1.4: \"internal testing and evaluation purposes, not in production\". Running customer workflows is production use.",
    routeKind: "gateway",
    ...NO_EXEC,
    freeTier: { type: "trial_credits", note: "Trial credits only; production needs a Subscription." },
    privacy: { training: "no", note: "§2.3: content not stored or used after each session (security logging excepted)." },
    sources: [
      { label: "LLM APIs", url: "https://docs.api.nvidia.com/nim/reference/llm-apis" },
      { label: "API Trial Terms of Service", url: "https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf" },
    ],
    termsUrl: "https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf",
    verifiedAt: CHECKED,
    notes: "Documented endpoint https://integrate.api.nvidia.com/v1/chat/completions (OpenAI Chat). Not built: trial terms forbid production use.",
  },

  /* ───────── deferred enterprise clouds (3): documented, not built ───────── */
  {
    id: "bedrock",
    name: "Amazon Bedrock",
    tier: "deferred",
    status: "DEFERRED",
    verdict: "DEFERRED",
    verdictEvidence: "Medium-high complexity: per-region endpoints, SigV4 (access key + secret) or Bedrock API keys (short-term keys expire within 12 h; long-term keys are \"for exploration only\"), per-region model availability matrix.",
    routeKind: "gateway",
    ...NO_EXEC,
    freeTier: { type: "unknown", note: "None verified." },
    privacy: { training: "unknown", note: "Not reviewed (deferred)." },
    sources: [
      { label: "Bedrock API keys", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html" },
      { label: "OpenAI Chat Completions on Bedrock", url: "https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html" },
    ],
    termsUrl: null,
    verifiedAt: CHECKED,
    notes: "Requirements to build: region + key type choice, bedrock-runtime /openai/v1/chat/completions (no /models) or bedrock-mantle (/models), ListFoundationModels/ListInferenceProfiles discovery, cross-region inference profile ids.",
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI / Microsoft Foundry",
    tier: "deferred",
    status: "DEFERRED",
    verdict: "DEFERRED",
    verdictEvidence: "Medium complexity: per-resource endpoints (https://{resource}.openai.azure.com/openai/v1/), `api-key` header, model = the customer's deployment name; no global catalogue (the model list is the customer's deployments). Entra ID is impractical for BYOK.",
    routeKind: "gateway",
    ...NO_EXEC,
    freeTier: { type: "unknown", note: "None verified." },
    privacy: { training: "unknown", note: "Not reviewed (deferred)." },
    sources: [{ label: "API version lifecycle (v1 GA)", url: "https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle" }],
    termsUrl: null,
    verifiedAt: CHECKED,
    notes: "Requirements to build: resource name + api-key + deployment names; a custom-endpoint host allowlist per resource.",
  },
  {
    id: "vertex",
    name: "Google Vertex AI",
    tier: "deferred",
    status: "DEFERRED",
    verdict: "DEFERRED",
    verdictEvidence: "High complexity: project + location + service-account JSON or OAuth tokens that must be refreshed; express-mode API keys are positioned for testing.",
    routeKind: "gateway",
    ...NO_EXEC,
    freeTier: { type: "unknown", note: "Express-mode quotas UNKNOWN." },
    privacy: { training: "unknown", note: "Not reviewed (deferred)." },
    sources: [{ label: "OpenAI compatibility on Vertex", url: "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/openai" }],
    termsUrl: null,
    verifiedAt: CHECKED,
    notes: "Requirements to build: service-account credential storage + token refresh, {location}-aiplatform.googleapis.com hosts per location.",
  },
];

/** Retired services evaluated and deliberately NOT added to the registry (recorded for transparency). */
export const RETIRED_NOT_ADDED = [
  {
    id: "github-models",
    name: "GitHub Models",
    evidence: "Fully retired 2026-07-30: \"The playground, model catalog, inference API, and bring your own key (BYOK) are no longer available to any customer.\"",
    sources: ["https://github.blog/changelog/2026-07-30-github-models-is-now-retired/", "https://docs.github.com/en/github-models/about-github-models"],
  },
];

export function getProviderDef(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isConnectable(def: ProviderDefinition): boolean {
  return def.status === "IMPLEMENTED" && def.transport === "https" && def.baseUrl !== null && def.protocols.length > 0;
}

/** The protocol a route uses: the connection's choice (when the provider offers several), else the provider default. */
export function protocolFor(def: ProviderDefinition, settings: Record<string, string> = {}): Protocol {
  const chosen = settings.protocol as Protocol | undefined;
  if (chosen && def.protocols.includes(chosen)) return chosen;
  return def.defaultProtocol ?? def.protocols[0]!;
}

/** Legacy local provider id kept in old rows (workspace.ai_provider, agent_version.provider). Never executed. */
export const LEGACY_LOCAL_PROVIDERS = new Set(["ollama"]);
