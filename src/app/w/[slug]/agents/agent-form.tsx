"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { dataText } from "@/i18n/workspace-text";
import { ModelPicker } from "@/components/ai/model-picker";
import { useAiOverview, usePickerModels, type AiRouteRef } from "@/lib/ai";
import { api } from "@/lib/api";

export type Permission = "allow" | "ask" | "deny";
export interface AgentConfig {
  name: string;
  description: string;
  instructions: string;
  /** Legacy pre-hub pin (read-only). Saving clears it. */
  provider: string | null;
  model: string | null;
  /** AI hub route of this version. Null on save = the workspace default, snapshotted into the new version. */
  route: AiRouteRef | null;
  tools: { tool: "knowledge_search" | "workflow_inspect" | "run_workflow"; flowId?: string; permission: Permission }[];
  knowledgeSourceIds: string[];
  limits: { maxSteps: number; maxToolCalls: number; maxCostMicros: number | null; timeoutMs: number; allowUnknownCost?: boolean };
}
export const EMPTY_AGENT: AgentConfig = {
  name: "",
  description: "",
  instructions: "",
  provider: null,
  model: null,
  route: null,
  tools: [{ tool: "knowledge_search", permission: "allow" }],
  knowledgeSourceIds: [],
  limits: { maxSteps: 8, maxToolCalls: 6, maxCostMicros: null, timeoutMs: 120_000 },
};

function PermissionSelect({ id, value, onChange, disabled }: { id: string; value: Permission; onChange: (p: Permission) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <Select size="sm" id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Permission)}>
      <option value="allow">{t("agents.form.allow")}</option>
      <option value="ask">{t("agents.form.ask")}</option>
      <option value="deny">{t("agents.form.deny")}</option>
    </Select>
  );
}

