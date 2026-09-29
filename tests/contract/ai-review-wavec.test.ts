import { describe, expect, it } from "vitest";
import { messagesStream, parseMessagesResponse } from "@/ai/hub/protocols/anthropic-messages";
import { cohereStream, parseCohereResponse } from "@/ai/hub/protocols/cohere-v2";
import { geminiStream, parseGeminiResponse } from "@/ai/hub/protocols/gemini";
import { parseOpenRouterModels, parseVercelModels, perTokenUsdToMicrosPerM } from "@/ai/hub/protocols/listings";
import { chatStream, parseChatResponse } from "@/ai/hub/protocols/openai-chat";
import { parseResponsesResponse, responsesStream } from "@/ai/hub/protocols/openai-responses";
import { createSseParser, mapProviderError, safetyRefusal, scrubHubError, type SseEvent } from "@/ai/hub/protocols/shared";
import { isVerifiedZeroPrice, resolvePrice } from "@/ai/hub/pricing";
import { getProviderDef } from "@/ai/hub/registry";
import { HubError } from "@/ai/hub/types";

/**
 * Regression tests for the Codex Wave C review (artifacts/ai-hub/wavec-84f2cc1/CODEX-REVIEW.md), protocol level:
 * CXH-08 (unknown usage is not zero), CXH-09 (malformed listing prices), CXH-15 (stream / tool-call integrity) and
 * CXH-16 (provider error disclosure). Each case is the review's concrete scenario on documented-shape fixtures.
 */
const P = (id: string) => getProviderDef(id)!;

function feed(acc: { onEvent(e: SseEvent): void }, text: string) {
  const p = createSseParser((e) => acc.onEvent(e));
  p.push(new TextEncoder().encode(text));
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

describe("CXH-08: missing or partial usage is UNKNOWN, never zero — every adapter", () => {
  const ok = { message: { content: "hi" }, finish_reason: "stop" };
  it("openai-chat: usage:{} and a missing completion count are unknown; a complete usage is reported", () => {
    expect(parseChatResponse(P("openai"), "m", { choices: [ok], usage: {} })).toMatchObject({ usageReported: false });
    expect(parseChatResponse(P("openai"), "m", { choices: [ok], usage: { prompt_tokens: 12 } })).toMatchObject({ usageReported: false });
    expect(parseChatResponse(P("openai"), "m", { choices: [ok], usage: { prompt_tokens: "12", completion_tokens: 3 } })).toMatchObject({ usageReported: false });
    // Cached tokens larger than the prompt: inconsistent → unknown (not clamped to 0).
    expect(parseChatResponse(P("openai"), "m", { choices: [ok], usage: { prompt_tokens: 5, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 9 } } })).toMatchObject({ usageReported: false });
    const full = parseChatResponse(P("openai"), "m", { choices: [ok], usage: { prompt_tokens: 12, completion_tokens: 3 } });
    expect(full.usageReported).not.toBe(false);
    expect(full.usage).toMatchObject({ inputTokens: 12, outputTokens: 3 });
  });
  it("openai-chat stream: a usage chunk without token counts is unknown", () => {
    const acc = chatStream(P("openai"), "m", () => {});
    feed(acc, sse([{ data: { choices: [{ delta: { content: "x" }, finish_reason: "stop" }] } }, { data: { choices: [], usage: {} } }, { data: "[DONE]" }]));
    expect(acc.result()).toMatchObject({ usageReported: false });
  });
  it("openai-responses, anthropic-messages, gemini and cohere-v2: empty / partial usage is unknown", () => {
    const out = [{ type: "message", content: [{ type: "output_text", text: "hi" }] }];
    expect(parseResponsesResponse(P("openai"), "m", { status: "completed", output: out, usage: {} })).toMatchObject({ usageReported: false });
    expect(parseResponsesResponse(P("openai"), "m", { status: "completed", output: out, usage: { input_tokens: 4 } })).toMatchObject({ usageReported: false });
    expect(parseMessagesResponse(P("anthropic"), "m", { content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: {} })).toMatchObject({ usageReported: false });
    expect(parseMessagesResponse(P("anthropic"), "m", { content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { output_tokens: 2 } })).toMatchObject({ usageReported: false });
    expect(parseGeminiResponse(P("gemini"), "m", { candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }], usageMetadata: {} })).toMatchObject({ usageReported: false });
    expect(parseGeminiResponse(P("gemini"), "m", { candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5 } })).toMatchObject({ usageReported: false });
    expect(parseCohereResponse(P("cohere"), "m", { message: { content: [{ type: "text", text: "hi" }] }, finish_reason: "COMPLETE", usage: { billed_units: {} } })).toMatchObject({ usageReported: false });
    expect(parseCohereResponse(P("cohere"), "m", { message: { content: [{ type: "text", text: "hi" }] }, finish_reason: "COMPLETE", usage: { billed_units: { input_tokens: 3 } } })).toMatchObject({ usageReported: false });
    // Complete usage stays reported.
    expect(parseMessagesResponse(P("anthropic"), "m", { content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 2 } }).usageReported).not.toBe(false);
  });
});

