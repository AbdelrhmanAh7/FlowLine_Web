import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { callChat, listModels, primaryProtocol } from "@/ai/hub/protocols";
import { getProviderDef, isConnectable, PROVIDERS, type Protocol } from "@/ai/hub/registry";
import { allowedHostsFor, assertAllowedUrl, resolveBaseUrl } from "@/ai/hub/transport";
import { HubError, UNKNOWN_CAPABILITIES, type AiModelCapabilities, type HubChatRequest } from "@/ai/hub/types";

/**
 * Contract: EVERY implemented adapter against the protocol-accurate TEST DOUBLE (e2e/fakes/ai-protocols.ts): endpoint
 * selection (documented base path per provider), auth header per provider, discovery + pagination, request/response,
 * streaming, tool calls, structured output only when SUPPORTED, unsupported params rejected before sending,
 * invalid key, 429 + Retry-After, 5xx, timeouts, removed models — then each provider's specific quirks.
 * No network beyond 127.0.0.1, no database, no paid inference.
 */
let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prev = { ...process.env };
const KEY = "sk-fake-adapters-0123456789abcdefghijkl";
const SUPPORTED: AiModelCapabilities = { tools: "SUPPORTED", structuredOutput: "SUPPORTED", vision: "UNKNOWN", streaming: "SUPPORTED", reasoning: "UNKNOWN" };
const sig = (ms = 10_000) => AbortSignal.timeout(ms);

interface HubReq {
  provider: string;
  method: string;
  path: string;
  query: Record<string, string>;
  auth: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  stream: boolean;
}
const post = (path: string, body: unknown) => fetch(`${ai.url}${path}`, { method: "POST", body: JSON.stringify(body) });
const reqs = async (provider?: string) => ((await (await fetch(`${ai.url}/__fake/hub/requests`)).json()) as { requests: HubReq[] }).requests.filter((r) => !provider || r.provider === provider);
const hubFault = (f: Record<string, unknown>) => post("/__fake/hub/fault", { times: 1, ...f });

async function hubErr(p: Promise<unknown>): Promise<HubError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HubError);
    return e as HubError;
  }
  throw new Error("expected a HubError");
}

