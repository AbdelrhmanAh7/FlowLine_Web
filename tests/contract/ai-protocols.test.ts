import { describe, expect, it } from "vitest";
import { buildMessagesBody, messagesStream, parseAnthropicModelsPage, parseMessagesResponse } from "@/ai/hub/protocols/anthropic-messages";
import { buildCohereBody, cohereStream, parseCohereModelsPage, parseCohereResponse } from "@/ai/hub/protocols/cohere-v2";
import { buildGeminiBody, geminiStream, parseGeminiModelsPage, parseGeminiResponse } from "@/ai/hub/protocols/gemini";
import { parseCloudflareModels, parseDeepInfraModels, parseFireworksModels, parseOpenRouterModels, parseVercelModels, perTokenUsdToMicrosPerM } from "@/ai/hub/protocols/listings";
import { buildChatBody, chatStream, normaliseChatUsage, parseChatResponse, parseModelsPage } from "@/ai/hub/protocols/openai-chat";
import { buildResponsesBody, parseResponsesResponse, responsesStream } from "@/ai/hub/protocols/openai-responses";
import { createSseParser, mapProviderError, type SseEvent } from "@/ai/hub/protocols/shared";
import { getProviderDef } from "@/ai/hub/registry";
import { HubError, UNKNOWN_CAPABILITIES, type AiModelCapabilities, type HubChatRequest } from "@/ai/hub/types";

/**
 * Contract: every protocol's request build, response + usage normalisation (non-overlapping tokens), streaming
 * accumulator (deltas, tool-call fragments, terminal event, mid-stream errors, cut streams) and the provider error
 * quirks recorded in the research (artifacts/ai-hub/research/providers-2026-09-29.md). Documented-shape fixtures only.
 */
const P = (id: string) => getProviderDef(id)!;
const SUPPORTED: AiModelCapabilities = { tools: "SUPPORTED", structuredOutput: "SUPPORTED", vision: "UNKNOWN", streaming: "SUPPORTED", reasoning: "UNKNOWN" };
const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
const tools = [{ name: "lookup", description: "Look up", parameters: { type: "object", properties: { q: { type: "string" } } } }];
const convo: HubChatRequest = {
  system: "sys",
  maxTokens: 64,
  temperature: 0,
  messages: [
    { role: "user", content: "q" },
    { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "lookup", arguments: { q: "x" } }] },
    { role: "tool", toolCallId: "c1", name: "lookup", content: "result" },
  ],
};

function feed(acc: { onEvent(e: SseEvent): void }, text: string) {
  const p = createSseParser((e) => acc.onEvent(e));
  const bytes = new TextEncoder().encode(text);
  // Deliver in 7-byte slices to exercise chunk boundaries.
  for (let i = 0; i < bytes.length; i += 7) p.push(bytes.slice(i, i + 7));
  p.end();
}
const sse = (events: { event?: string; data: unknown }[]) => events.map((e) => `${e.event ? `event: ${e.event}\n` : ""}data: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}\n\n`).join("");
function err(fn: () => unknown): HubError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(HubError);
    return e as HubError;
  }
  throw new Error("expected a HubError");
}

describe("SSE parser", () => {
  it("handles chunk boundaries, CRLF, comments/keep-alives and multi-line data", () => {
    const got: SseEvent[] = [];
    const p = createSseParser((e) => got.push(e));
    const text = ": keep-alive\r\n\r\nevent: a\r\ndata: {\"x\":\r\ndata: 1}\r\n\r\ndata: [DONE]\n\n";
    for (const ch of text) p.push(new TextEncoder().encode(ch));
    p.end();
    expect(got).toEqual([
      { event: "a", data: '{"x":\n1}' },
      { event: null, data: "[DONE]" },
    ]);
  });
});

