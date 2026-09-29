import type { ProviderDefinition } from "../registry";
import { HubError, type AiModelCapabilities, type DiscoveredModel, type HubChatRequest, type HubToolCall, type NormalisedResult } from "../types";
import { extras, usageFields } from "./openai-chat";
import { mapInBandError, num, SAFETY_FINISH, safetyRefusal, structuredOutputMode, validateRequest, type SseEvent } from "./shared";

/**
 * Gemini API native protocol (generativelanguage.googleapis.com/v1beta):
 *   POST /models/{model}:generateContent            (x-goog-api-key header — the key never goes in the URL)
 *   POST /models/{model}:streamGenerateContent?alt=sse
 *   GET  /models?pageSize=&pageToken=                (inputTokenLimit, outputTokenLimit, supportedGenerationMethods, thinking)
 * Sources: https://ai.google.dev/api/generate-content, https://ai.google.dev/api/models.
 *
 * Structured output: generationConfig.responseMimeType "application/json" + responseSchema, only when SUPPORTED.
 * Usage: promptTokenCount includes cachedContentTokenCount → inputTokens = prompt − cached; candidatesTokenCount =
 * output. The reasoning field (`thoughtsTokenCount`) is UNVERIFIED in the research: when present it is recorded as
 * reasoning tokens IN ADDITION to candidates (conservative for budgets; to be confirmed by live certification).
 * Parts marked `thought: true` are dropped. Blocked prompts (promptFeedback.blockReason) / SAFETY finishes → refusal.
 */

export function buildGeminiBody(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities, opts: { stream?: boolean } = {}): Record<string, unknown> {
  validateRequest(def, model, req, caps, opts.stream);
  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = [];
  const push = (role: "user" | "model", parts: Record<string, unknown>[]) => {
    if (!parts.length) return;
    const last = contents.at(-1);
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };
  for (const m of req.messages) {
    if (m.role === "user") push("user", [{ text: m.content }]);
    else if (m.role === "assistant") push("model", [...(m.content ? [{ text: m.content }] : []), ...(m.toolCalls ?? []).map((c) => ({ functionCall: { name: c.name, args: c.arguments } }))]);
    else push("user", [{ functionResponse: { name: m.name, response: { content: m.content } } }]);
  }
  const generationConfig: Record<string, unknown> = { maxOutputTokens: req.maxTokens };
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (structuredOutputMode(caps, req.schema) === "native") {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = req.schema;
  }
  const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: req.system }] }, contents, generationConfig };
  if (req.tools?.length) body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
  return body;
}

type GUsage = { promptTokenCount?: unknown; cachedContentTokenCount?: unknown; candidatesTokenCount?: unknown; thoughtsTokenCount?: unknown };

function normaliseUsage(u: GUsage | undefined | null) {
  if (!u || typeof u !== "object") return null;
  const prompt = num(u.promptTokenCount) ?? 0;
  const cached = num(u.cachedContentTokenCount);
  return { inputTokens: Math.max(0, prompt - (cached ?? 0)), cacheReadTokens: cached, cacheWriteTokens: null, outputTokens: num(u.candidatesTokenCount) ?? 0, reasoningTokens: num(u.thoughtsTokenCount) };
}

type Candidate = { content?: { parts?: { text?: unknown; thought?: unknown; functionCall?: { name?: unknown; args?: unknown } }[] }; finishReason?: unknown };

function readParts(c: Candidate | undefined, into: { text: string; calls: HubToolCall[] }, onText?: (t: string) => void) {
  for (const p of c?.content?.parts ?? []) {
    if (!p || typeof p !== "object" || p.thought === true) continue;
    if (typeof p.text === "string") {
      into.text += p.text;
      onText?.(p.text);
    } else if (p.functionCall && typeof p.functionCall.name === "string" && p.functionCall.name) {
      const args = p.functionCall.args && typeof p.functionCall.args === "object" && !Array.isArray(p.functionCall.args) ? (p.functionCall.args as Record<string, unknown>) : {};
      into.calls.push({ id: `call_${into.calls.length}`, name: p.functionCall.name, arguments: args });
    }
  }
}

function blocked(def: ProviderDefinition, d: { promptFeedback?: { blockReason?: unknown } }) {
  const r = d.promptFeedback?.blockReason;
  if (typeof r === "string" && r) throw safetyRefusal(def, r);
}