describe("CXH-09: FREE_ONLY price integrity — malformed listing prices are unknown", () => {
  it("blank / whitespace / non-numeric price strings are not a price (not zero)", () => {
    for (const bad of ["", " ", "\t", "abc", "0x0", "Infinity", "NaN", "1e", " 0", "0 ", "-0.1", "-1", null, undefined, {}]) expect(perTokenUsdToMicrosPerM(bad), JSON.stringify(bad)).toBeUndefined();
    expect(perTokenUsdToMicrosPerM("0")).toBe(0);
    expect(perTokenUsdToMicrosPerM("0.000001")).toBe(1_000_000);
    expect(perTokenUsdToMicrosPerM("1e-6")).toBe(1_000_000);
    expect(perTokenUsdToMicrosPerM(0)).toBe(0);
  });
  it("an OpenRouter entry priced prompt:\"\", completion:\" \" is unknown, so it is never a verified-free route", () => {
    const { models } = parseOpenRouterModels({ data: [{ id: "vendor/blank", pricing: { prompt: "", completion: " " } }], total_count: 1 }, 0);
    expect(models[0]!.pricing).toBeNull();
    const price = resolvePrice({}, "openrouter", "vendor/blank", models[0]!.pricing, { currency: "USD" });
    expect(price).toBeNull();
    expect(isVerifiedZeroPrice(price)).toBe(false);
    const v = parseVercelModels({ data: [{ id: "a/b", pricing: { input: "", output: "" } }] });
    expect(v.models[0]!.pricing).toBeNull();
  });
  it("a snapshot whose numbers aren't finite is never verified free", () => {
    expect(isVerifiedZeroPrice({ inputPerMTokMicros: Number.NaN, outputPerMTokMicros: 0, source: "catalogue" })).toBe(false);
    expect(isVerifiedZeroPrice({ inputPerMTokMicros: 0, outputPerMTokMicros: 0, source: "catalogue" })).toBe(true);
  });
});

