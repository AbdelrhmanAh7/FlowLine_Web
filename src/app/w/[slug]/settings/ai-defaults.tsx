"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, Skeleton } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";

interface ProviderInfo {
  id: "ollama" | "anthropic";
  defaultModel: string;
  available: boolean;
  reason?: string;
}

/** Default AI provider/model for AI nodes and agents. Only providers configured on this server can be chosen. */
export function AiDefaults() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const ws = useQuery({
    queryKey: ["workspace", workspace.id],
    queryFn: () => api<{ workspace: { aiProvider: ProviderInfo["id"] | null; aiModel: string | null } }>(`/api/workspaces/${workspace.id}`),
    select: (d) => d.workspace,
  });
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: () => api<{ providers: ProviderInfo[] }>("/api/ai/providers"), select: (d) => d.providers });
  if (ws.isPending || providers.isPending) return <Skeleton className="h-40" />;
  if (!ws.data || !providers.data) return null;
  return (
    <Form
      key={`${ws.data.aiProvider}:${ws.data.aiModel}`}
      initial={ws.data}
      providers={providers.data}
      readOnly={!can(role as Role, "workspace.settings")}
      reason={denyReasonText(t, role as Role, "workspace.settings")}
    />
  );
}

function Form({ initial, providers, readOnly, reason }: { initial: { aiProvider: ProviderInfo["id"] | null; aiModel: string | null }; providers: ProviderInfo[]; readOnly: boolean; reason: string }) {
  const t = useT();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [provider, setProvider] = useState<string>(initial.aiProvider ?? "");
  const [model, setModel] = useState(initial.aiModel ?? "");
  const save = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}`, { method: "PATCH", json: { aiProvider: provider || null, aiModel: model || null } }),
    onSuccess: () => {
      toast(t("settings.ai.saved"), "success");
      void qc.invalidateQueries({ queryKey: ["workspace", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.saveError")), "danger"),
  });
  const chosen = providers.find((p) => p.id === provider);
  const dirty = (initial.aiProvider ?? "") !== provider || (initial.aiModel ?? "") !== model;
  return (
    <Card className="mt-4 p-5">
      <h2 className="text-lg font-semibold">{t("settings.ai.title")}</h2>
      <p className="mt-1 text-base text-med">{t("settings.ai.body")}</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t("settings.ai.provider")} htmlFor="llm">
          <select id="llm" disabled={readOnly} value={provider} onChange={(e) => (setProvider(e.target.value), setModel(""))} className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none disabled:text-muted">
            <option value="">{t("settings.ai.serverDefault")}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.id}
                {p.available ? "" : ` — ${p.reason}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("settings.ai.model")} htmlFor="llm-model" hint={chosen ? t("settings.ai.modelBlank", { model: chosen.defaultModel || t("settings.ai.providerDefault") }) : t("settings.ai.pickProvider")}>
          <Input id="llm-model" dir="ltr" value={model} disabled={readOnly || !provider} maxLength={120} onChange={(e) => setModel(e.target.value)} className="h-9" />
        </Field>
        <Button type="submit" variant="primary" loading={save.isPending} disabledReason={readOnly ? reason : !dirty ? t("settings.noChanges") : null}>
          {t("settings.ai.save")}
        </Button>
      </form>
    </Card>
  );
}
