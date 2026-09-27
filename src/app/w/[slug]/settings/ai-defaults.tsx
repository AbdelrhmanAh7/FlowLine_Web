"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { can, denyReason, type Role } from "@/lib/permissions";

interface ProviderInfo {
  id: "ollama" | "anthropic";
  defaultModel: string;
  available: boolean;
  reason?: string;
}

/** Default AI provider/model for AI nodes and agents. Only providers configured on this server can be chosen. */
export function AiDefaults() {
  const { workspace, role } = useWorkspace();
  const ws = useQuery({
    queryKey: ["workspace", workspace.id],
    queryFn: () => api<{ workspace: { aiProvider: ProviderInfo["id"] | null; aiModel: string | null } }>(`/api/workspaces/${workspace.id}`),
    select: (d) => d.workspace,
  });
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: () => api<{ providers: ProviderInfo[] }>("/api/ai/providers"), select: (d) => d.providers });
  if (ws.isPending || providers.isPending) return <Skeleton className="h-40" />;
  if (!ws.data || !providers.data) return null;
  return <Form key={`${ws.data.aiProvider}:${ws.data.aiModel}`} initial={ws.data} providers={providers.data} readOnly={!can(role as Role, "workspace.settings")} reason={denyReason(role as Role, "workspace.settings")} />;
}

function Form({ initial, providers, readOnly, reason }: { initial: { aiProvider: ProviderInfo["id"] | null; aiModel: string | null }; providers: ProviderInfo[]; readOnly: boolean; reason: string }) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [provider, setProvider] = useState<string>(initial.aiProvider ?? "");
  const [model, setModel] = useState(initial.aiModel ?? "");
  const save = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}`, { method: "PATCH", json: { aiProvider: provider || null, aiModel: model || null } }),
    onSuccess: () => {
      toast("AI defaults saved", "success");
      void qc.invalidateQueries({ queryKey: ["workspace", workspace.id] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save", "danger"),
  });
  const chosen = providers.find((p) => p.id === provider);
  const dirty = (initial.aiProvider ?? "") !== provider || (initial.aiModel ?? "") !== model;
  return (
    <Card className="mt-4 p-5">
      <h2 className="text-lg font-semibold">AI defaults</h2>
      <p className="mt-1 text-base text-med">Used by AI nodes, agents and Copilot unless they choose their own. No model names are built in — only providers configured on this server appear.</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Default AI provider" htmlFor="llm">
          <select id="llm" disabled={readOnly} value={provider} onChange={(e) => (setProvider(e.target.value), setModel(""))} className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none disabled:text-muted">
            <option value="">Server default</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.id}
                {p.available ? "" : ` — ${p.reason}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model" htmlFor="llm-model" hint={chosen ? `Blank = ${chosen.defaultModel || "provider default"}` : "Pick a provider to override the model"}>
          <Input id="llm-model" value={model} disabled={readOnly || !provider} maxLength={120} onChange={(e) => setModel(e.target.value)} className="h-9" />
        </Field>
        <Button type="submit" variant="primary" loading={save.isPending} disabledReason={readOnly ? reason : !dirty ? "No changes to save" : null}>
          Save AI defaults
        </Button>
      </form>
    </Card>
  );
}
