/**
 * AI provider hub — provider DEFINITIONS (what a provider is), separate from workspace CONNECTIONS (a BYOK credential),
 * ROUTES (connection + model + protocol) and POLICY (how a route is chosen).
 *
 * Rules for this file:
 * - Nothing here is invented. A base URL / path is only filled in when it comes from the provider's official docs,
 *   cited in `sources`. Providers not yet researched and implemented are PENDING with `baseUrl: null`: the UI shows
 *   them as "not available yet" and they can't be connected (Wave B fills them in, one verified entry at a time).
 * - `verifiedAt` is the date the cited sources were checked for THIS entry, not a live-call certification.
 *   Live verification is recorded per connection (`ai_connection.verification = LIVE_VERIFIED`) and needs owner keys.
 * - Local inference (Ollama, LM Studio, vLLM, llama.cpp) is out of scope: the web release is cloud-only. The
 *   `local-runner` transport kind is reserved as an extension point and is NOT implemented.
 */

export type ProviderTier = "core" | "expansion" | "deferred";
/** IMPLEMENTED = connectable and executable; PENDING = researched later; UNSUITABLE = documented, won't be built. */
export type ProviderStatus = "IMPLEMENTED" | "PENDING" | "UNSUITABLE";
export type Protocol = "openai-chat" | "openai-responses" | "anthropic-messages" | "gemini" | "cohere-v2";
/** `local-runner` is reserved for a future local companion; no code path executes it. */
export type TransportKind = "https" | "local-runner";
export type AuthScheme = "bearer" | "x-api-key" | "x-goog-api-key" | "none";
export type DiscoveryMethod = "openai-models-list" | "anthropic-models-list" | "gemini-models-list" | "cohere-models-list" | "none";
/** direct = the model's author serves it; gateway = a router forwarding to upstream providers. */
export type RouteKind = "direct" | "gateway";