export function AgentForm({ initial, onSave, saving, readOnlyReason, submitLabel }: { initial: AgentConfig; onSave: (c: AgentConfig) => void; saving: boolean; readOnlyReason: string | null; submitLabel: string }) {
  const t = useT();
  const { workspace } = useWorkspace();
  const [c, setC] = useState<AgentConfig>(initial);
  const ro = Boolean(readOnlyReason);
  const ai = useAiOverview(workspace.id);
  const def = ai.data?.status.defaultRoute;
  const canUse = Boolean(ai.data?.canUse);
  const models = usePickerModels(workspace.id, canUse);
  const flows = useQuery({
    queryKey: ["flows", workspace.id],
    queryFn: () => api<{ flows: { id: string; name: string; publishedVersion: number | null }[] }>(`/api/workspaces/${workspace.id}/flows`),
    select: (d) => d.flows,
  });
  const sources = useQuery({
    queryKey: ["knowledge", workspace.id],
    queryFn: () => api<{ sources: { id: string; name: string; status: string }[] }>(`/api/workspaces/${workspace.id}/knowledge`),
    select: (d) => d.sources,
  });
  const set = (p: Partial<AgentConfig>) => setC((x) => ({ ...x, ...p }));
  const kTool = c.tools.find((t) => t.tool === "knowledge_search");
  const toolFor = (flowId: string) => c.tools.find((t) => t.flowId === flowId && t.tool === "run_workflow");
  const setWorkflow = (flowId: string, perm: Permission | null) => {
    const others = c.tools.filter((t) => !(t.flowId === flowId));
    set({ tools: perm ? [...others, { tool: "run_workflow", flowId, permission: perm }, { tool: "workflow_inspect", flowId, permission: "allow" }] : others });
  };
  const invalid = !c.name.trim()
    ? t("agents.form.nameFirst")
    : !c.instructions.trim()
      ? t("agents.form.instructionsFirst")
      : c.knowledgeSourceIds.length > 0 && !kTool
        ? t("agents.form.enableKnowledge")
        : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        // A legacy provider pin is never sent: saving is the explicit step that moves the agent to the workspace route.
        onSave({ ...c, provider: null, model: null });
      }}
    >
      <Card className="flex flex-col gap-4 p-5">
        <fieldset disabled={ro} className="flex flex-col gap-4">
          <Field label={t("agents.form.name")} htmlFor="ag-name">
            <Input id="ag-name" value={c.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={t("agents.form.description")} htmlFor="ag-desc">
            <Input id="ag-desc" value={c.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label={t("agents.form.instructions")} htmlFor="ag-ins" hint={t("agents.form.instructionsHint")}>
            <Textarea id="ag-ins" rows={6} value={c.instructions} maxLength={8000} onChange={(e) => set({ instructions: e.target.value })} />
          </Field>
          <div className="flex flex-col gap-1 text-sm" data-testid="agent-ai-route">
            <span className="text-med">{t("agents.form.aiModel")}</span>
            {initial.route && (
              <span className="text-muted">
                {t("agents.form.aiModelPinned")}{" "}
                <span dir="ltr" className="data text-hi">
                  {initial.route.modelId}
                </span>
              </span>
            )}
            {canUse ? (
              <ModelPicker
                id="ag-model"
                models={models.data ?? []}
                loading={models.isPending}
                value={c.route}
                onChange={(route) => set({ route })}
                allowDefault
                defaultLabel={def ? t("agents.form.aiModelDefault", { model: def.modelId, connection: def.connectionLabel }) : t("agents.form.aiModelNone")}
                disabled={ro}
              />
            ) : (
              <span className="text-muted">{ai.data?.status.reason ?? t("agents.form.aiModelNone")}</span>
            )}
            <span className="text-muted">{t("agents.form.aiModelHint")}</span>
            {initial.provider && <span className="text-warning">{t("agents.form.legacyPin", { provider: initial.provider })}</span>}
          </div>
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h3 className="text-base font-semibold">{t("agents.form.toolsTitle")}</h3>
        <p className="text-sm text-med">{t("agents.form.toolsBody")}</p>
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" disabled={ro} checked={Boolean(kTool)} onChange={(e) => set({ tools: e.target.checked ? [...c.tools, { tool: "knowledge_search", permission: "allow" }] : c.tools.filter((t) => t.tool !== "knowledge_search") })} />
            {t("agents.form.knowledgeSearch")}
          </label>
          {kTool && (
            <PermissionSelect id="perm-knowledge" value={kTool.permission} disabled={ro} onChange={(p) => set({ tools: c.tools.map((t) => (t.tool === "knowledge_search" ? { ...t, permission: p } : t)) })} />
          )}
        </div>
        {kTool && (
          <div>
            <p className="text-sm font-medium text-med">{t("agents.form.sourcesLabel")}</p>
            {(sources.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">{t("agents.form.noSources")}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1" aria-label={t("agents.form.sourcesAria")}>
                {sources.data!.map((s) => (
                  <li key={s.id} className="motion-list-in">
                    <label className="flex items-center gap-2 text-base">
                      <input
                        type="checkbox"
                        disabled={ro}
                        checked={c.knowledgeSourceIds.includes(s.id)}
                        onChange={(e) => set({ knowledgeSourceIds: e.target.checked ? [...c.knowledgeSourceIds, s.id] : c.knowledgeSourceIds.filter((x) => x !== s.id) })}
                      />
                      {s.name} <span className="text-sm text-muted">({dataText(t, "knowledge.statusWord", s.status)})</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-med">{t("agents.form.workflowsLabel")}</p>
          <ul className="mt-1 flex flex-col gap-1.5" aria-label={t("agents.form.workflowsAria")}>
            {(flows.data ?? []).map((f) => {
              const tool = toolFor(f.id);
              return (
                <li key={f.id} className="motion-list-in flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-base">
                    <input type="checkbox" disabled={ro || f.publishedVersion == null} checked={Boolean(tool)} onChange={(e) => setWorkflow(f.id, e.target.checked ? "ask" : null)} />
                    {f.name}
                  </label>
                  {f.publishedVersion == null ? (
                    <span className="text-sm text-muted">{t("agents.form.notPublished")}</span>
                  ) : (
                    tool && <PermissionSelect id={`perm-${f.id}`} value={tool.permission} disabled={ro} onChange={(p) => setWorkflow(f.id, p)} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Card className="flex flex-wrap gap-3 p-5">
        <h3 className="w-full text-base font-semibold">{t("agents.form.limits")}</h3>
        <Field label={t("agents.form.maxSteps")} htmlFor="ag-steps">
          <Input id="ag-steps" type="number" min={1} max={50} disabled={ro} value={c.limits.maxSteps} onChange={(e) => set({ limits: { ...c.limits, maxSteps: Number(e.target.value) } })} className="h-8 w-24" />
        </Field>
        <Field label={t("agents.form.maxToolCalls")} htmlFor="ag-tools">
          <Input id="ag-tools" type="number" min={0} max={50} disabled={ro} value={c.limits.maxToolCalls} onChange={(e) => set({ limits: { ...c.limits, maxToolCalls: Number(e.target.value) } })} className="h-8 w-24" />
        </Field>
        <Field label={t("agents.form.timeout")} htmlFor="ag-timeout">
          <Input id="ag-timeout" type="number" min={5} max={600} disabled={ro} value={Math.round(c.limits.timeoutMs / 1000)} onChange={(e) => set({ limits: { ...c.limits, timeoutMs: Number(e.target.value) * 1000 } })} className="h-8 w-24" />
        </Field>
        <Field label={t("agents.form.cost")} htmlFor="ag-cost" hint={t("agents.form.costHint")}>
          <Input
            id="ag-cost"
            type="number"
            min={0}
            step="0.01"
            disabled={ro}
            value={c.limits.maxCostMicros == null ? "" : c.limits.maxCostMicros / 1_000_000}
            onChange={(e) => set({ limits: { ...c.limits, maxCostMicros: e.target.value === "" ? null : Math.round(Number(e.target.value) * 1_000_000) } })}
            className="h-8 w-32"
          />
        </Field>
        {/* CXH-04: an explicit, clearly labelled opt-out of the cap guarantee for unknown-price calls (default off). */}
        <div className="flex w-full flex-col gap-1">
          <label className="flex items-center gap-2 text-base">
            <input
              type="checkbox"
              disabled={ro || c.limits.maxCostMicros == null}
              checked={c.limits.maxCostMicros != null && c.limits.allowUnknownCost === true}
              onChange={(e) => set({ limits: { ...c.limits, allowUnknownCost: e.target.checked } })}
            />
            {t("agents.form.allowUnknownCost")}
          </label>
          <span className={c.limits.allowUnknownCost && c.limits.maxCostMicros != null ? "text-sm text-warning" : "text-sm text-muted"}>{t("agents.form.allowUnknownCostHint")}</span>
        </div>
      </Card>
      <div>
        <Button type="submit" variant="primary" loading={saving} disabledReason={readOnlyReason ?? invalid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
