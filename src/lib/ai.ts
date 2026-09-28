"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/** Client-side shapes of the AI hub API. Nothing here ever carries an API key (only a masked hint). */
export type CapState = "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";

export interface AiProviderDto {
  id: string;
  name: string;
  tier: "core" | "expansion" | "deferred";
  status: "IMPLEMENTED" | "PENDING" | "UNSUITABLE";
  connectable: boolean;
  routeKind: "direct" | "gateway";
  protocols: string[];
  sources: { label: string; url: string }[];
  termsUrl: string | null;
  verifiedAt: string | null;
  requirements: string[];
  contractVerified: boolean;
  notes: string | null;
}

export interface AiConnectionDto {
  id: string;
  provider: string;
  providerName: string;
  label: string;
  keyHint: string | null;
  useRoles: string[];
  status: "CONNECTED" | "DEGRADED" | "REVOKED";
  verification: "IMPLEMENTED" | "CONTRACT_VERIFIED" | "LIVE_VERIFIED";
  lastTestedAt: string | null;
  lastError: { code: string; message: string; at: string } | null;
  catalogRefreshedAt: string | null;
  catalogStale: boolean;
  catalogError: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  models: { discovered: number; accessConfirmed: number; removed: number };
}

export interface AiStatusDto {
  canUseAny: boolean;
  usableConnections: number;
  defaultRoute: { provider: string; providerName: string; connectionId: string; connectionLabel: string; modelId: string } | null;
  defaultUsable: boolean;
  defaultError: { code: string; message: string } | null;
  reason: string | null;
  testDouble: boolean;
}

export interface AiOverviewDto {
  providers: AiProviderDto[];
  connections: AiConnectionDto[];
  defaultRoute: { connectionId: string; modelId: string } | null;
  policy: { mode: "MANUAL"; allowUnknownCost: boolean };
  status: AiStatusDto;
  legacy: { workspaceDefault: { provider: string; model: string | null } | null; agents: { id: string; name: string; provider: string | null; model: string | null }[]; flows: { id: string; name: string }[]; any: boolean };
  canManage: boolean;
  canUse: boolean;
}

export interface PickerModelDto {
  connectionId: string;
  connectionLabel: string;
  provider: string;
  providerName: string;
  routeKind: "direct" | "gateway";
  modelId: string;
  ownedBy: string | null;
  lifecycle: "active" | "removed";
  accessConfirmed: boolean;
  capabilities: { tools: CapState; structuredOutput: CapState; vision: CapState; streaming: CapState; reasoning: CapState };
  contextWindow: number | null;
  price: { known: boolean; source: string | null; inputPerMTokMicros: number | null; outputPerMTokMicros: number | null };
}

export interface AiRouteRef {
  connectionId: string;
  modelId: string;
}

export function useAiOverview(workspaceId: string) {
  return useQuery({ queryKey: ["ai", workspaceId], queryFn: () => api<AiOverviewDto>(`/api/workspaces/${workspaceId}/ai`), staleTime: 15_000 });
}

export function usePickerModels(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: ["ai-models", workspaceId],
    queryFn: () => api<{ models: PickerModelDto[] }>(`/api/workspaces/${workspaceId}/ai/models`),
    select: (d) => d.models,
    enabled,
    staleTime: 15_000,
  });
}
