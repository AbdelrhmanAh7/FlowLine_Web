"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/api";

export type Permission = "allow" | "ask" | "deny";
export interface AgentConfig {
  name: string;
  description: string;
  instructions: string;
  provider: "ollama" | "anthropic" | null;
  model: string | null;
  tools: { tool: "knowledge_search" | "workflow_inspect" | "run_workflow"; flowId?: string; permission: Permission }[];
  knowledgeSourceIds: string[];
  limits: { maxSteps: number; maxToolCalls: number; maxCostMicros: number | null; timeoutMs: number };
}
export const EMPTY_AGENT: AgentConfig = {
  name: "",
  description: "",
  instructions: "",
  provider: null,
  model: null,
  tools: [{ tool: "knowledge_search", permission: "allow" }],
  knowledgeSourceIds: [],
  limits: { maxSteps: 8, maxToolCalls: 6, maxCostMicros: null, timeoutMs: 120_000 },
};

const selectCls = "h-8 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none disabled:text-muted";

function PermissionSelect({ id, value, onChange, disabled }: { id: string; value: Permission; onChange: (p: Permission) => void; disabled?: boolean }) {
  return (
    <select id={id} className={selectCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Permission)}>
      <option value="allow">Allow</option>
      <option value="ask">Ask (human approval)</option>
      <option value="deny">Deny</option>
    </select>
  );
}

export function AgentForm({ initial, onSave, saving, readOnlyReason, submitLabel }: { initial: AgentConfig; onSave: (c: AgentConfig) => void; saving: boolean; readOnlyReason: string | null; submitLabel: string }) {
  const { workspace } = useWorkspace();
  const [c, setC] = useState<AgentConfig>(initial);
  const ro = Boolean(readOnlyReason);
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: () => api<{ providers: { id: string; defaultModel: string; available: boolean; reason?: string }[] }>("/api/ai/providers"), select: (d) => d.providers });
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
  const invalid = !c.name.trim() ? "Name the agent" : !c.instructions.trim() ? "Write instructions" : c.knowledgeSourceIds.length > 0 && !kTool ? "Enable knowledge search to use knowledge sources" : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(c);
      }}
    >
      <Card className="flex flex-col gap-4 p-5">
        <fieldset disabled={ro} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="ag-name">
            <Input id="ag-name" value={c.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="ag-desc">
            <Input id="ag-desc" value={c.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Instructions" htmlFor="ag-ins" hint="The agent's system instructions. Documents and tool results can never override them.">
            <Textarea id="ag-ins" rows={6} value={c.instructions} maxLength={8000} onChange={(e) => set({ instructions: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field label="AI provider" htmlFor="ag-prov" hint="Only providers configured on this server are selectable.">
              <select
                id="ag-prov"
                className={selectCls}
                value={c.provider ?? ""}
                onChange={(e) => set({ provider: (e.target.value || null) as AgentConfig["provider"], model: null })}
              >
                <option value="">Workspace / server default</option>
                {(providers.data ?? []).map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.available}>
                    {p.id}
                    {p.available ? ` (default model: ${p.defaultModel})` : ` — ${p.reason}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model (optional)" htmlFor="ag-model" hint="Blank = the provider's configured default">
              <Input id="ag-model" value={c.model ?? ""} maxLength={120} disabled={!c.provider} onChange={(e) => set({ model: e.target.value || null })} className="h-8" />
            </Field>
          </div>
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h3 className="text-base font-semibold">Tools & permissions</h3>
        <p className="text-sm text-med">Enforced by the platform on every call — the model can&apos;t change them. Workflows run only in their published version, with their own approvals.</p>
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" disabled={ro} checked={Boolean(kTool)} onChange={(e) => set({ tools: e.target.checked ? [...c.tools, { tool: "knowledge_search", permission: "allow" }] : c.tools.filter((t) => t.tool !== "knowledge_search") })} />
            Knowledge search
          </label>
          {kTool && (
            <PermissionSelect id="perm-knowledge" value={kTool.permission} disabled={ro} onChange={(p) => set({ tools: c.tools.map((t) => (t.tool === "knowledge_search" ? { ...t, permission: p } : t)) })} />
          )}
        </div>
        {kTool && (
          <div>
            <p className="text-sm font-medium text-med">Knowledge sources the agent may read</p>
            {(sources.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">No knowledge sources yet.</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1" aria-label="Knowledge sources">
                {sources.data!.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 text-base">
                      <input
                        type="checkbox"
                        disabled={ro}
                        checked={c.knowledgeSourceIds.includes(s.id)}
                        onChange={(e) => set({ knowledgeSourceIds: e.target.checked ? [...c.knowledgeSourceIds, s.id] : c.knowledgeSourceIds.filter((x) => x !== s.id) })}
                      />
                      {s.name} <span className="text-sm text-muted">({s.status})</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-med">Workflows the agent may run</p>
          <ul className="mt-1 flex flex-col gap-1.5" aria-label="Workflow tools">
            {(flows.data ?? []).map((f) => {
              const t = toolFor(f.id);
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-base">
                    <input type="checkbox" disabled={ro || f.publishedVersion == null} checked={Boolean(t)} onChange={(e) => setWorkflow(f.id, e.target.checked ? "ask" : null)} />
                    {f.name}
                  </label>
                  {f.publishedVersion == null ? (
                    <span className="text-sm text-muted">not published — publish it to use it as a tool</span>
                  ) : (
                    t && <PermissionSelect id={`perm-${f.id}`} value={t.permission} disabled={ro} onChange={(p) => setWorkflow(f.id, p)} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Card className="flex flex-wrap gap-3 p-5">
        <h3 className="w-full text-base font-semibold">Limits</h3>
        <Field label="Max steps" htmlFor="ag-steps">
          <Input id="ag-steps" type="number" min={1} max={50} disabled={ro} value={c.limits.maxSteps} onChange={(e) => set({ limits: { ...c.limits, maxSteps: Number(e.target.value) } })} className="h-8 w-24" />
        </Field>
        <Field label="Max tool calls" htmlFor="ag-tools">
          <Input id="ag-tools" type="number" min={0} max={50} disabled={ro} value={c.limits.maxToolCalls} onChange={(e) => set({ limits: { ...c.limits, maxToolCalls: Number(e.target.value) } })} className="h-8 w-24" />
        </Field>
        <Field label="Timeout (s)" htmlFor="ag-timeout">
          <Input id="ag-timeout" type="number" min={5} max={600} disabled={ro} value={Math.round(c.limits.timeoutMs / 1000)} onChange={(e) => set({ limits: { ...c.limits, timeoutMs: Number(e.target.value) * 1000 } })} className="h-8 w-24" />
        </Field>
        <Field label="Cost limit per run" htmlFor="ag-cost" hint="In your workspace currency; blank = no limit. Needs prices configured in Usage & limits.">
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
      </Card>
      <div>
        <Button type="submit" variant="primary" loading={saving} disabledReason={readOnlyReason ?? invalid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