export function parseGeminiResponse(def: ProviderDefinition, requestedModel: string, body: unknown): NormalisedResult {
  const d = (body ?? {}) as { error?: unknown; candidates?: Candidate[]; usageMetadata?: GUsage; modelVersion?: unknown; promptFeedback?: { blockReason?: unknown } };
  if (d.error && typeof d.error === "object") throw mapInBandError(def, requestedModel, d);
  blocked(def, d);
  if (!Array.isArray(d.candidates) || !d.candidates.length) throw new HubError("AI_BAD_RESPONSE", `${def.name} returned no candidates`, { retryable: true, possibleCharge: true });
  const acc = { text: "", calls: [] as HubToolCall[] };
  readParts(d.candidates[0], acc);
  const finishReason = typeof d.candidates[0]?.finishReason === "string" ? d.candidates[0].finishReason : null;
  if (!acc.text && !acc.calls.length && finishReason && SAFETY_FINISH.has(finishReason.toLowerCase())) throw safetyRefusal(def, finishReason);
  return {
    text: acc.text,
    toolCalls: acc.calls,
    finishReason,
    model: typeof d.modelVersion === "string" && d.modelVersion ? d.modelVersion : requestedModel,
    ...usageFields(normaliseUsage(d.usageMetadata)),
    ...extras(undefined, null),
  };
}

/** streamGenerateContent?alt=sse: each `data:` is a GenerateContentResponse chunk; the last carries finishReason + usage. */
export function geminiStream(def: ProviderDefinition, requestedModel: string, onText: (t: string) => void) {
  const acc = { text: "", calls: [] as HubToolCall[] };
  let finishReason: string | null = null;
  let usage: GUsage | null = null;
  let model = requestedModel;
  return {
    onEvent(e: SseEvent) {
      let d: { error?: unknown; candidates?: Candidate[]; usageMetadata?: GUsage; modelVersion?: unknown; promptFeedback?: { blockReason?: unknown } };
      try {
        d = JSON.parse(e.data) as typeof d;
      } catch {
        return;
      }
      if (d.error && typeof d.error === "object") throw mapInBandError(def, requestedModel, d);
      blocked(def, d);
      if (typeof d.modelVersion === "string" && d.modelVersion) model = d.modelVersion;
      if (d.usageMetadata) usage = d.usageMetadata;
      const c = d.candidates?.[0];
      readParts(c, acc, onText);
      if (typeof c?.finishReason === "string") finishReason = c.finishReason;
    },
    result(): NormalisedResult {
      if (!finishReason) throw new HubError("AI_STREAM_INTERRUPTED", `${def.name} ended the stream before a finish reason`, { retryable: true, possibleCharge: true });
      if (!acc.text && !acc.calls.length && SAFETY_FINISH.has(finishReason.toLowerCase())) throw safetyRefusal(def, finishReason);
      return { text: acc.text, toolCalls: acc.calls, finishReason, model, ...usageFields(normaliseUsage(usage)), ...extras(undefined, null) };
    },
  };
}

/** One page of GET /models: only models whose supportedGenerationMethods include generateContent; "models/" prefix stripped. */
export function parseGeminiModelsPage(body: unknown): { models: DiscoveredModel[]; next: string | null } {
  const d = body as { models?: unknown; nextPageToken?: unknown };
  if (!d || typeof d !== "object" || (d.models !== undefined && !Array.isArray(d.models))) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (no models array)");
  const models: DiscoveredModel[] = [];
  for (const m of (d.models ?? []) as { name?: unknown; inputTokenLimit?: unknown; outputTokenLimit?: unknown; supportedGenerationMethods?: unknown; thinking?: unknown }[]) {
    const name = typeof m?.name === "string" ? m.name.replace(/^models\//, "") : null;
    if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) throw new HubError("AI_CATALOGUE_MALFORMED", "The model list is malformed (an entry has no valid name)");
    const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
    if (!methods.includes("generateContent")) continue;
    models.push({
      id: name,
      ownedBy: "google",
      contextWindow: num(m.inputTokenLimit),
      maxOutputTokens: num(m.outputTokenLimit),
      capabilities: { streaming: methods.includes("streamGenerateContent") ? "SUPPORTED" : "UNKNOWN", ...(typeof m.thinking === "boolean" ? { reasoning: m.thinking ? "SUPPORTED" : "UNSUPPORTED" } : {}) },
    });
  }
  return { models, next: typeof d.nextPageToken === "string" && d.nextPageToken ? d.nextPageToken : null };
}
