import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { callChat, listModels } from "@/ai/hub/protocols";
import { buildChatBody, parseChatResponse, parseModelsPage } from "@/ai/hub/protocols/openai-chat";
import { getProviderDef, PROVIDERS, isConnectable } from "@/ai/hub/registry";
import { assertAllowedUrl, resolveBaseUrl } from "@/ai/hub/transport";
import { HubError, UNKNOWN_CAPABILITIES, type AiModelCapabilities } from "@/ai/hub/types";

/**
 * Contract: the OpenAI Chat Completions protocol (request build, response + usage normalisation, error mapping,
 * model listing with pagination) against documented-shape fixtures and the OpenAI-compatible TEST DOUBLE.
 * No network beyond 127.0.0.1, no database.
 */
const def = getProviderDef("openai")!;
let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prev = { ...process.env };
const KEY = "sk-fake-contract-0123456789abcdef";
const creds = { apiKey: KEY, settings: {} };
const SUPPORTED: AiModelCapabilities = { tools: "SUPPORTED", structuredOutput: "SUPPORTED", vision: "UNKNOWN", streaming: "UNKNOWN", reasoning: "UNKNOWN" };
const sig = (ms = 10_000) => AbortSignal.timeout(ms);

const post = (path: string, body: unknown) => fetch(`${ai.url}${path}`, { method: "POST", body: JSON.stringify(body) });
const requests = async () => ((await (await fetch(`${ai.url}/__fake/openai/requests`)).json()) as { requests: { path: string; keySha256: string | null; responseFormat: string | null; hasTools: boolean; auth: string }[]; stolen: number });

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

describe("registry", () => {
  it("has the 15 core, 8 expansion and 3 deferred providers; only documented entries are connectable", () => {
    expect(PROVIDERS.filter((p) => p.tier === "core")).toHaveLength(15);
    expect(PROVIDERS.filter((p) => p.tier === "expansion")).toHaveLength(8);
    expect(PROVIDERS.filter((p) => p.tier === "deferred")).toHaveLength(3);
    for (const p of PROVIDERS) {
      if (isConnectable(p)) {
        expect(p.baseUrl, p.id).toMatch(/^https:\/\//);
        expect(p.sources.length, p.id).toBeGreaterThan(0);
        expect(p.verifiedAt, p.id).not.toBeNull();
        // The base URL's host (templated hosts included) is always in the provider's own allowlist.
        expect(p.allowedHosts, p.id).toContain(/^https:\/\/([^/]+)/.exec(p.baseUrl!)![1]!);
      } else {
        // Nothing unverified is executable: no base URL, no hosts, no protocols — but the verdict and its evidence stay.
        expect([p.baseUrl, p.allowedHosts.length, p.protocols.length], p.id).toEqual([null, 0, 0]);
        expect(["UNSUITABLE", "DEFERRED"], p.id).toContain(p.status);
        expect(p.verdictEvidence.length, p.id).toBeGreaterThan(40);
      }
      expect(p.transport).toBe("https");
    }
    expect(PROVIDERS.filter(isConnectable).map((p) => p.id)).toEqual([
      "openai", "anthropic", "gemini", "xai", "groq", "openrouter", "mistral", "cohere", "deepseek", "zai", "moonshot", "minimax", "dashscope",
      "cerebras", "together", "fireworks", "deepinfra", "huggingface", "cloudflare", "vercel-gateway",
    ]);
    // Core targets are never silently dropped: the unsuitable ones stay listed with their verdict.
    expect(PROVIDERS.filter((p) => !isConnectable(p)).map((p) => [p.id, p.verdict])).toEqual([
      ["opencode-zen", "UNSUITABLE"],
      ["command-code", "UNSUITABLE_PENDING_OWNER_REVIEW"],
      ["nvidia", "UNSUITABLE"],
      ["bedrock", "DEFERRED"],
      ["azure-openai", "DEFERRED"],
      ["vertex", "DEFERRED"],
    ]);
    // Retired services are not registered at all (GitHub Models, retired 2026-07-30).
    expect(PROVIDERS.some((p) => p.id === "github-models")).toBe(false);
  });
});

describe("request building", () => {
  it("sends max_completion_tokens, tools, and native json_schema only when the route SUPPORTS structured output", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    const tools = [{ name: "lookup", description: "Look up", parameters: { type: "object", properties: {} } }];
    const req = { system: "sys", messages: [{ role: "user" as const, content: "hi" }], tools, schema, maxTokens: 64, temperature: 0 };
    const native = buildChatBody(def, "m", req, SUPPORTED);
    expect(native).toMatchObject({ model: "m", max_completion_tokens: 64, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "result", schema } } });
    expect(native.tools).toEqual([{ type: "function", function: { name: "lookup", description: "Look up", parameters: { type: "object", properties: {} } } }]);
    expect((native.messages as unknown[])[0]).toEqual({ role: "system", content: "sys" });
    const prompted = buildChatBody(def, "m", req, UNKNOWN_CAPABILITIES);
    expect(prompted.response_format).toBeUndefined(); // UNKNOWN is never treated as SUPPORTED
    expect(prompted.tools).toBeDefined(); // UNKNOWN tools are attempted; the provider decides
  });

  it("assistant tool calls and tool results round-trip in the documented shape", () => {
    const body = buildChatBody(
      def,
      "m",
      {
        system: "s",
        maxTokens: 10,
        messages: [
          { role: "user", content: "q" },
          { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "f", arguments: { x: 1 } }] },
          { role: "tool", toolCallId: "c1", name: "f", content: "result" },
        ],
      },
      UNKNOWN_CAPABILITIES,
    );
    expect((body.messages as unknown[]).slice(2)).toEqual([
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: '{"x":1}' } }] },
      { role: "tool", tool_call_id: "c1", content: "result" },
    ]);
  });

  it("unsupported parameters are validation errors, not silently dropped", () => {
    const caps = { ...UNKNOWN_CAPABILITIES, tools: "UNSUPPORTED" as const };
    const tools = [{ name: "t", description: "", parameters: {} }];
    expect(() => buildChatBody(def, "m", { system: "", messages: [], tools, maxTokens: 10 }, caps)).toThrowError(expect.objectContaining({ code: "AI_CAPABILITY_UNSUPPORTED" }));
    expect(() => buildChatBody(def, "m", { system: "", messages: [], maxTokens: 10, temperature: 3 }, UNKNOWN_CAPABILITIES)).toThrowError(expect.objectContaining({ code: "AI_BAD_REQUEST" }));
    expect(() => buildChatBody(def, "m", { system: "", messages: [], maxTokens: 0 }, UNKNOWN_CAPABILITIES)).toThrowError(expect.objectContaining({ code: "AI_BAD_REQUEST" }));
  });
});

