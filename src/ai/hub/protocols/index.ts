import { staticModels } from "../catalogue";
import { protocolFor, type ProviderDefinition, type Protocol } from "../registry";
import { hubFetch } from "../transport";
import { HubError, type AiModelCapabilities, type DiscoveredModel, type HubChatRequest, type NormalisedResult } from "../types";
import { buildMessagesBody, messagesStream, parseAnthropicModelsPage, parseMessagesResponse } from "./anthropic-messages";
import { buildCohereBody, cohereStream, parseCohereModelsPage, parseCohereResponse } from "./cohere-v2";
import { buildGeminiBody, geminiStream, parseGeminiModelsPage, parseGeminiResponse } from "./gemini";
import { parseCloudflareModels, parseDeepInfraModels, parseFireworksModels, parseOpenRouterModels, parseVercelModels } from "./listings";
import { buildChatBody, chatStream, paginate, parseChatResponse, parseModelsPage } from "./openai-chat";
import { buildResponsesBody, parseResponsesResponse, responsesStream } from "./openai-responses";
import { createSseParser, errorBody, mapProviderError, parseBody, pathModel, scrubHubError, type SseEvent } from "./shared";

export const IMPLEMENTED_PROTOCOLS: Protocol[] = ["openai-chat", "openai-responses", "anthropic-messages", "gemini", "cohere-v2"];

export interface Credentials {
  apiKey: string;
  settings: Record<string, string>;
}

interface StreamAcc {
  onEvent(e: SseEvent): void;
  result(): NormalisedResult;
}

interface Adapter {
  endpoint(def: ProviderDefinition, model: string, stream: boolean): { path: string; query?: Record<string, string> };
  build(def: ProviderDefinition, model: string, req: HubChatRequest, caps: AiModelCapabilities, opts: { stream?: boolean }): Record<string, unknown>;
  parse(def: ProviderDefinition, model: string, body: unknown): NormalisedResult;
  stream(def: ProviderDefinition, model: string, onText: (t: string) => void): StreamAcc;
}

const ADAPTERS: Record<Protocol, Adapter> = {
  "openai-chat": { endpoint: (def) => ({ path: def.paths?.["openai-chat"] ?? "/chat/completions" }), build: buildChatBody, parse: parseChatResponse, stream: chatStream },
  "openai-responses": { endpoint: (def) => ({ path: def.paths?.["openai-responses"] ?? "/responses" }), build: buildResponsesBody, parse: parseResponsesResponse, stream: responsesStream },
  "anthropic-messages": { endpoint: (def) => ({ path: def.paths?.["anthropic-messages"] ?? "/v1/messages" }), build: buildMessagesBody, parse: parseMessagesResponse, stream: messagesStream },
  gemini: {
    endpoint: (def, model, stream) => (stream ? { path: `/models/${pathModel(def, model)}:streamGenerateContent`, query: { alt: "sse" } } : { path: `/models/${pathModel(def, model)}:generateContent` }),
    build: buildGeminiBody,
    parse: parseGeminiResponse,
    stream: geminiStream,
  },
  "cohere-v2": { endpoint: (def) => ({ path: def.paths?.["cohere-v2"] ?? "/v2/chat" }), build: buildCohereBody, parse: parseCohereResponse, stream: cohereStream },
};

function requireProtocol(def: ProviderDefinition, protocol: Protocol) {
  if (!def.protocols.includes(protocol) || !IMPLEMENTED_PROTOCOLS.includes(protocol)) throw new HubError("AI_PROTOCOL_UNSUPPORTED", `${def.name} can't be called with the ${protocol} protocol`);
}

/** The protocol a connection's routes use (its explicit choice among the provider's protocols, else the default). */
export function primaryProtocol(def: ProviderDefinition, settings: Record<string, string> = {}): Protocol {
  const p = def.protocols.length ? protocolFor(def, settings) : undefined;
  if (!p || !IMPLEMENTED_PROTOCOLS.includes(p)) throw new HubError("AI_PROTOCOL_UNSUPPORTED", `${def.name} has no implemented protocol`);
  return p;
}