describe("openai-chat (compatible providers)", () => {
  it("max-tokens field and stream_options follow each provider's documentation", () => {
    expect(buildChatBody(P("openai"), "m", convo, UNKNOWN_CAPABILITIES, { stream: true })).toMatchObject({ max_completion_tokens: 64, stream: true, stream_options: { include_usage: true } });
    const ds = buildChatBody(P("deepseek"), "m", convo, UNKNOWN_CAPABILITIES, { stream: true });
    expect(ds).toMatchObject({ max_tokens: 64, stream: true });
    expect(ds.stream_options).toBeUndefined(); // not documented for DeepSeek → not sent
  });

  it("usage quirks: DeepSeek cache-hit tokens, Moonshot cache writes, OpenRouter cost + serving provider", () => {
    expect(normaliseChatUsage({ prompt_tokens: 100, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 10 } })).toEqual({ inputTokens: 40, cacheReadTokens: 60, cacheWriteTokens: null, outputTokens: 20, reasoningTokens: 10 });
    expect(normaliseChatUsage({ prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 } })).toMatchObject({ inputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 30 });
    const r = parseChatResponse(P("openrouter"), "m", { model: "openai/x", provider: "Azure", choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0.00042 } });
    expect(r).toMatchObject({ providerCostMicros: 420, servingProvider: "Azure" });
    // A direct provider never claims a serving provider or a reported cost.
    expect(parseChatResponse(P("openai"), "m", { provider: "x", choices: [{ message: { content: "hi" } }], usage: { cost: 1 } })).not.toHaveProperty("servingProvider");
  });

  it("in-band errors: an OpenRouter error in a 200 body, and MiniMax base_resp (1008 = no balance)", () => {
    expect(err(() => parseChatResponse(P("openrouter"), "m", { error: { code: 402, message: "Insufficient credits" } }))).toMatchObject({ code: "AI_QUOTA_EXCEEDED", retryable: false });
    expect(err(() => parseChatResponse(P("minimax"), "m", { base_resp: { status_code: 1008, status_msg: "insufficient balance" } }))).toMatchObject({ code: "AI_QUOTA_EXCEEDED", retryable: false });
    expect(err(() => parseChatResponse(P("minimax"), "m", { base_resp: { status_code: 2049, status_msg: "invalid api key" } }))).toMatchObject({ code: "AI_AUTH_FAILED" });
    expect(parseChatResponse(P("minimax"), "m", { base_resp: { status_code: 0 }, choices: [{ message: { content: "ok" } }] }).text).toBe("ok");
  });

  it("a content-filter finish with no output is a safety refusal (never retried or routed elsewhere)", () => {
    expect(err(() => parseChatResponse(P("openai"), "m", { choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }))).toMatchObject({ code: "AI_SAFETY_REFUSAL", retryable: false });
  });

  it("streams text and assembles tool-call fragments; reasoning deltas are dropped; a cut stream is interrupted", () => {
    const deltas: string[] = [];
    const acc = chatStream(P("openai"), "m", (t) => deltas.push(t));
    feed(
      acc,
      sse([
        { data: { model: "m-1", choices: [{ delta: { content: "Hel", reasoning_content: "SECRET" } }] } },
        { data: { choices: [{ delta: { content: "lo" } }] } },
        { data: { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", function: { name: "look", arguments: '{"q":' } }] } }] } },
        { data: { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "up", arguments: '"x"}' } }] } }] } },
        { data: { choices: [{ delta: {}, finish_reason: "tool_calls" }] } },
        { data: { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4 } } },
        { data: "[DONE]" },
      ]),
    );
    const r = acc.result();
    expect(deltas.join("")).toBe("Hello");
    expect(r).toMatchObject({ text: "Hello", model: "m-1", finishReason: "tool_calls", toolCalls: [{ id: "call_a", name: "lookup", arguments: { q: "x" } }], usage: { inputTokens: 10, outputTokens: 4 } });
    expect(JSON.stringify(r)).not.toContain("SECRET");

    const cut = chatStream(P("openai"), "m", () => {});
    feed(cut, sse([{ data: { choices: [{ delta: { content: "par" } }] } }]));
    expect(err(() => cut.result())).toMatchObject({ code: "AI_STREAM_INTERRUPTED", retryable: true, possibleCharge: true });

    const noUsage = chatStream(P("deepseek"), "m", () => {});
    feed(noUsage, sse([{ data: { choices: [{ delta: { content: "x" }, finish_reason: "stop" }] } }, { data: "[DONE]" }]));
    expect(noUsage.result()).toMatchObject({ usageReported: false }); // tokens unknown, not 0
  });

  it("OpenRouter mid-stream error after the 200 raises the mapped error at once", () => {
    const acc = chatStream(P("openrouter"), "m", () => {});
    expect(() => feed(acc, sse([{ data: { choices: [{ delta: { content: "a" } }] } }, { data: { error: { code: 502, message: "Upstream", metadata: { error_type: "provider_error" } }, choices: [{ delta: {}, finish_reason: "error" }] } }]))).toThrowError(
      expect.objectContaining({ code: "AI_PROVIDER_ERROR", retryable: true, possibleCharge: true }),
    );
  });

  it("model list: bare arrays (Together) and context metadata are accepted; bad ids are malformed", () => {
    expect(parseModelsPage([{ id: "meta/llama", context_length: 131072, type: "chat" }]).models).toEqual([{ id: "meta/llama", ownedBy: null, contextWindow: 131072 }]);
    expect(() => parseModelsPage({ data: [{ id: "../../etc" }] })).toThrowError(expect.objectContaining({ code: "AI_CATALOGUE_MALFORMED" }));
  });
});

