"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Skeleton, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { AiDefaults } from "./ai-defaults";
import { ApiKeys } from "./api-keys";
import { AuditLog } from "./audit-log";
import { BillingPlan } from "./billing-plan";
import { Members } from "./members";

type Tab = "members" | "general" | "keys" | "plan" | "billing" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "general", label: "General" },
  { id: "keys", label: "API keys" },
  { id: "plan", label: "Plan & billing" },
  { id: "billing", label: "Usage & limits" },
  { id: "audit", label: "Audit log" },
];

export default function SettingsPage() {
  // ?tab=… deep-links a section; returning from checkout (?billing=…) opens Plan & billing.
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (params.get("billing") ? "plan" : TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as Tab) : "members"));
  return (
    <div className="flex flex-col">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-5 p-4 sm:p-6 lg:flex-row">
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col">
          {TABS.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={cx("h-8 shrink-0 rounded-md px-3 text-left text-base transition-colors duration-[var(--dur-hover)]", tab === t.id ? "bg-card text-hi" : "text-med hover:bg-card hover:text-hi")}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl flex-1">
          {tab === "members" && <Members />}
          {tab === "general" && (
            <>
              <General />
              <AiDefaults />
            </>
          )}
          {tab === "keys" && <ApiKeys />}
          {tab === "plan" && <BillingPlan />}
          {tab === "billing" && <Billing />}
          {tab === "audit" && <AuditLog />}
        </div>
      </div>
    </div>
  );
}