describe("CXH-15: stream and tool-call integrity — every adapter", () => {
  it("openai-chat: a malformed data chunk between valid content and a valid finish fails the attempt (no shortened answer)", () => {
    const acc = chatStream(P("openai"), "m", () => {});
    const e = err(() => feed(acc, sse([{ data: { choices: [{ delta: { content: "Hel" } }] } }, { data: "{not json" }, { data: { choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] } }, { data: "[DONE]" }])));
    expect(e).toMatchObject({ code: "AI_BAD_RESPONSE", retryable: true, possibleCharge: true });
  });
  it("documented keep-alives (comments, empty data) are still accepted", () => {
    const acc = chatStream(P("deepseek"), "m", () => {});
    feed(acc, `: keep-alive\n\n${sse([{ data: { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] } }])}data:\n\ndata: [DONE]\n\n`);
    expect(acc.result().text).toBe("ok");
  });
  it("openai-responses, anthropic, gemini and cohere streams reject malformed chunks too", () => {
    for (const make of [() => responsesStream(P("openai"), "m", () => {}), () => messagesStream(P("anthropic"), "m", () => {}), () => geminiStream(P("gemini"), "m", () => {}), () => cohereStream(P("cohere"), "m", () => {})]) {
      const acc = make();
      expect(err(() => feed(acc, "data: {\"broken\":\n\n"))).toMatchObject({ code: "AI_BAD_RESPONSE" });
    }
  });
  it("a stream that ends without a finish reason is discarded even after [DONE]", () => {
    const acc = chatStream(P("openai"), "m", () => {});
    feed(acc, sse([{ data: { choices: [{ delta: { content: "partial" } }] } }, { data: "[DONE]" }]));
    expect(err(() => acc.result())).toMatchObject({ code: "AI_STREAM_INTERRUPTED" });
  });
  it("invalid tool-argument JSON is rejected (not turned into {}); valid empty arguments stay {}", () => {
    const call = (args: unknown) => ({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "lookup", arguments: args } }] }, finish_reason: "tool_calls" }] });
    expect(err(() => parseChatResponse(P("openai"), "m", call('{"q":')))).toMatchObject({ code: "AI_BAD_RESPONSE", possibleCharge: true });
    expect(err(() => parseChatResponse(P("openai"), "m", call("[1,2]")))).toMatchObject({ code: "AI_BAD_RESPONSE" });
    expect(parseChatResponse(P("openai"), "m", call("{}")).toolCalls[0]!.arguments).toEqual({});
    expect(parseChatResponse(P("openai"), "m", call('{"q":"x"}')).toolCalls[0]!.arguments).toEqual({ q: "x" });

    const s = chatStream(P("openai"), "m", () => {});
    feed(s, sse([{ data: { choices: [{ delta: { tool_calls: [{ index: 0, id: "a", function: { name: "lookup", arguments: '{"q":' } }] } }] } }, { data: { choices: [{ delta: {}, finish_reason: "tool_calls" }] } }, { data: "[DONE]" }]));
    expect(err(() => s.result())).toMatchObject({ code: "AI_BAD_RESPONSE" });

    expect(err(() => parseResponsesResponse(P("openai"), "m", { status: "completed", output: [{ type: "function_call", call_id: "c", name: "lookup", arguments: "{oops" }] }))).toMatchObject({ code: "AI_BAD_RESPONSE" });
    expect(err(() => parseCohereResponse(P("cohere"), "m", { message: { tool_calls: [{ id: "c", function: { name: "lookup", arguments: '{"q"' } }] }, finish_reason: "TOOL_CALL" }))).toMatchObject({ code: "AI_BAD_RESPONSE" });

    const a = messagesStream(P("anthropic"), "m", () => {});
    feed(
      a,
      sse([
        { event: "message_start", data: { type: "message_start", message: { model: "m", usage: { input_tokens: 1, output_tokens: 1 } } } },
        { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t", name: "lookup" } } },
        { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"q":' } } },
        { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } } },
        { event: "message_stop", data: { type: "message_stop" } },
      ]),
    );
    expect(err(() => a.result())).toMatchObject({ code: "AI_BAD_RESPONSE" });
    expect(err(() => parseMessagesResponse(P("anthropic"), "m", { content: [{ type: "tool_use", id: "t", name: "lookup", input: "not an object" }], stop_reason: "tool_use" }))).toMatchObject({ code: "AI_BAD_RESPONSE" });
  });
});

describe("CXH-16: provider error disclosure", () => {
  const H = new Headers();
  it("an unknown provider error code (a lowercase secret canary) is never rendered", () => {
    const canary = "zq9canary0secret1value";
    const e = mapProviderError(P("openai"), "m", 400, H, { error: { code: canary, message: `bad ${canary}` } });
    expect(e.code).toBe("AI_BAD_REQUEST");
    expect(e.message).not.toContain(canary);
    const q = mapProviderError(P("openai"), "m", 402, H, { error: { type: canary } });
    expect(q.message).not.toContain(canary);
  });
  it("allowlisted identifiers are still named (fixed vocabulary)", () => {
    expect(mapProviderError(P("openai"), "m", 429, H, { error: { code: "insufficient_quota" } }).message).toContain("insufficient_quota");
  });
  it("safety reasons are rendered only from the documented vocabulary", () => {
    expect(safetyRefusal(P("gemini"), "SAFETY").message).toContain("safety");
    const r = safetyRefusal(P("gemini"), "leak-this-text sk-abc123");
    expect(r.message).not.toContain("leak-this-text");
    expect(r.message).not.toContain("sk-abc123");
  });
  it("the submitted credential is scrubbed from anything returned (defence in depth)", () => {
    const key = "abcdefghijklmnop0123456789";
    const e = scrubHubError(new HubError("AI_BAD_REQUEST", `rejected ${key} and ${key.toUpperCase()}`), key);
    expect(e.message).not.toContain(key);
    expect((e as HubError).code).toBe("AI_BAD_REQUEST");
  });
});