describe("response normalisation", () => {
  it("maps usage to NON-overlapping fields (cached ⊂ prompt, reasoning ⊂ completion) and never keeps reasoning text", () => {
    const r = parseChatResponse(def, "req-model", {
      model: "gpt-x-2026",
      choices: [{ message: { role: "assistant", content: "Hello", reasoning_content: "secret thoughts" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, prompt_tokens_details: { cached_tokens: 30 }, completion_tokens_details: { reasoning_tokens: 25 } },
    });
    expect(r).toEqual({
      text: "Hello",
      toolCalls: [],
      finishReason: "stop",
      model: "gpt-x-2026",
      usage: { inputTokens: 70, cacheReadTokens: 30, cacheWriteTokens: null, outputTokens: 15, reasoningTokens: 25 },
    });
    expect(JSON.stringify(r)).not.toContain("secret thoughts");
  });

  it("unreported details stay unknown (null), not 0; tool call arguments are parsed", () => {
    const r = parseChatResponse(def, "m", {
      choices: [{ message: { content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "run", arguments: '{"n":2}' } }, { id: "x", function: { name: "empty", arguments: "{}" } }] }, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });
    expect(r.usage).toEqual({ inputTokens: 5, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 2, reasoningTokens: null });
    expect(r.toolCalls).toEqual([
      { id: "call_9", name: "run", arguments: { n: 2 } },
      { id: "x", name: "empty", arguments: {} },
    ]);
    expect(r.model).toBe("m");
  });

  it("invalid tool-call argument JSON is corrupt output, not {} (Codex CXH-15)", () => {
    const bad = { choices: [{ message: { content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "run", arguments: '{"n":2}' } }, { id: "x", function: { name: "bad", arguments: "{not json" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 5, completion_tokens: 2 } };
    expect(() => parseChatResponse(def, "m", bad)).toThrowError(expect.objectContaining({ code: "AI_BAD_RESPONSE", retryable: true, possibleCharge: true }));
  });

  it("a response without a message is a retryable bad response", () => {
    expect(() => parseChatResponse(def, "m", { choices: [] })).toThrowError(expect.objectContaining({ code: "AI_BAD_RESPONSE", retryable: true }));
  });
});

describe("against the OpenAI-compatible double", () => {
  it("chat: Bearer auth only (never in the URL), usage incl. cached + reasoning tokens, reasoning text dropped", async () => {
    const r = await callChat(def, "openai-chat", creds, "fake-reasoner", { system: "s", messages: [{ role: "user", content: "hello there" }], maxTokens: 50 }, UNKNOWN_CAPABILITIES, sig());
    expect(r.text).toContain("Summary");
    expect(r.usage.reasoningTokens).toBe(7);
    expect(JSON.stringify(r)).not.toContain("HIDDEN-CHAIN-OF-THOUGHT-CANARY");
    const c = await callChat(def, "openai-chat", creds, "fake-cache", { system: "s".repeat(400), messages: [{ role: "user", content: "hello" }], maxTokens: 50 }, UNKNOWN_CAPABILITIES, sig());
    expect(c.usage.cacheReadTokens).toBeGreaterThan(0);
    const { requests: rs } = await requests();
    expect(rs.every((x) => x.auth === "bearer" && x.keySha256 === createHash("sha256").update(KEY).digest("hex"))).toBe(true);
    expect(rs.every((x) => !x.path.includes(KEY))).toBe(true);
  });

  it("tool calls come back normalised", async () => {
    const tools = [{ name: "knowledge_search", description: "search", parameters: { type: "object", properties: { query: { type: "string" } } } }];
    const r = await callChat(def, "openai-chat", creds, "fake-gpt-tools", { system: "You are an agent inside Flowline.", messages: [{ role: "user", content: "what is the refund policy?" }], tools, maxTokens: 50 }, SUPPORTED, sig());
    expect(r.toolCalls).toEqual([{ id: "call_0", name: "knowledge_search", arguments: { query: "what is the refund policy?" } }]);
    expect(r.finishReason).toBe("tool_calls");
  });

  it("native structured output is sent only for SUPPORTED routes", async () => {
    const schema = { type: "object", properties: { priority: { type: "string", enum: ["high", "low"] } }, required: ["priority"] };
    await callChat(def, "openai-chat", creds, "fake-gpt-mini", { system: "s", messages: [{ role: "user", content: "Priority: high" }], schema, maxTokens: 50 }, SUPPORTED, sig());
    await callChat(def, "openai-chat", creds, "fake-gpt-mini", { system: "s", messages: [{ role: "user", content: "Priority: high" }], schema, maxTokens: 50 }, UNKNOWN_CAPABILITIES, sig());
    expect((await requests()).requests.map((x) => x.responseFormat)).toEqual(["json_schema", null]);
  });

  const call = (model = "fake-gpt-mini", ms = 10_000) => callChat(def, "openai-chat", creds, model, { system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 20 }, UNKNOWN_CAPABILITIES, sig(ms));

  it("401 → AI_AUTH_FAILED with a fixed message that never echoes the key", async () => {
    const revoked = "sk-fake-revoked-abcdefghijklmnop";
    const e = await hubErr(callChat(def, "openai-chat", { apiKey: revoked, settings: {} }, "fake-gpt-mini", { system: "s", messages: [], maxTokens: 5 }, UNKNOWN_CAPABILITIES, sig()));
    expect(e).toMatchObject({ code: "AI_AUTH_FAILED", retryable: false, httpStatus: 401 });
    for (const part of [revoked, revoked.slice(0, 10), "revoked", "api-keys"]) expect(e.message).not.toContain(part);
  });

  it("403, 404 (removed model), 429 + Retry-After, insufficient_quota, 5xx, bad JSON, timeout", async () => {
    await post("/__fake/openai/fault", { mode: "403", times: 1 });
    expect(await hubErr(call())).toMatchObject({ code: "AI_FORBIDDEN", retryable: false });
    expect(await hubErr(call("gone-model"))).toMatchObject({ code: "AI_MODEL_REMOVED", retryable: false, httpStatus: 404 });
    await post("/__fake/openai/fault", { mode: "429", times: 1, retryAfterSec: 2 });
    expect(await hubErr(call())).toMatchObject({ code: "AI_RATE_LIMITED", retryable: true, retryAfterMs: 2000 });
    await post("/__fake/openai/fault", { mode: "insufficient_quota", times: 1 });
    expect(await hubErr(call())).toMatchObject({ code: "AI_QUOTA_EXCEEDED", retryable: false });
    await post("/__fake/openai/fault", { mode: "500", times: 1 });
    expect(await hubErr(call())).toMatchObject({ code: "AI_PROVIDER_ERROR", retryable: true });
    await post("/__fake/openai/fault", { mode: "bad_json", times: 1 });
    expect(await hubErr(call())).toMatchObject({ code: "AI_BAD_RESPONSE", retryable: true });
    await post("/__fake/openai/fault", { mode: "timeout", times: 1 });
    expect(await hubErr(call("fake-gpt-mini", 800))).toMatchObject({ code: "AI_TIMEOUT", retryable: true });
  });

  it("redirects are never followed: to a metadata IP, or cross-origin (no credential forwarding)", async () => {
    await post("/__fake/openai/fault", { mode: "redirect_private", times: 1 });
    expect(await hubErr(call())).toMatchObject({ code: "AI_REDIRECT_REFUSED" });
    await post("/__fake/openai/fault", { mode: "redirect_cross_origin", times: 1 });
    expect(await hubErr(call())).toMatchObject({ code: "AI_REDIRECT_REFUSED" });
    expect((await requests()).stolen).toBe(0);
  });

  it("model listing follows has_more/last_id pagination and returns every model once", async () => {
    const models = await listModels(def, creds);
    expect(models.map((m) => m.id)).toEqual(["fake-gpt-mini", "fake-gpt-large", "fake-gpt-tools", "fake-reasoner", "fake-cache"]);
    expect(models[0]!.ownedBy).toBe("fake-org");
    expect((await requests()).requests.filter((r) => r.path === "/openai/v1/models")).toHaveLength(3);
  });

  it("a malformed catalogue is rejected as a whole; an outage is a provider error", async () => {
    await post("/__fake/openai/catalogue", { mode: "malformed" });
    expect(await hubErr(listModels(def, creds))).toMatchObject({ code: "AI_CATALOGUE_MALFORMED" });
    await post("/__fake/openai/catalogue", { mode: "outage" });
    expect(await hubErr(listModels(def, creds))).toMatchObject({ code: "AI_PROVIDER_ERROR" });
    expect(() => parseModelsPage({ data: "nope" })).toThrowError(expect.objectContaining({ code: "AI_CATALOGUE_MALFORMED" }));
    expect(() => parseModelsPage({ data: [{ id: "x y" }] })).toThrowError(expect.objectContaining({ code: "AI_CATALOGUE_MALFORMED" }));
  });
});

describe("host policy (SSRF)", () => {
  it("only the registry host over https; no IPs (v4/v6), other hosts, http or userinfo", () => {
    expect(assertAllowedUrl(def, "https://api.openai.com/v1/models").host).toBe("api.openai.com");
    for (const bad of ["http://api.openai.com/v1", "https://evil.example/v1", "https://api.openai.com.evil.example/v1", "https://169.254.169.254/latest", "https://[::1]/v1", "https://[fd00:ec2::254]/", "https://user:pass@api.openai.com/v1", "https://10.0.0.5/v1"]) {
      expect(() => assertAllowedUrl(def, bad), bad).toThrowError(expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }));
    }
  });

  it("the test double override applies ONLY with FLOWLINE_ENV=test; custom endpoints are refused", () => {
    expect(resolveBaseUrl(def)).toBe(`${ai.url}/openai/v1`);
    process.env.FLOWLINE_ENV = "staging";
    try {
      expect(resolveBaseUrl(def)).toBe("https://api.openai.com/v1");
      expect(() => assertAllowedUrl(def, `${ai.url}/openai/v1/models`)).toThrowError(expect.objectContaining({ code: "AI_EGRESS_BLOCKED" }));
    } finally {
      process.env.FLOWLINE_ENV = "test";
    }
    expect(() => resolveBaseUrl(def, { baseUrl: "https://my-proxy.example/v1" })).toThrowError(expect.objectContaining({ code: "AI_CUSTOM_ENDPOINT_NOT_APPROVED" }));
    expect(() => resolveBaseUrl(getProviderDef("opencode-zen")!)).toThrowError(expect.objectContaining({ code: "AI_PROVIDER_NOT_AVAILABLE" }));
  });
});