function General() {
  const { workspace, role } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(workspace.name);
  const [tz, setTz] = useState(workspace.timezone);
  const zones = typeof Intl.supportedValuesOf === "function" ? ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")] : ["UTC"];
  const isOwner = role === "owner";
  const save = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}`, { method: "PATCH", json: { name, timezone: tz } }),
    onSuccess: () => {
      toast("Workspace settings saved", "success");
      router.refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save", "danger"),
  });
  const dirty = name !== workspace.name || tz !== workspace.timezone;
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">General</h2>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset disabled={!isOwner} className="flex flex-col gap-4">
          <Field label="Workspace name" htmlFor="ws-name">
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Schedule timezone" htmlFor="ws-tz" hint="Default time zone for new scheduled triggers.">
            <select id="ws-tz" value={tz} onChange={(e) => setTz(e.target.value)} className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>
        <div>
          <Button type="submit" variant="primary" loading={save.isPending} disabledReason={!isOwner ? "Only workspace owners can change settings" : !dirty ? "No changes to save" : null}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Billing() {
  const { workspace, role } = useWorkspace();
  const toast = useToast();
  const router = useRouter();
  const isOwner = role === "owner";
  const usage = useQuery({
    queryKey: ["usage", workspace.id],
    queryFn: () =>
      api<{ totalMicros: number; budgetMicros: number | null; currency: string; rows: { kind: string; provider: string | null; model: string | null; events: number; inputTokens: number; outputTokens: number; costMicros: number; unpriced: number }[] }>(
        `/api/workspaces/${workspace.id}/usage`,
      ),
  });
  const ws = useQuery({
    queryKey: ["workspace", workspace.id],
    queryFn: () =>
      api<{ workspace: { monthlyBudgetMicros: number | null; maxConcurrentRuns: number; maxQueuedRuns: number; maxMonthlyExecutions: number | null; prices: Record<string, { inputPerMTokMicros?: number; outputPerMTokMicros?: number; perCallMicros?: number }> } }>(
        `/api/workspaces/${workspace.id}`,
      ),
    select: (d) => d.workspace,
  });
  const [form, setForm] = useState<{ budget: string; concurrent: string; queued: string; executions: string; prices: { key: string; input: string; output: string; call: string }[] } | null>(null);
  const toStr = (m?: number) => (m != null ? String(m / 1_000_000) : "");
  const f =
    form ??
    (ws.data
      ? {
          budget: ws.data.monthlyBudgetMicros == null ? "" : String(ws.data.monthlyBudgetMicros / 1_000_000),
          concurrent: String(ws.data.maxConcurrentRuns),
          queued: String(ws.data.maxQueuedRuns),
          executions: ws.data.maxMonthlyExecutions == null ? "" : String(ws.data.maxMonthlyExecutions),
          prices: Object.entries(ws.data.prices ?? {}).map(([key, p]) => ({ key, input: toStr(p.inputPerMTokMicros), output: toStr(p.outputPerMTokMicros), call: toStr(p.perCallMicros) })),
        }
      : null);
  const save = useMutation({
    mutationFn: () => {
      const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
      return api(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        json: {
          monthlyBudget: f!.budget.trim() === "" ? null : Number(f!.budget),
          maxConcurrentRuns: Number(f!.concurrent),
          maxQueuedRuns: Number(f!.queued),
          maxMonthlyExecutions: f!.executions.trim() === "" ? null : Number(f!.executions),
          prices: Object.fromEntries(f!.prices.filter((p) => p.key.trim()).map((p) => [p.key.trim(), { inputPerMTok: num(p.input), outputPerMTok: num(p.output), perCall: num(p.call) }])),
        },
      });
    },
    onSuccess: () => {
      toast("Usage limits saved", "success");
      setForm(null);
      void ws.refetch();
      router.refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save", "danger"),
  });
  const cur = usage.data?.currency ?? "USD";
  const setPrice = (i: number, patch: Partial<{ key: string; input: string; output: string; call: string }>) => f && setForm({ ...f, prices: f.prices.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Usage this month</h2>
        <p className="mt-1 text-base text-med">
          From the durable usage ledger: every AI call and app action is recorded once. Costs use the prices you configure below; nothing is estimated from list prices.
        </p>
        {usage.isPending ? (
          <Skeleton className="mt-4 h-20" />
        ) : usage.isError ? (
          <ErrorState title="Couldn't load usage" onRetry={() => usage.refetch()} />
        ) : usage.data.rows.length === 0 ? (
          <p className="mt-4 text-base text-muted">No usage yet this month.</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs tracking-[0.4px] text-muted uppercase">
              <tr>
                <th className="py-1 font-medium">Kind</th>
                <th className="py-1 font-medium">Provider / model</th>
                <th className="py-1 text-right font-medium">Events</th>
                <th className="py-1 text-right font-medium">Tokens</th>
                <th className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="data">
              {usage.data.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5">{r.kind}</td>
                  <td className="py-1.5">{[r.provider, r.model].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="py-1.5 text-right">{r.events}</td>
                  <td className="py-1.5 text-right">{(r.inputTokens + r.outputTokens).toLocaleString()}</td>
                  <td className="py-1.5 text-right">
                    {r.unpriced ? (
                      <span className="text-warning" title="No price configured">
                        unpriced
                      </span>
                    ) : (
                      `${cur} ${(r.costMicros / 1_000_000).toFixed(4)}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Limits</h2>
        {!f ? (
          <Skeleton className="mt-4 h-40" />
        ) : (
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <fieldset disabled={!isOwner} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={`Monthly budget (${cur})`} htmlFor="budget" hint="Costed steps fail before running once reached. Blank = no limit.">
                  <Input id="budget" type="number" min={0} step="0.01" value={f.budget} onChange={(e) => setForm({ ...f, budget: e.target.value })} />
                </Field>
                <Field label="Concurrent runs" htmlFor="conc" hint="1–20 per workspace">
                  <Input id="conc" type="number" min={1} max={20} value={f.concurrent} onChange={(e) => setForm({ ...f, concurrent: e.target.value })} />
                </Field>
                <Field label="Queued runs" htmlFor="queued" hint="Beyond this, new runs are refused">
                  <Input id="queued" type="number" min={1} max={1000} value={f.queued} onChange={(e) => setForm({ ...f, queued: e.target.value })} />
                </Field>
                <Field label="Executions per month" htmlFor="execs" hint="Workflow + agent runs; blank = no limit. A billing plan's limit also applies.">
                  <Input id="execs" type="number" min={1} value={f.executions} onChange={(e) => setForm({ ...f, executions: e.target.value })} />
                </Field>
              </div>
              <div>
                <p className="text-xs font-medium tracking-[0.4px] text-med uppercase">Prices ({cur})</p>
                <p className="mt-1 text-sm text-muted">
                  Keys: <code className="data">ai:&lt;provider&gt;/&lt;model&gt;</code> (per million tokens), <code className="data">action:&lt;action id&gt;</code> or <code className="data">action:&lt;app&gt;/*</code> (per call). Unpriced
                  usage is still counted and flagged.
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {f.prices.map((p, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] gap-2">
                      <Input aria-label="Price key" className="data h-8" value={p.key} placeholder="ai:ollama/qwen2.5:3b" onChange={(e) => setPrice(i, { key: e.target.value })} />
                      <Input aria-label="Input per million tokens" className="data h-8" value={p.input} placeholder="in/MTok" onChange={(e) => setPrice(i, { input: e.target.value })} />
                      <Input aria-label="Output per million tokens" className="data h-8" value={p.output} placeholder="out/MTok" onChange={(e) => setPrice(i, { output: e.target.value })} />
                      <Input aria-label="Per call" className="data h-8" value={p.call} placeholder="per call" onChange={(e) => setPrice(i, { call: e.target.value })} />
                      <Button size="sm" variant="ghost" aria-label="Remove price" onClick={() => setForm({ ...f, prices: f.prices.filter((_, j) => j !== i) })}>
                        ✕
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" className="self-start" onClick={() => setForm({ ...f, prices: [...f.prices, { key: "", input: "", output: "", call: "" }] })}>
                    + Add price
                  </Button>
                </div>
              </div>
            </fieldset>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" loading={save.isPending} disabledReason={!isOwner ? "Only workspace owners can change limits" : !form ? "No changes to save" : null}>
                Save limits
              </Button>
              <span className="text-sm text-muted">Subscriptions and plans live under Plan &amp; billing.</span>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
