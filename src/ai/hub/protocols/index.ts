import type { ProviderDefinition, Protocol } from "../registry";
import { hubFetch } from "../transport";
import { HubError, type AiModelCapabilities, type DiscoveredModel, type HubChatRequest, type NormalisedResult } from "../types";
import * as openaiChat from "./openai-chat";

/** Protocols implemented so far. Wave B adds openai-responses, anthropic-messages, gemini, cohere-v2. */
export const IMPLEMENTED_PROTOCOLS: Protocol[] = ["openai-chat"];

export interface Credentials {
  apiKey: string;
  settings: Record<string, string>;
}

function requireProtocol(def: ProviderDefinition, protocol: Protocol) {
  if (!def.protocols.includes(protocol) || !IMPLEMENTED_PROTOCOLS.includes(protocol)) throw new HubError("AI_PROTOCOL_UNSUPPORTED", `${def.name} can't be called with the ${protocol} protocol yet`);
}

export function primaryProtocol(def: ProviderDefinition): Protocol {
  const p = def.protocols.find((x) => IMPLEMENTED_PROTOCOLS.includes(x));
  if (!p) throw new HubError("AI_PROTOCOL_UNSUPPORTED", `${def.name} has no implemented protocol yet`);
  return p;
}

/** One provider call (no retries, no metering): request → HTTP → normalised result or a mapped HubError. */
export async function callChat(def: ProviderDefinition, protocol: Protocol, creds: Credentials, model: string, req: HubChatRequest, caps: AiModelCapabilities, signal: AbortSignal): Promise<NormalisedResult> {
  requireProtocol(def, protocol);
  const body = openaiChat.buildChatBody(def, model, req, caps);
  const res = await hubFetch(def, creds.apiKey, creds.settings, { method: "POST", path: "/chat/completions", json: body, signal });
  if (res.status >= 400) throw openaiChat.mapChatError(def, model, res);
  let parsed: unknown;
  try {
    parsed = res.json();
  } catch {
    throw new HubError("AI_BAD_RESPONSE", `${def.name} returned a response that isn't JSON`, { retryable: true });
  }
  return openaiChat.parseChatResponse(def, model, parsed);
}

/** Lists the models this credential can see (metadata only: never a billable inference). */
export async function listModels(def: ProviderDefinition, creds: Credentials, signal?: AbortSignal): Promise<DiscoveredModel[]> {
  if (def.discovery !== "openai-models-list") throw new HubError("AI_DISCOVERY_UNSUPPORTED", `${def.name} has no model listing`);
  return openaiChat.listAllModels(async (after) => {
    const res = await hubFetch(def, creds.apiKey, creds.settings, { method: "GET", path: "/models", query: { after }, timeoutMs: 20_000, signal });
    if (res.status === 404) throw new HubError("AI_CATALOGUE_UNAVAILABLE", `${def.name}'s model list isn't reachable (404)`, { httpStatus: 404 });
    if (res.status >= 400) throw openaiChat.mapChatError(def, "(model list)", res);
    try {
      return res.json();
    } catch {
      throw new HubError("AI_CATALOGUE_MALFORMED", "The model list isn't JSON");
    }
  });
}