describe("openai-responses", () => {
  it("builds instructions + input items (function_call / function_call_output), text.format only when SUPPORTED", () => {
    const b = buildResponsesBody(P("openai"), "m", { ...convo, tools, schema }, SUPPORTED, { stream: true });
    expect(b).toMatchObject({ model: "m", instructions: "sys", max_output_tokens: 64, stream: true, text: { format: { type: "json_schema", name: "result", schema } } });
    expect(b.input).toEqual([
      { role: "user", content: "q" },
      { type: "function_call", call_id: "c1", name: "lookup", arguments: '{"q":"x"}' },
      { type: "function_call_output", call_id: "c1", output: "result" },
    ]);
    expect(b.tools).toEqual([{ type: "function", name: "lookup", description: "Look up", parameters: tools[0]!.parameters }]);
    expect(buildResponsesBody(P("openai"), "m", { ...convo, schema }, UNKNOWN_CAPABILITIES).text).toBeUndefined();
  });

  it("normalises usage (cached ⊂ input, reasoning ⊂ output), drops reasoning items, reads xAI cost_in_nano_usd", () => {
    const r = parseResponsesResponse(P("xai"), "grok", {
      model: "grok-4.7",
      status: "completed",
      output: [
        { type: "reasoning", summary: [{ type: "summary_text", text: "SECRET" }] },
        { type: "message", content: [{ type: "output_text", text: "Hi" }] },
        { type: "function_call", call_id: "fc1", name: "run", arguments: '{"n":1}' },
      ],
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 12 }, cost_in_nano_usd: 5_000_000, cost_in_usd_ticks: 99 },
    });
    expect(r).toMatchObject({ text: "Hi", finishReason: "tool_calls", toolCalls: [{ id: "fc1", name: "run", arguments: { n: 1 } }], usage: { inputTokens: 60, cacheReadTokens: 40, outputTokens: 18, reasoningTokens: 12 }, providerCostMicros: 5000 });
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(err(() => parseResponsesResponse(P("openai"), "m", { status: "failed", error: { code: "server_error" } }))).toMatchObject({ retryable: true });
  });

  it("stream: text deltas, then the completed response; failed/error events raise; no completion = interrupted", () => {
    const deltas: string[] = [];
    const acc = responsesStream(P("openai"), "m", (t) => deltas.push(t));
    const done = { model: "m", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Hello" }] }], usage: { input_tokens: 5, output_tokens: 2 } };
    feed(acc, sse([{ event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: "Hel" } }, { event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: "lo" } }, { event: "response.completed", data: { type: "response.completed", response: done } }]));
    expect(deltas.join("")).toBe("Hello");
    expect(acc.result().text).toBe("Hello");
    const bad = responsesStream(P("openai"), "m", () => {});
    expect(() => feed(bad, sse([{ event: "error", data: { type: "error", code: "rate_limit_exceeded" } }]))).toThrowError(expect.objectContaining({ code: "AI_RATE_LIMITED" }));
    const cut = responsesStream(P("openai"), "m", () => {});
    feed(cut, sse([{ event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: "x" } }]));
    expect(err(() => cut.result())).toMatchObject({ code: "AI_STREAM_INTERRUPTED" });
  });
});