export interface ProviderSource {
  label: string;
  url: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  tier: ProviderTier;
  status: ProviderStatus;
  routeKind: RouteKind;
  transport: TransportKind;
  /** Official base URL (null until verified from docs). */
  baseUrl: string | null;
  /** Exact hosts the hub may call for this provider (host or host:port). Anything else is refused before DNS. */
  allowedHosts: string[];
  auth: AuthScheme;
  protocols: Protocol[];
  discovery: DiscoveryMethod;
  /** Name of the output-token cap in the chat request (OpenAI Chat Completions uses max_completion_tokens). */
  maxTokensParam?: "max_completion_tokens" | "max_tokens";
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

const pending = (
  id: string,
  name: string,
  tier: ProviderTier,
  routeKind: RouteKind,
  docs: ProviderSource[],
  notes?: string,
): ProviderDefinition => ({
  id,
  name,
  tier,
  status: tier === "deferred" ? "UNSUITABLE" : "PENDING",
  routeKind,
  transport: "https",
  baseUrl: null,
  allowedHosts: [],
  auth: "bearer",
  protocols: [],
  discovery: "none",
  sources: docs,
  termsUrl: null,
  verifiedAt: null,
  requirements: [],
  contractVerified: false,
  notes,
});

export const PROVIDERS: ProviderDefinition[] = [
  /* ───────── core (15) ───────── */
  {
    id: "openai",
    name: "OpenAI",
    tier: "core",
    status: "IMPLEMENTED",
    routeKind: "direct",
    transport: "https",
    baseUrl: "https://api.openai.com/v1",
    allowedHosts: ["api.openai.com"],
    auth: "bearer",
    // Wave A implements the Chat Completions route; the Responses route lands in Wave B.
    protocols: ["openai-chat"],
    discovery: "openai-models-list",
    maxTokensParam: "max_completion_tokens",
    sources: [
      { label: "OpenAI OpenAPI specification (servers, /chat/completions, /models, CompletionUsage)", url: "https://github.com/openai/openai-openapi" },
      { label: "API reference: Chat Completions", url: "https://platform.openai.com/docs/api-reference/chat/create" },
      { label: "API reference: List models", url: "https://platform.openai.com/docs/api-reference/models/list" },
    ],
    termsUrl: "https://openai.com/policies/services-agreement/",
    verifiedAt: "2026-09-29",
    requirements: ["An OpenAI API key (platform.openai.com → API keys)"],
    contractVerified: true,
  },
  pending("anthropic", "Anthropic", "core", "direct", [{ label: "Anthropic API docs", url: "https://docs.anthropic.com/en/api/overview" }]),
  pending("gemini", "Google Gemini", "core", "direct", [{ label: "Gemini API docs", url: "https://ai.google.dev/gemini-api/docs" }]),
  pending("xai", "xAI", "core", "direct", [{ label: "xAI API docs", url: "https://docs.x.ai/" }]),
  pending("groq", "Groq", "core", "direct", [{ label: "Groq API docs", url: "https://console.groq.com/docs" }]),
  pending("openrouter", "OpenRouter", "core", "gateway", [{ label: "OpenRouter API docs", url: "https://openrouter.ai/docs" }]),
  pending("mistral", "Mistral AI", "core", "direct", [{ label: "Mistral API docs", url: "https://docs.mistral.ai/" }]),
  pending("cohere", "Cohere", "core", "direct", [{ label: "Cohere API docs", url: "https://docs.cohere.com/" }]),
  pending("deepseek", "DeepSeek", "core", "direct", [{ label: "DeepSeek API docs", url: "https://api-docs.deepseek.com/" }]),
  pending("zai", "Z.ai", "core", "direct", [{ label: "Z.ai API docs", url: "https://docs.z.ai/" }]),
  pending("moonshot", "Moonshot AI", "core", "direct", [{ label: "Moonshot platform docs", url: "https://platform.moonshot.ai/docs" }]),
  pending("minimax", "MiniMax", "core", "direct", [{ label: "MiniMax platform docs", url: "https://www.minimax.io/platform" }]),
  pending("dashscope", "Alibaba Cloud Model Studio (DashScope)", "core", "direct", [{ label: "Model Studio docs", url: "https://www.alibabacloud.com/help/en/model-studio/" }]),
  pending("opencode-zen", "OpenCode Zen", "core", "gateway", [{ label: "OpenCode Zen docs", url: "https://opencode.ai/docs/zen/" }]),
  pending("command-code", "Command Code", "core", "gateway", [], "Public API documentation not yet located; stays PENDING until an official source is found."),

  /* ───────── expansion (8) ───────── */
  pending("cerebras", "Cerebras", "expansion", "direct", [{ label: "Cerebras inference docs", url: "https://inference-docs.cerebras.ai/" }]),
  pending("together", "Together AI", "expansion", "gateway", [{ label: "Together docs", url: "https://docs.together.ai/" }]),
  pending("fireworks", "Fireworks AI", "expansion", "gateway", [{ label: "Fireworks docs", url: "https://docs.fireworks.ai/" }]),
  pending("deepinfra", "DeepInfra", "expansion", "gateway", [{ label: "DeepInfra docs", url: "https://deepinfra.com/docs" }]),
  pending("huggingface", "Hugging Face Inference Providers", "expansion", "gateway", [{ label: "Inference Providers docs", url: "https://huggingface.co/docs/inference-providers" }]),
  pending("cloudflare", "Cloudflare Workers AI", "expansion", "gateway", [{ label: "Workers AI docs", url: "https://developers.cloudflare.com/workers-ai/" }]),
  pending("vercel-gateway", "Vercel AI Gateway", "expansion", "gateway", [{ label: "AI Gateway docs", url: "https://vercel.com/docs/ai-gateway" }]),
  pending("nvidia", "NVIDIA hosted (build.nvidia.com)", "expansion", "gateway", [{ label: "NVIDIA API catalog docs", url: "https://docs.api.nvidia.com/" }]),

  /* ───────── deferred enterprise clouds (3): documented, not built ───────── */
  pending("bedrock", "Amazon Bedrock", "deferred", "gateway", [{ label: "Bedrock docs", url: "https://docs.aws.amazon.com/bedrock/" }], "Enterprise cloud (IAM/SigV4 auth); deferred by scope."),
  pending("azure-openai", "Azure OpenAI", "deferred", "gateway", [{ label: "Azure OpenAI docs", url: "https://learn.microsoft.com/azure/ai-services/openai/" }], "Enterprise cloud (per-resource endpoints); deferred by scope."),
  pending("vertex", "Google Vertex AI", "deferred", "gateway", [{ label: "Vertex AI docs", url: "https://cloud.google.com/vertex-ai/docs" }], "Enterprise cloud (service-account OAuth); deferred by scope."),
];

export function getProviderDef(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isConnectable(def: ProviderDefinition): boolean {
  return def.status === "IMPLEMENTED" && def.transport === "https" && def.baseUrl !== null && def.protocols.length > 0;
}

/** Legacy local provider id kept in old rows (workspace.ai_provider, agent_version.provider). Never executed. */
export const LEGACY_LOCAL_PROVIDERS = new Set(["ollama"]);