export interface CallOptions {
  /** Stream the answer (SSE). Deltas go to `onText`; the final result is only returned when the stream completed. */
  stream?: boolean;
  onText?: (t: string) => void;
  /** Set to true as soon as any response byte of a 2xx stream arrived (the provider may bill a cut stream). */
  progress?: { received: boolean };
}

/** Builds the request body for a protocol (exported for contract tests). */
export function buildBody(def: ProviderDefinition, protocol: Protocol, model: string, req: HubChatRequest, caps: AiModelCapabilities, stream = false) {
  requireProtocol(def, protocol);
  return ADAPTERS[protocol].build(def, model, req, caps, { stream });
}

/**
 * One provider call (no retries, no metering): request → HTTP → normalised result or a mapped HubError. Whatever it
 * raises never carries the submitted key (CXH-16, defence in depth).
 */
export async function callChat(def: ProviderDefinition, protocol: Protocol, creds: Credentials, model: string, req: HubChatRequest, caps: AiModelCapabilities, signal: AbortSignal, opts: CallOptions = {}): Promise<NormalisedResult> {
  try {
    return await callChatRaw(def, protocol, creds, model, req, caps, signal, opts);
  } catch (e) {
    throw scrubHubError(e, creds.apiKey);
  }
}

async function callChatRaw(def: ProviderDefinition, protocol: Protocol, creds: Credentials, model: string, req: HubChatRequest, caps: AiModelCapabilities, signal: AbortSignal, opts: CallOptions): Promise<NormalisedResult> {
  requireProtocol(def, protocol);
  const a = ADAPTERS[protocol];
  const stream = opts.stream === true;
  const body = a.build(def, model, req, caps, { stream });
  const { path, query } = a.endpoint(def, model, stream);
  if (!stream) {
    const res = await hubFetch(def, creds.apiKey, creds.settings, { method: "POST", path, query, json: body, signal });
    if (res.status >= 400) throw mapProviderError(def, model, res.status, res.headers, errorBody(res.text()));
    return a.parse(def, model, parseBody(def, res.text()));
  }
  const acc = a.stream(def, model, (t) => opts.onText?.(t));
  const sse = createSseParser((e) => acc.onEvent(e));
  const res = await hubFetch(def, creds.apiKey, creds.settings, {
    method: "POST",
    path,
    query,
    json: body,
    signal,
    maxBytes: 8 * 1024 * 1024,
    onChunk: (c) => {
      if (opts.progress) opts.progress.received = true;
      sse.push(c);
    },
  });
  if (res.status >= 400) throw mapProviderError(def, model, res.status, res.headers, errorBody(res.text()));
  sse.end();
  return acc.result();
}

/* ───────────── discovery ───────────── */

async function getJson(def: ProviderDefinition, creds: Credentials, path: string, query: Record<string, string | undefined>, signal: AbortSignal | undefined, fromOrigin = false): Promise<unknown> {
  const res = await hubFetch(def, creds.apiKey, creds.settings, { method: "GET", path, query, fromOrigin, timeoutMs: 20_000, signal });
  if (res.status === 404) throw new HubError("AI_CATALOGUE_UNAVAILABLE", `${def.name}'s model list isn't reachable (404)`, { httpStatus: 404 });
  if (res.status >= 400) throw mapProviderError(def, "(model list)", res.status, res.headers, errorBody(res.text()));
  try {
    return res.json();
  } catch {
    throw new HubError("AI_CATALOGUE_MALFORMED", "The model list isn't JSON");
  }
}

/**
 * How a provider's key can be checked WITHOUT a billable call (CXH-11):
 * - "listing": the model list is documented to require the key, so a successful listing proves it;
 * - "key-endpoint": a documented authenticated, non-billable key endpoint (the listing alone proves nothing);
 * - "public-listing": the model list is public (or its auth is unverified): it proves nothing about the key;
 * - "none": no model list at all (static catalogue).
 * Only the first two are key checks; otherwise the key stays UNVERIFIED until a disclosed inference test succeeds.
 */