describe("anthropic-messages (native)", () => {
  it("merges tool results into one user turn, sends input_schema, output_config only when SUPPORTED, never forces tool_choice", () => {
    const b = buildMessagesBody(P("anthropic"), "claude", { ...convo, tools, schema }, SUPPORTED);
    expect(b).toMatchObject({ model: "claude", system: "sys", max_tokens: 64, output_config: { format: { type: "json_schema", schema } } });
    expect(b.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "q" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "c1", name: "lookup", input: { q: "x" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "result" }] },
    ]);
    expect(b.tools).toEqual([{ name: "lookup", description: "Look up", input_schema: tools[0]!.parameters }]);
    expect(b.tool_choice).toBeUndefined();
    expect(buildMessagesBody(P("anthropic"), "claude", { ...convo, schema }, UNKNOWN_CAPABILITIES).output_config).toBeUndefined();
    expect(err(() => buildMessagesBody(P("anthropic"), "claude", { ...convo, temperature: 1.5 }, UNKNOWN_CAPABILITIES))).toMatchObject({ code: "AI_BAD_REQUEST" }); // rejected, not clamped
  });

  it("usage is already non-overlapping (uncached + cache read + cache write); thinking blocks are dropped", () => {
    const r = parseMessagesResponse(P("anthropic"), "claude", {
      type: "message",
      model: "claude-x",
      content: [{ type: "thinking", thinking: "SECRET" }, { type: "text", text: "Hi" }, { type: "tool_use", id: "tu1", name: "run", input: { a: 1 } }],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 5, output_tokens: 7 },
    });
    expect(r).toMatchObject({ text: "Hi", toolCalls: [{ id: "tu1", name: "run", arguments: { a: 1 } }], finishReason: "tool_use", usage: { inputTokens: 10, cacheReadTokens: 90, cacheWriteTokens: 5, outputTokens: 7, reasoningTokens: null } });
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(err(() => parseMessagesResponse(P("anthropic"), "c", { content: [], stop_reason: "refusal" }))).toMatchObject({ code: "AI_SAFETY_REFUSAL" });
  });

  it("stream: text + tool input_json fragments; an error event after the 200 (529 overloaded) raises; no message_stop = interrupted", () => {
    const deltas: string[] = [];
    const acc = messagesStream(P("anthropic"), "claude", (t) => deltas.push(t));
    feed(
      acc,
      sse([
        { event: "message_start", data: { type: "message_start", message: { model: "claude-x", usage: { input_tokens: 9, output_tokens: 1 } } } },
        { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "thinking" } } },
        { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "SECRET" } } },
        { event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "text" } } },
        { event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hi" } } },
        { event: "content_block_start", data: { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "tu", name: "run" } } },
        { event: "content_block_delta", data: { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"a":' } } },
        { event: "content_block_delta", data: { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "2}" } } },
        { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 12 } } },
        { event: "message_stop", data: { type: "message_stop" } },
      ]),
    );
    expect(deltas).toEqual(["Hi"]);
    expect(acc.result()).toMatchObject({ text: "Hi", model: "claude-x", toolCalls: [{ id: "tu", name: "run", arguments: { a: 2 } }], usage: { inputTokens: 9, outputTokens: 12 } });
    const over = messagesStream(P("anthropic"), "c", () => {});
    expect(() => feed(over, sse([{ event: "error", data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }]))).toThrowError(expect.objectContaining({ code: "AI_OVERLOADED", retryable: true, possibleCharge: true }));
    const cut = messagesStream(P("anthropic"), "c", () => {});
    feed(cut, sse([{ event: "message_start", data: { type: "message_start", message: { usage: { input_tokens: 1 } } } }]));
    expect(err(() => cut.result())).toMatchObject({ code: "AI_STREAM_INTERRUPTED" });
  });

  it("model list: cursor fields and per-model capabilities (structured_outputs, image input)", () => {
    const p = parseAnthropicModelsPage({ data: [{ id: "claude-a", max_input_tokens: 200000, max_tokens: 64000, capabilities: { structured_outputs: { supported: true }, image_input: false } }], has_more: true, last_id: "claude-a" });
    expect(p.next).toBe("claude-a");
    expect(p.models[0]).toMatchObject({ id: "claude-a", contextWindow: 200000, maxOutputTokens: 64000, capabilities: { tools: "SUPPORTED", structuredOutput: "SUPPORTED", vision: "UNSUPPORTED" } });
  });
});

