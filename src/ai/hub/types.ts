import { NodeError } from "@/engine/execute";
import type { AiModelCapabilities, AiModelPricing, CapabilityState } from "@/db/schema";
import type { Protocol } from "./registry";

export type { AiModelCapabilities, AiModelPricing, CapabilityState };

/** Hub error: a NodeError (so workflow steps fail with a stable code) plus retry hints. Messages never carry secrets. */
export class HubError extends NodeError {
  retryable: boolean;
  retryAfterMs?: number;
  httpStatus?: number;
  constructor(code: string, message: string, opts: { retryable?: boolean; retryAfterMs?: number; httpStatus?: number } = {}) {
    super(code, message);
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
    this.httpStatus = opts.httpStatus;
  }
}

export interface HubToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface HubToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type HubMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: HubToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface HubChatRequest {
  system: string;
  messages: HubMessage[];
  tools?: HubToolDef[];
  /** JSON Schema for the answer. Sent natively only when the route SUPPORTS structured output. */
  schema?: Record<string, unknown>;
  maxTokens: number;
  temperature?: number;
}

/** Non-overlapping token counts (see ai_attempt). null = the provider did not report it. */
export interface NormalisedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
}

export interface NormalisedResult {
  text: string;
  toolCalls: HubToolCall[];
  finishReason: string | null;
  model: string;
  usage: NormalisedUsage;
  /** Cost reported by the provider itself, in micro-units (e.g. a gateway's usage.cost). */
  providerCostMicros?: number;
}

export interface DiscoveredModel {
  id: string;
  ownedBy: string | null;
}

/** A resolved route: everything needed to call a model, minus the secret. Snapshotted into run meta. */
export interface ResolvedRoute {
  kind: "workspace";
  provider: string;
  connectionId: string;
  connectionLabel: string;
  modelId: string;
  protocol: Protocol;
  /** Where the choice came from: explicit → node pin → workspace default. */
  source: "explicit" | "node" | "legacy-node-model" | "workspace-default";
  capabilities: AiModelCapabilities;
  pricing: (AiModelPricing & { source: string }) | null;
}

export const UNKNOWN_CAPABILITIES: AiModelCapabilities = { tools: "UNKNOWN", structuredOutput: "UNKNOWN", vision: "UNKNOWN", streaming: "UNKNOWN", reasoning: "UNKNOWN" };