export type KeyCheck = "listing" | "key-endpoint" | "public-listing" | "none";

export function keyCheckOf(def: ProviderDefinition): KeyCheck {
  const listing = def.discovery !== "static-catalogue" && def.discovery !== "none";
  if (def.keyCheckPath) return "key-endpoint";
  if (!listing) return "none";
  return def.listingAuth === "key-required" ? "listing" : "public-listing";
}

/** Whether a provider's key can be checked without a billable call. */
export function canCheckKey(def: ProviderDefinition) {
  const k = keyCheckOf(def);
  return k === "listing" || k === "key-endpoint";
}

/** The documented authenticated, non-billable key check (e.g. OpenRouter GET /key): 2xx with a JSON object, or a mapped error. */
export async function checkKeyEndpoint(def: ProviderDefinition, creds: Credentials, signal?: AbortSignal): Promise<void> {
  if (!def.keyCheckPath) throw new HubError("AI_KEY_NOT_CHECKABLE", `${def.name} has no key-check endpoint`);
  try {
    const body = await getJson(def, creds, def.keyCheckPath, {}, signal);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HubError("AI_CATALOGUE_MALFORMED", `${def.name}'s key check answered with an unexpected shape`);
  } catch (e) {
    throw scrubHubError(e, creds.apiKey);
  }
}

/**
 * Lists the models this credential can see (metadata only: never a billable inference). Providers without a
 * documented list endpoint (Z.ai, Alibaba) return their static, versioned catalogue — which proves nothing about the
 * key (see `canCheckKey`).
 */
export async function listModels(def: ProviderDefinition, creds: Credentials, signal?: AbortSignal): Promise<DiscoveredModel[]> {
  try {
    return await listModelsRaw(def, creds, signal);
  } catch (e) {
    throw scrubHubError(e, creds.apiKey);
  }
}

async function listModelsRaw(def: ProviderDefinition, creds: Credentials, signal?: AbortSignal): Promise<DiscoveredModel[]> {
  const path = def.discoveryPath ?? "/models";
  const origin = def.discoveryFromOrigin === true;
  switch (def.discovery) {
    case "openai-models-list":
      return paginate(async (after) => parseModelsPage(await getJson(def, creds, path, { after }, signal, origin)));
    case "anthropic-models-list":
      return paginate(async (after) => parseAnthropicModelsPage(await getJson(def, creds, path, { limit: "1000", after_id: after }, signal, origin)));
    case "gemini-models-list":
      return paginate(async (token) => parseGeminiModelsPage(await getJson(def, creds, path, { pageSize: "1000", pageToken: token }, signal, origin)));
    case "cohere-models-list":
      return paginate(async (token) => parseCohereModelsPage(await getJson(def, creds, path, { endpoint: "chat", page_size: "1000", page_token: token }, signal, origin)));
    case "openrouter-models-list":
      return paginate(async (off) => parseOpenRouterModels(await getJson(def, creds, path, { limit: "1000", offset: off }, signal, origin), Number(off ?? 0)));
    case "vercel-models-list":
      return paginate(async () => parseVercelModels(await getJson(def, creds, path, {}, signal, origin)));
    case "deepinfra-models-list":
      return paginate(async () => parseDeepInfraModels(await getJson(def, creds, path, {}, signal, origin)));
    case "fireworks-models-list":
      return paginate(async (token) => parseFireworksModels(await getJson(def, creds, path, { pageSize: "200", pageToken: token }, signal, origin)));
    case "cloudflare-models-search": {
      const perPage = 100;
      return paginate(async (page) => parseCloudflareModels(await getJson(def, creds, path, { page: page ?? "1", per_page: String(perPage) }, signal, origin), Number(page ?? 1), perPage));
    }
    case "static-catalogue":
      return staticModels(def.id);
    default:
      throw new HubError("AI_DISCOVERY_UNSUPPORTED", `${def.name} has no model listing`);
  }
}