describe("gemini (native generateContent)", () => {
  it("systemInstruction + user/model turns + functionResponse; responseSchema only when SUPPORTED", () => {
    const b = buildGeminiBody(P("gemini"), "g", { ...convo, tools, schema }, SUPPORTED);
    expect(b).toMatchObject({ systemInstruction: { parts: [{ text: "sys" }] }, generationConfig: { maxOutputTokens: 64, temperature: 0, responseMimeType: "application/json", responseSchema: schema } });
    expect(b.contents).toEqual([
      { role: "user", parts: [{ text: "q" }] },
      { role: "model", parts: [{ functionCall: { name: "lookup", args: { q: "x" } } }] },
      { role: "user", parts: [{ functionResponse: { name: "lookup", response: { content: "result" } } }] },
    ]);
    expect(b.tools).toEqual([{ functionDeclarations: [{ name: "lookup", description: "Look up", parameters: tools[0]!.parameters }] }]);
    expect((buildGeminiBody(P("gemini"), "g", { ...convo, schema }, UNKNOWN_CAPABILITIES).generationConfig as Record<string, unknown>).responseSchema).toBeUndefined();
  });

  it("usage: cached ⊂ prompt; thought parts dropped; thoughtsTokenCount kept as reasoning; blocked prompt = refusal", () => {
    const r = parseGeminiResponse(P("gemini"), "g", {
      modelVersion: "g-001",
      candidates: [{ content: { parts: [{ text: "SECRET", thought: true }, { text: "Hi" }, { functionCall: { name: "run", args: { a: 1 } } }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 30, candidatesTokenCount: 9, thoughtsTokenCount: 4 },
    });
    expect(r).toMatchObject({ text: "Hi", model: "g-001", toolCalls: [{ name: "run", arguments: { a: 1 } }], usage: { inputTokens: 70, cacheReadTokens: 30, outputTokens: 9, reasoningTokens: 4 } });
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(err(() => parseGeminiResponse(P("gemini"), "g", { promptFeedback: { blockReason: "SAFETY" } }))).toMatchObject({ code: "AI_SAFETY_REFUSAL" });
    expect(err(() => parseGeminiResponse(P("gemini"), "g", { candidates: [{ finishReason: "SAFETY" }] }))).toMatchObject({ code: "AI_SAFETY_REFUSAL" });
  });

  it("stream chunks accumulate until a finishReason; none = interrupted", () => {
    const acc = geminiStream(P("gemini"), "g", () => {});
    feed(acc, sse([{ data: { candidates: [{ content: { parts: [{ text: "He" }] } }] } }, { data: { candidates: [{ content: { parts: [{ text: "y" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } } }]));
    expect(acc.result()).toMatchObject({ text: "Hey", usage: { inputTokens: 3, outputTokens: 2 } });
    const cut = geminiStream(P("gemini"), "g", () => {});
    feed(cut, sse([{ data: { candidates: [{ content: { parts: [{ text: "He" }] } }] } }]));
    expect(err(() => cut.result())).toMatchObject({ code: "AI_STREAM_INTERRUPTED" });
  });

  it("model list: only generateContent models; models/ prefix stripped; pageToken cursor", () => {
    const p = parseGeminiModelsPage({ models: [{ name: "models/gemini-x", inputTokenLimit: 1000, outputTokenLimit: 100, supportedGenerationMethods: ["generateContent"], thinking: true }, { name: "models/embed", supportedGenerationMethods: ["embedContent"] }], nextPageToken: "t2" });
    expect(p).toEqual({ models: [{ id: "gemini-x", ownedBy: "google", contextWindow: 1000, maxOutputTokens: 100, capabilities: { streaming: "UNKNOWN", reasoning: "SUPPORTED" } }], next: "t2" });
  });
});

describe("cohere-v2 (native chat)", () => {
  it("system/user/assistant tool_calls/tool messages; json_object + json_schema only when SUPPORTED", () => {
    const b = buildCohereBody(P("cohere"), "command", { ...convo, tools, schema }, SUPPORTED, { stream: true });
    expect(b).toMatchObject({ model: "command", max_tokens: 64, stream: true, response_format: { type: "json_object", json_schema: schema } });
    expect(b.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "q" },
      { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "lookup", arguments: '{"q":"x"}' } }] },
      { role: "tool", tool_call_id: "c1", content: "result" },
    ]);
    expect(buildCohereBody(P("cohere"), "command", { ...convo, schema }, UNKNOWN_CAPABILITIES).response_format).toBeUndefined();
  });

  it("billed units are the usage; tool_plan text is dropped; typed stream events assemble tool calls", () => {
    const r = parseCohereResponse(P("cohere"), "command", { finish_reason: "TOOL_CALL", message: { tool_plan: "SECRET", tool_calls: [{ id: "t1", function: { name: "run", arguments: '{"a":1}' } }] }, usage: { billed_units: { input_tokens: 11, output_tokens: 3 }, tokens: { input_tokens: 99, output_tokens: 3 } } });
    expect(r).toMatchObject({ toolCalls: [{ id: "t1", name: "run", arguments: { a: 1 } }], usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: null } });
    expect(JSON.stringify(r)).not.toContain("SECRET");
    const acc = cohereStream(P("cohere"), "command", () => {});
    feed(
      acc,
      sse([
        { event: "tool-call-start", data: { type: "tool-call-start", index: 0, delta: { message: { tool_calls: { id: "t9", function: { name: "run", arguments: "" } } } } } },
        { event: "tool-call-delta", data: { type: "tool-call-delta", index: 0, delta: { message: { tool_calls: { function: { arguments: '{"a":' } } } } } },
        { event: "tool-call-delta", data: { type: "tool-call-delta", index: 0, delta: { message: { tool_calls: { function: { arguments: "5}" } } } } } },
        { event: "message-end", data: { type: "message-end", delta: { finish_reason: "TOOL_CALL", usage: { billed_units: { input_tokens: 4, output_tokens: 2 } } } } },
      ]),
    );
    expect(acc.result()).toMatchObject({ toolCalls: [{ id: "t9", name: "run", arguments: { a: 5 } }], usage: { inputTokens: 4, outputTokens: 2 } });
  });

  it("model list: endpoint filter honoured, next_page_token cursor", () => {
    expect(parseCohereModelsPage({ models: [{ name: "command-a", endpoints: ["chat"], context_length: 256000 }, { name: "embed-x", endpoints: ["embed"] }], next_page_token: "p2" })).toEqual({ models: [{ id: "command-a", ownedBy: "cohere", contextWindow: 256000 }], next: "p2" });
  });
});

describe("gateway / expansion listings", () => {
  it("OpenRouter: USD-per-token strings → micro-USD/M; variable (-1) = unknown; supported_parameters → tri-state", () => {
    expect(perTokenUsdToMicrosPerM("0.000001")).toBe(1_000_000);
    expect(perTokenUsdToMicrosPerM("0")).toBe(0);
    expect(perTokenUsdToMicrosPerM("-1")).toBeUndefined();
    const p = parseOpenRouterModels({ data: [{ id: "a/free:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] }, { id: "b/x", pricing: { prompt: "-1", completion: "-1" }, supported_parameters: ["temperature"] }], total_count: 5 }, 0);
    expect(p.next).toBe("2");
    expect(p.models[0]).toMatchObject({ id: "a/free:free", ownedBy: "a", pricing: { inputPerMTokMicros: 0, outputPerMTokMicros: 0, currency: "USD" }, capabilities: { tools: "SUPPORTED" } });
    expect(p.models[1]).toMatchObject({ pricing: null, capabilities: { tools: "UNSUPPORTED" } });
  });

  it("Vercel pricing + tags; DeepInfra skips deprecated/private (prices unknown); Fireworks pageToken; Cloudflare envelope paging", () => {
    expect(parseVercelModels({ data: [{ id: "openai/x", context_window: 1000, tags: ["tool-use"], pricing: { input: "0.000002", output: "0.000008", input_cache_read: "0.0000005" } }] }).models[0]).toMatchObject({ contextWindow: 1000, capabilities: { tools: "SUPPORTED" }, pricing: { inputPerMTokMicros: 2_000_000, outputPerMTokMicros: 8_000_000, cacheReadPerMTokMicros: 500_000 } });
    expect(parseDeepInfraModels([{ model_name: "a/b", max_tokens: 10 }, { model_name: "c/d", deprecated: 1700000000 }, { model_name: "e/f", private: true }]).models).toEqual([{ id: "a/b", ownedBy: "a", contextWindow: 10 }]);
    expect(parseFireworksModels({ models: [{ name: "accounts/fireworks/models/x", contextLength: 5, supportsTools: false }], nextPageToken: "n" })).toMatchObject({ next: "n", models: [{ id: "accounts/fireworks/models/x", capabilities: { tools: "UNSUPPORTED" } }] });
    expect(parseCloudflareModels({ success: true, result: [{ name: "@cf/meta/x" }] }, 1, 1).next).toBe("2");
    expect(() => parseCloudflareModels({ success: false, errors: [{}] }, 1, 100)).toThrowError(expect.objectContaining({ code: "AI_CATALOGUE_MALFORMED" }));
  });
});

describe("error quirks per provider (research record)", () => {
  const H = (h: Record<string, string> = {}) => new Headers(h);
  const cases: [string, number, unknown, Record<string, string>, string, boolean][] = [
    // provider, status, body, headers, expected code, retryable
    ["openai", 429, { error: { code: "insufficient_quota", type: "insufficient_quota" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["openai", 429, { error: { code: "rate_limit_exceeded" } }, { "retry-after": "2" }, "AI_RATE_LIMITED", true],
    ["openai", 403, { error: { message: "Country, region, or territory not supported" } }, {}, "AI_REGION_UNSUPPORTED", false],
    ["anthropic", 429, { type: "error", error: { type: "rate_limit_error", details: { error_code: "enforced_spend_limit_reached" } } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["anthropic", 429, { type: "error", error: { type: "rate_limit_error" } }, {}, "AI_QUOTA_EXCEEDED", false], // no retry-after = spend cap
    ["anthropic", 429, { type: "error", error: { type: "rate_limit_error" } }, { "retry-after": "3" }, "AI_RATE_LIMITED", true],
    ["anthropic", 529, { type: "error", error: { type: "overloaded_error" } }, {}, "AI_OVERLOADED", true],
    ["anthropic", 402, { type: "error", error: { type: "billing_error" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["anthropic", 413, { type: "error", error: { type: "request_too_large" } }, {}, "AI_REQUEST_TOO_LARGE", false],
    ["gemini", 402, { error: { code: 402, status: "payment_required" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["gemini", 429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ reason: "quota_exceeded" }] } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["gemini", 429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ reason: "rate_limit_exceeded" }] } }, {}, "AI_RATE_LIMITED", true],
    ["gemini", 400, { error: { code: 400, status: "FAILED_PRECONDITION", message: "billing disabled" } }, {}, "AI_ACCOUNT_ACTION_REQUIRED", false],
    ["groq", 498, { error: { message: "flex tier capacity exceeded" } }, {}, "AI_OVERLOADED", true],
    ["groq", 499, { error: { message: "Request Cancelled" } }, {}, "AI_CANCELLED", false],
    ["openrouter", 402, { error: { code: 402, message: "Insufficient credits" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["openrouter", 403, { error: { code: 403, message: "flagged" } }, {}, "AI_SAFETY_REFUSAL", false],
    ["openrouter", 503, { error: { code: 503 } }, {}, "AI_ROUTING_UNAVAILABLE", false],
    ["openrouter", 502, { error: { code: 502 } }, {}, "AI_PROVIDER_ERROR", true],
    ["mistral", 429, { message: "rate limited", type: "rate_limit" }, {}, "AI_RATE_LIMITED", true],
    ["cohere", 429, { message: "You are using a Trial key, which is limited to 40 API calls / minute." }, {}, "AI_TRIAL_KEY", false],
    ["cohere", 402, { message: "billing limit reached" }, {}, "AI_QUOTA_EXCEEDED", false],
    ["deepseek", 402, { error: { message: "Insufficient Balance", type: "unknown_error" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["deepseek", 503, { error: { message: "Server overloaded" } }, {}, "AI_PROVIDER_ERROR", true],
    ["zai", 429, { error: { code: "1113", message: "余额不足" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["zai", 429, { error: { code: "1302", message: "rate" } }, {}, "AI_RATE_LIMITED", true],
    ["zai", 429, { error: { code: "1305", message: "overloaded" } }, {}, "AI_OVERLOADED", true],
    ["zai", 429, { error: { code: "1309", message: "plan expired" } }, {}, "AI_PLAN_NOT_ALLOWED", false],
    ["zai", 429, { error: { code: "1315", message: "coding package" } }, {}, "AI_PLAN_NOT_ALLOWED", false],
    ["zai", 400, { error: { code: "1211", message: "model" } }, {}, "AI_MODEL_REMOVED", false],
    ["zai", 401, { error: { code: "1003", message: "expired" } }, {}, "AI_AUTH_FAILED", false],
    ["moonshot", 429, { error: { type: "exceeded_current_quota_error" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["moonshot", 429, { error: { type: "rate_limit_reached_error" } }, { "retry-after": "1" }, "AI_RATE_LIMITED", true],
    ["moonshot", 429, { error: { type: "engine_overloaded_error" } }, {}, "AI_OVERLOADED", true],
    ["moonshot", 400, { error: { type: "content_filter" } }, {}, "AI_SAFETY_REFUSAL", false],
    ["moonshot", 404, { error: { type: "resource_not_found_error" } }, {}, "AI_MODEL_REMOVED", false],
    ["dashscope", 400, { code: "Arrearage", message: "Access denied, please make sure your account is in good standing." }, {}, "AI_QUOTA_EXCEEDED", false],
    ["dashscope", 400, { error: { code: "DataInspectionFailed" } }, {}, "AI_SAFETY_REFUSAL", false],
    ["dashscope", 403, { code: "AllocationQuota.FreeTierOnly" }, {}, "AI_QUOTA_EXCEEDED", false],
    ["dashscope", 429, { code: "Throttling.AllocationQuota" }, {}, "AI_RATE_LIMITED", true],
    ["dashscope", 429, { code: "BudgetLimitExceeded" }, {}, "AI_QUOTA_EXCEEDED", false],
    ["dashscope", 404, { code: "ModelNotFound" }, {}, "AI_MODEL_REMOVED", false],
    ["dashscope", 401, { code: "InvalidApiKey" }, {}, "AI_AUTH_FAILED", false],
    ["together", 403, { error: { message: "Input validation error" } }, {}, "AI_CONTEXT_TOO_LONG", false],
    ["together", 402, { error: { message: "spending limit" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["vercel-gateway", 403, { error: { type: "customer_verification_required" } }, {}, "AI_ACCOUNT_ACTION_REQUIRED", false],
    ["vercel-gateway", 402, { error: { type: "quota_for_entity_exceeded" } }, {}, "AI_QUOTA_EXCEEDED", false],
    ["vercel-gateway", 429, { error: { message: "Rate limit exceeded", type: "rate_limit_exceeded" } }, { "retry-after": "4" }, "AI_RATE_LIMITED", true],
    ["cerebras", 408, {}, {}, "AI_TIMEOUT", true],
  ];
  it.each(cases)("%s %i → expected code", (provider, status, body, headers, code, retryable) => {
    const e = mapProviderError(P(provider), "m", status, H(headers), body);
    expect({ code: e.code, retryable: e.retryable }).toEqual({ code, retryable });
  });

  it("Retry-After is carried; provider error text is never passed through (it may echo the key)", () => {
    const e = mapProviderError(P("moonshot"), "m", 429, H({ "retry-after": "7" }), { error: { type: "rate_limit_reached_error", message: "key sk-live-SECRETSECRET is limited" } });
    expect(e.retryAfterMs).toBe(7000);
    expect(e.message).not.toContain("SECRET");
  });
});