beforeAll(async () => {
  ai = await startFakeAi(0);
  process.env.FLOWLINE_ENV = "test";
  process.env.FLOWLINE_AI_TEST_OVERRIDE = ai.url;
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${ai.port}`;
});
afterAll(async () => {
  Object.assign(process.env, prev);
  await ai.close();
});
beforeEach(async () => {
  await post("/__fake/reset", {});
});

interface Case {
  id: string;
  label?: string;
  settings?: Record<string, string>;
  model: string;
  protocol: Protocol;
  chatPath: string;
  streamPath?: string;
  listPath: string | null;
  auth: "bearer" | "x-api-key" | "x-goog-api-key";
}
const CASES: Case[] = [
  { id: "openai", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "openai", label: "openai (Responses)", settings: { protocol: "openai-responses" }, model: "fake-gpt-mini", protocol: "openai-responses", chatPath: "/v1/responses", listPath: "/v1/models", auth: "bearer" },
  { id: "anthropic", model: "fake-claude", protocol: "anthropic-messages", chatPath: "/v1/messages", listPath: "/v1/models", auth: "x-api-key" },
  { id: "gemini", model: "fake-gemini", protocol: "gemini", chatPath: "/v1beta/models/fake-gemini:generateContent", streamPath: "/v1beta/models/fake-gemini:streamGenerateContent", listPath: "/v1beta/models", auth: "x-goog-api-key" },
  { id: "xai", model: "fake-gpt-mini", protocol: "openai-responses", chatPath: "/v1/responses", listPath: "/v1/models", auth: "bearer" },
  { id: "xai", label: "xai (legacy Chat)", settings: { protocol: "openai-chat" }, model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "groq", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/openai/v1/chat/completions", listPath: "/openai/v1/models", auth: "bearer" },
  { id: "groq", label: "groq (Responses)", settings: { protocol: "openai-responses" }, model: "fake-gpt-mini", protocol: "openai-responses", chatPath: "/openai/v1/responses", listPath: "/openai/v1/models", auth: "bearer" },
  { id: "openrouter", model: "openai/fake-gpt-mini", protocol: "openai-chat", chatPath: "/api/v1/chat/completions", listPath: "/api/v1/models", auth: "bearer" },
  { id: "mistral", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "cohere", model: "fake-command", protocol: "cohere-v2", chatPath: "/v2/chat", listPath: "/v1/models", auth: "bearer" },
  { id: "deepseek", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/chat/completions", listPath: "/models", auth: "bearer" },
  { id: "zai", model: "glm-4.5-flash", protocol: "openai-chat", chatPath: "/api/paas/v4/chat/completions", listPath: null, auth: "bearer" },
  { id: "moonshot", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "minimax", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "dashscope", settings: { region: "ap-southeast-1", workspaceId: "ws-123" }, model: "qwen3.8-flash", protocol: "openai-chat", chatPath: "/compatible-mode/v1/chat/completions", listPath: null, auth: "bearer" },
  { id: "cerebras", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "together", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "fireworks", model: "accounts/fireworks/models/fake-fire", protocol: "openai-chat", chatPath: "/inference/v1/chat/completions", listPath: "/v1/accounts/fireworks/models", auth: "bearer" },
  { id: "deepinfra", model: "meta-llama/fake-llama", protocol: "openai-chat", chatPath: "/v1/openai/chat/completions", listPath: "/models/list", auth: "bearer" },
  { id: "huggingface", model: "fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
  { id: "huggingface", label: "huggingface (Responses beta)", settings: { protocol: "openai-responses" }, model: "fake-gpt-mini", protocol: "openai-responses", chatPath: "/v1/responses", listPath: "/v1/models", auth: "bearer" },
  { id: "cloudflare", settings: { accountId: "acc123" }, model: "@cf/meta/fake-llama", protocol: "openai-chat", chatPath: "/client/v4/accounts/acc123/ai/v1/chat/completions", listPath: "/client/v4/accounts/acc123/ai/models/search", auth: "bearer" },
  { id: "vercel-gateway", model: "openai/fake-gpt-mini", protocol: "openai-chat", chatPath: "/v1/chat/completions", listPath: "/v1/models", auth: "bearer" },
];
const name = (c: Case) => c.label ?? c.id;
const creds = (c: Case, apiKey = KEY) => ({ apiKey, settings: c.settings ?? {} });
const def = (c: Case) => getProviderDef(c.id)!;
const plain: HubChatRequest = { system: "Summarise.", messages: [{ role: "user", content: "<untrusted_content>\nPriority: high\n</untrusted_content>" }], maxTokens: 50 };

it("covers every implemented adapter", () => {
  expect([...new Set(CASES.map((c) => c.id))].sort()).toEqual(PROVIDERS.filter(isConnectable).map((p) => p.id).sort());
  for (const c of CASES) expect(primaryProtocol(def(c), c.settings), name(c)).toBe(c.protocol);
});

describe.each(CASES.map((c) => [name(c), c] as const))("%s", (_n, c) => {
  it("discovery: documented list path + pagination + auth header (static catalogue when none is documented)", async () => {
    const models = await listModels(def(c), creds(c), sig());
    expect(models.length).toBeGreaterThan(0);
    const calls = (await reqs(c.id)).filter((r) => r.method === "GET");
    if (c.listPath === null) {
      expect(calls).toEqual([]); // no list endpoint → nothing is called
      expect(models.map((m) => m.id)).toContain(c.model);
      return;
    }
    expect(calls.length).toBeGreaterThan(0);
    for (const r of calls) {
      expect(r.path).toBe(c.listPath);
      expect(r.auth).toBe(c.auth);
      expect(r.query.key).toBeUndefined(); // the key is never in a URL
    }
  });

  it("request/response: documented endpoint, auth, normalised text + usage", async () => {
    const r = await callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, sig());
    expect(r.text).toContain("Summary:");
    expect(r.usage.inputTokens).toBeGreaterThan(0);
    const [call] = (await reqs(c.id)).filter((x) => x.method === "POST");
    expect(call).toMatchObject({ path: c.chatPath, auth: c.auth, stream: false });
    if (c.id === "anthropic") expect(call!.headers["anthropic-version"]).toBe("2023-06-01");
    if (c.protocol === "openai-chat") expect(call!.body![c.id === "openai" ? "max_completion_tokens" : "max_tokens"]).toBe(50);
  });

  it("streaming: deltas add up to the same answer; the final result is only the completed stream", async () => {
    const full = await callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, sig());
    const deltas: string[] = [];
    const s = await callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, sig(), { stream: true, onText: (t) => deltas.push(t) });
    expect(s.text).toBe(full.text);
    expect(deltas.join("")).toBe(full.text);
    const streamed = (await reqs(c.id)).filter((x) => x.method === "POST").at(-1)!;
    expect(streamed.stream).toBe(true);
    expect(streamed.path).toBe(c.streamPath ?? c.chatPath);
    if (c.id === "gemini") expect(streamed.query.alt).toBe("sse");
  });

  it("tool calls: the model's proposal comes back as a tool call (streamed fragments too)", async () => {
    const req: HubChatRequest = { system: "You are an agent inside Flowline.", messages: [{ role: "user", content: "what is our refund policy?" }], tools: [{ name: "knowledge_search", description: "Search", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }], maxTokens: 100 };
    const r = await callChat(def(c), c.protocol, creds(c), c.model, req, UNKNOWN_CAPABILITIES, sig());
    expect(r.toolCalls).toEqual([expect.objectContaining({ name: "knowledge_search", arguments: { query: "what is our refund policy?" } })]);
    const s = await callChat(def(c), c.protocol, creds(c), c.model, req, UNKNOWN_CAPABILITIES, sig(), { stream: true });
    expect(s.toolCalls.map((t) => [t.name, t.arguments])).toEqual([["knowledge_search", { query: "what is our refund policy?" }]]);
  });

  it("structured output: native only when SUPPORTED; unsupported parameters are rejected before sending", async () => {
    const schema = { type: "object", properties: { priority: { type: "string" } }, required: ["priority"] };
    const native = await callChat(def(c), c.protocol, creds(c), c.model, { ...plain, schema }, SUPPORTED, sig());
    expect(JSON.parse(native.text)).toEqual({ priority: "high" });
    const body = (await reqs(c.id)).filter((x) => x.method === "POST").at(-1)!.body!;
    const nativeField = { "openai-chat": body.response_format, "openai-responses": body.text, "anthropic-messages": body.output_config, gemini: (body.generationConfig as Record<string, unknown>)?.responseSchema, "cohere-v2": body.response_format }[c.protocol];
    expect(nativeField).toBeTruthy();
    const before = (await reqs(c.id)).length;
    const tools = [{ name: "t", description: "", parameters: {} }];
    expect((await hubErr(callChat(def(c), c.protocol, creds(c), c.model, { ...plain, tools }, { ...UNKNOWN_CAPABILITIES, tools: "UNSUPPORTED" }, sig()))).code).toBe("AI_CAPABILITY_UNSUPPORTED");
    expect((await hubErr(callChat(def(c), c.protocol, creds(c), c.model, { ...plain, temperature: 5 }, UNKNOWN_CAPABILITIES, sig()))).code).toBe("AI_BAD_REQUEST");
    expect((await reqs(c.id)).length).toBe(before); // nothing was sent
  });

  it("invalid / revoked key → AI_AUTH_FAILED (with the provider's own 401 shape)", async () => {
    expect((await hubErr(callChat(def(c), c.protocol, creds(c, "sk-fake-revoked-000000000000000000000000"), c.model, plain, UNKNOWN_CAPABILITIES, sig()))).code).toBe("AI_AUTH_FAILED");
    if (c.listPath) expect((await hubErr(listModels(def(c), creds(c, "not-a-fake-key-0000000000000000000"), sig()))).code).toBe("AI_AUTH_FAILED");
  });

  it("429 with Retry-After is retryable; 5xx is retryable; a hung request times out (possibly billed)", async () => {
    await hubFault({ provider: c.id, mode: "http", status: 429, body: { error: { message: "slow down", type: "rate_limit_error", code: "rate_limit_exceeded" } }, headers: { "retry-after": "2" } });
    expect(await hubErr(callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, sig()))).toMatchObject({ code: "AI_RATE_LIMITED", retryable: true, retryAfterMs: 2000 });
    await hubFault({ provider: c.id, mode: "http", status: 500, body: { error: { message: "boom" } } });
    expect(await hubErr(callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, sig()))).toMatchObject({ code: "AI_PROVIDER_ERROR", retryable: true });
    await hubFault({ provider: c.id, mode: "hang" });
    expect(await hubErr(callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, AbortSignal.timeout(300)))).toMatchObject({ code: "AI_TIMEOUT", retryable: true, possibleCharge: true });
  });

  it("a removed / unknown model → AI_MODEL_REMOVED (actionable, not an opaque error)", async () => {
    expect((await hubErr(callChat(def(c), c.protocol, creds(c), "fake-missing", plain, UNKNOWN_CAPABILITIES, sig()))).code).toBe("AI_MODEL_REMOVED");
  });

  it("a stream cut before its terminal event is interrupted (possibly billed), never returned as a partial answer", async () => {
    await hubFault({ provider: c.id, mode: "stream_cut" });
    expect(await hubErr(callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, sig(), { stream: true }))).toMatchObject({ retryable: true, possibleCharge: true });
  });
});

describe("provider-specific quirks through the double", () => {
  const C = (id: string) => CASES.find((c) => c.id === id && !c.label)!;
  const call = (id: string, opts: { stream?: boolean } = {}, over: Partial<Case> = {}) => {
    const c = { ...C(id), ...over };
    return callChat(def(c), c.protocol, creds(c), c.model, plain, UNKNOWN_CAPABILITIES, sig(), opts);
  };

  it("OpenAI: optional organization / project headers are sent only when set", async () => {
    await call("openai", {}, { settings: { organization: "org-abc", project: "proj_1" } });
    const [r] = (await reqs("openai")).filter((x) => x.method === "POST");
    expect(r!.headers).toMatchObject({ "openai-organization": "org-abc", "openai-project": "proj_1" });
  });

  it("Hugging Face: X-HF-Bill-To is sent when a billing org is set", async () => {
    await call("huggingface", {}, { settings: { billTo: "my-org" } });
    expect((await reqs("huggingface")).at(-1)!.headers["x-hf-bill-to"]).toBe("my-org");
  });

  it("OpenRouter (gateway): provider-reported cost and the serving provider; a mid-stream error after the 200", async () => {
    const r = await call("openrouter");
    expect(r).toMatchObject({ providerCostMicros: 123, servingProvider: "FakeUpstream" });
    await hubFault({ provider: "openrouter", mode: "stream_error" });
    expect(await hubErr(call("openrouter", { stream: true }))).toMatchObject({ code: "AI_PROVIDER_ERROR", possibleCharge: true });
    await hubFault({ provider: "openrouter", mode: "http", status: 402, body: { error: { code: 402, message: "Insufficient credits" } } });
    expect((await hubErr(call("openrouter"))).code).toBe("AI_QUOTA_EXCEEDED");
  });

  it("xAI (Responses): cost_in_nano_usd becomes a provider-reported cost", async () => {
    expect((await call("xai")).providerCostMicros).toBe(1234);
  });

  it("Anthropic: an overloaded error event after the 200 is retryable; 529 is overloaded", async () => {
    await hubFault({ provider: "anthropic", mode: "stream_error" });
    expect(await hubErr(call("anthropic", { stream: true }))).toMatchObject({ code: "AI_OVERLOADED", retryable: true });
    await hubFault({ provider: "anthropic", mode: "http", status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } });
    expect(await hubErr(call("anthropic"))).toMatchObject({ code: "AI_OVERLOADED", retryable: true });
  });

  it("Gemini: the key only travels in x-goog-api-key; 402 prepay depleted is not retryable", async () => {
    await call("gemini");
    expect((await reqs("gemini")).every((r) => r.auth === "x-goog-api-key" && r.query.key === undefined)).toBe(true);
    await hubFault({ provider: "gemini", mode: "http", status: 402, body: { error: { code: 402, message: "Your prepay credit balance is depleted", status: "payment_required" } } });
    expect(await hubErr(call("gemini"))).toMatchObject({ code: "AI_QUOTA_EXCEEDED", retryable: false });
  });

  it("DeepSeek 402, Z.ai 429/1113 + 1315, Kimi quota 429, MiniMax base_resp 1008 in a 200, Alibaba 400 Arrearage, Groq 498: out-of-balance is never retryable", async () => {
    const cases: [string, Record<string, unknown>, string, boolean][] = [
      ["deepseek", { mode: "http", status: 402, body: { error: { message: "Insufficient Balance" } } }, "AI_QUOTA_EXCEEDED", false],
      ["zai", { mode: "http", status: 429, body: { error: { code: "1113", message: "insufficient balance" } } }, "AI_QUOTA_EXCEEDED", false],
      ["zai", { mode: "http", status: 429, body: { error: { code: "1315", message: "coding package only" } } }, "AI_PLAN_NOT_ALLOWED", false],
      ["moonshot", { mode: "http", status: 429, body: { error: { type: "exceeded_current_quota_error", message: "quota" } } }, "AI_QUOTA_EXCEEDED", false],
      ["minimax", { mode: "json", body: { base_resp: { status_code: 1008, status_msg: "insufficient balance" } } }, "AI_QUOTA_EXCEEDED", false],
      ["dashscope", { mode: "http", status: 400, body: { code: "Arrearage", message: "overdue" } }, "AI_QUOTA_EXCEEDED", false],
      ["groq", { mode: "http", status: 498, body: { error: { message: "flex capacity" } } }, "AI_OVERLOADED", true],
      ["cohere", { mode: "http", status: 429, body: { message: "You are using a Trial key, which is limited to 40 API calls / minute." } }, "AI_TRIAL_KEY", false],
      ["together", { mode: "http", status: 403, body: { error: { message: "too long" } } }, "AI_CONTEXT_TOO_LONG", false],
    ];
    for (const [id, f, code, retryable] of cases) {
      await hubFault({ provider: id, ...f });
      expect({ id, ...(await hubErr(call(id))) }).toMatchObject({ id, code, retryable });
    }
  });

  it("Alibaba: region + workspace ID build the recommended workspace domain; a crafted field never reaches a host", () => {
    const d = getProviderDef("dashscope")!;
    process.env.FLOWLINE_ENV = "staging";
    try {
      expect(resolveBaseUrl(d, { region: "ap-southeast-1", workspaceId: "ws-123" })).toBe("https://ws-123.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1");
      expect(allowedHostsFor(d, { region: "cn-beijing", workspaceId: "ws-9" })).toEqual(["ws-9.cn-beijing.maas.aliyuncs.com"]);
      expect(() => assertAllowedUrl(d, "https://other.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions", { region: "ap-southeast-1", workspaceId: "ws-123" })).toThrowError(expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }));
      // The legacy dashscope-intl domain is not an allowed host any more.
      expect(() => assertAllowedUrl(d, "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", { region: "ap-southeast-1", workspaceId: "ws-123" })).toThrowError(expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }));
    } finally {
      process.env.FLOWLINE_ENV = "test";
    }
    for (const bad of [{ region: "ap-southeast-1", workspaceId: "evil.example.com#" }, { region: "ap-southeast-1", workspaceId: "a/b" }, { region: "us-west-9", workspaceId: "ws" }, { region: "ap-southeast-1" }, { region: "ap-southeast-1", workspaceId: "ws", baseUrl: "https://x" }]) {
      expect(() => resolveBaseUrl(d, bad as Record<string, string>), JSON.stringify(bad)).toThrowError(HubError);
    }
  });

  it("Cloudflare: the account ID is validated before it is placed in the documented path", async () => {
    const d = getProviderDef("cloudflare")!;
    expect(() => resolveBaseUrl(d, { accountId: "../../x" })).toThrowError(expect.objectContaining({ code: "AI_SETTINGS_INVALID" }));
    expect(() => resolveBaseUrl(d, {})).toThrowError(expect.objectContaining({ code: "AI_SETTINGS_INVALID" }));
    const before = (await reqs("cloudflare")).length;
    expect((await hubErr(listModels(d, { apiKey: KEY, settings: { accountId: "a.b" } }, sig()))).code).toBe("AI_SETTINGS_INVALID");
    expect((await reqs("cloudflare")).length).toBe(before);
  });

  it("unknown settings keys are refused (no free-form fields reach a request)", async () => {
    expect((await hubErr(listModels(getProviderDef("openai")!, { apiKey: KEY, settings: { host: "evil" } }, sig()))).code).toBe("AI_SETTINGS_INVALID");
  });

  it("discovery metadata: Anthropic capabilities, Gemini non-chat models filtered, OpenRouter prices + zero-priced :free, Fireworks tools flag", async () => {
    const anth = await listModels(getProviderDef("anthropic")!, { apiKey: KEY, settings: {} }, sig());
    expect(anth.find((m) => m.id === "fake-claude-json")!.capabilities).toMatchObject({ structuredOutput: "SUPPORTED", tools: "SUPPORTED" });
    expect((await reqs("anthropic")).filter((r) => r.method === "GET").map((r) => r.query.after_id ?? null)).toEqual([null, "fake-claude-json"]);
    const gem = await listModels(getProviderDef("gemini")!, { apiKey: KEY, settings: {} }, sig());
    expect(gem.map((m) => m.id)).toEqual(["fake-gemini", "fake-gemini-pro", "fake-gemini-3"]); // fake-embedding filtered
    const or = await listModels(getProviderDef("openrouter")!, { apiKey: KEY, settings: {} }, sig());
    expect(or.find((m) => m.id === "vendor/fake-free:free")!.pricing).toMatchObject({ inputPerMTokMicros: 0, outputPerMTokMicros: 0 });
    expect(or.find((m) => m.id === "openrouter/auto")!.pricing).toBeNull(); // variable price = unknown
    expect(or.find((m) => m.id === "vendor/fake-notools")!.capabilities).toMatchObject({ tools: "UNSUPPORTED" });
    const fw = await listModels(getProviderDef("fireworks")!, { apiKey: KEY, settings: {} }, sig());
    expect(fw.find((m) => m.id.endsWith("fake-notools"))!.capabilities).toMatchObject({ tools: "UNSUPPORTED" });
    const di = await listModels(getProviderDef("deepinfra")!, { apiKey: KEY, settings: {} }, sig());
    expect(di.map((m) => m.id)).not.toContain("old/deprecated-model");
  });

  it("unsuitable / deferred providers can't be called or listed", async () => {
    for (const id of ["opencode-zen", "command-code", "nvidia", "bedrock", "azure-openai", "vertex"]) {
      const d = getProviderDef(id)!;
      expect(isConnectable(d), id).toBe(false);
      expect(() => resolveBaseUrl(d)).toThrowError(expect.objectContaining({ code: "AI_PROVIDER_NOT_AVAILABLE" }));
      expect((await hubErr(callChat(d, "openai-chat", { apiKey: KEY, settings: {} }, "m", plain, UNKNOWN_CAPABILITIES, sig()))).code).toBe("AI_PROTOCOL_UNSUPPORTED");
    }
  });
});
