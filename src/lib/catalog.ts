"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface CatalogAction {
  id: string;
  version: number;
  title: string;
  description: string;
  sideEffect: "none" | "idempotent" | "non_idempotent";
  sensitive: boolean;
  verifiable: boolean;
  requiredScopes: string[];
  inputSchema: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] } | null;
  outputSchema: Record<string, unknown> | null;
}
export interface CatalogProvider {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  authType: "oauth2" | "api_key" | "basic" | "connection_string";
  oauthConfigured: boolean | null;
  connectFields: { key: string; label: string; secret: boolean; placeholder?: string; help?: string }[];
  verification: { adapter: true; contractTested: boolean; live: "verified" | "blocked" | "not_run"; liveNote?: string; betaScope: "core" | "deferred" };
  actions: CatalogAction[];
}
export interface Catalog {
  count: number;
  actionCount: number;
  providers: CatalogProvider[];
  runtime: { codeSandbox: { available: boolean; reason: string | null } };
}
export interface ConnectionDto {
  id: string;
  provider: string;
  label: string;
  authType: string;
  accountLabel: string;
  scopes: string[];
  status: "active" | "expired" | "revoked" | "error";
  statusReason: string | null;
  flowCount: number;
  visibility: "workspace" | "private";
  ownerId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/** With a workspace id, OAuth availability reflects that workspace's own OAuth apps too (never cached across workspaces). */
export function useCatalog(workspaceId?: string) {
  return useQuery({
    queryKey: ["catalog", workspaceId ?? null],
    queryFn: () => api<Catalog>(workspaceId ? `/api/integrations/catalog?workspaceId=${encodeURIComponent(workspaceId)}` : "/api/integrations/catalog"),
    staleTime: 60_000,
  });
}

export function useConnections(workspaceId: string) {
  return useQuery({
    queryKey: ["connections", workspaceId],
    queryFn: () => api<{ connections: ConnectionDto[] }>(`/api/workspaces/${workspaceId}/connections`),
    select: (d) => d.connections,
  });
}

export const SIDE_EFFECT_LABEL: Record<string, string> = {
  none: "Read-only",
  idempotent: "Safe to repeat",
  non_idempotent: "Not idempotent",
};
