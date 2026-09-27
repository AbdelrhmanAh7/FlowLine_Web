"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, Card, Dot, EmptyState, ErrorState, Input, RUN_TONE, Skeleton, StatusBadge, type Tone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { duration, percent, timeAgo } from "@/lib/format";
import { useNow, useOnline } from "@/lib/hooks";

export interface FlowRow {
  id: string;
  name: string;
  updatedAt: string;
  nodeCount: number;
  hasTrigger: boolean;
  trigger: string | null;
  publishedVersion: number | null;
  pausedReason: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  runCount: number;
  successRate: number | null;
}

interface Usage {
  totalMicros: number;
  budgetMicros: number | null;
  currency: string;
  rows: { kind: string; provider: string | null; model: string | null; events: number; inputTokens: number; outputTokens: number; costMicros: number; unpriced: number }[];
}

interface Overview {
  pendingApprovals: number;
  unhealthyConnections: { id: string; provider: string; label: string; status: string }[];
  pausedFlows: number;
  flows: number;
  flowsRun24h: number;
  runs24h: number;
  successRate24h: number | null;
  failed24h: number;
  activeRuns: number;
  worker: { online: boolean };
  recent: {
    id: string;
    number: number;
    status: string;
    flowId: string;
    flowName: string;
    createdAt: string;
    durationMs: number | null;
    error: { message: string; nodeId?: string } | null;
    steps: number;
    stepsDone: number;
  }[];
}

const TRIGGER_LABEL: Record<string, string> = { "trigger.manual": "Manual", "trigger.webhook": "Webhook", "trigger.schedule": "Schedule" };

export function flowStatus(f: FlowRow): { tone: Tone; label: string } {
  // A broken connection pauses only the flows that use it (pausedReason = connection:<id>:<status>).
  if (f.pausedReason) return f.pausedReason.endsWith(":expired") ? { tone: "danger", label: "Expired" } : { tone: "warning", label: "Paused" };
  if (f.lastRunStatus === "running" || f.lastRunStatus === "queued") return { tone: "info", label: "Running" };
  if (f.lastRunStatus === "waiting_approval") return { tone: "warning", label: "Needs approval" };
  if (f.publishedVersion != null && f.trigger && f.trigger !== "trigger.manual") return f.lastRunStatus === "failed" ? { tone: "danger", label: "Active · failing" } : { tone: "success", label: "Active" };
  if (f.lastRunStatus === "failed") return { tone: "danger", label: "Failed" };
  if (f.lastRunStatus === "succeeded") return { tone: "success", label: "Healthy" };
  return { tone: "muted", label: "Draft" };
}

export function useCreateFlow() {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ copilot: _c, ...body }: { name?: string; templateId?: string; copilot?: boolean }) => api<{ flow: { id: string } }>(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: body }),
    onSuccess: ({ flow }, vars) => router.push(`/w/${workspace.slug}/flows/${flow.id}${vars.copilot ? "?copilot=1" : ""}`),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't create the flow", "danger"),
  });
}

export function Dashboard() {
  const { workspace, canEdit } = useWorkspace();
  const online = useOnline();
  const now = useNow();
  const [q, setQ] = useState("");
  const overview = useQuery({ queryKey: ["overview", workspace.id], queryFn: () => api<Overview>(`/api/workspaces/${workspace.id}/overview`), refetchInterval: 10_000 });
  const usage = useQuery({ queryKey: ["usage", workspace.id], queryFn: () => api<Usage>(`/api/workspaces/${workspace.id}/usage`), refetchInterval: 30_000 });
  const flows = useQuery({ queryKey: ["flows", workspace.id], queryFn: () => api<{ flows: FlowRow[] }>(`/api/workspaces/${workspace.id}/flows`), select: (d) => d.flows });
  const create = useCreateFlow();

  const filtered = useMemo(() => (flows.data ?? []).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())), [flows.data, q]);
  const newReason = !canEdit ? "Viewers can't create flows" : !online ? "You're offline — reconnect to create flows" : null;

  return (
    <div className="flex flex-col">
      <PageHeader title="Flows">
        <label className="sr-only" htmlFor="flow-search">
          Search flows
        </label>
        <Input id="flow-search" placeholder="Search flows…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-44 sm:w-60" />
        <Button onClick={() => create.mutate({ name: "Untitled flow", copilot: true })} loading={create.isPending && create.variables?.copilot} disabledReason={newReason}>
          ✦ Create with Copilot
        </Button>
        <Button variant="primary" onClick={() => create.mutate({ name: "Untitled flow" })} loading={create.isPending && !create.variables?.copilot} disabledReason={newReason}>
          + New flow
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-5 p-4 sm:p-6">
        {/* KPIs */}
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {overview.isPending ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)
          ) : overview.isError ? (
            <div className="col-span-full">
              <ErrorState title="Couldn't load workspace numbers" body={(overview.error as Error).message} onRetry={() => overview.refetch()} retrying={overview.isFetching} />
            </div>
          ) : (
            <>
              <Kpi label="Flows" value={String(overview.data.flows)} note={`${overview.data.flowsRun24h} ran in 24h`} />
              <Kpi label="Runs (24h)" value={overview.data.runs24h.toLocaleString()} note={overview.data.successRate24h == null ? "no finished runs" : `${percent(overview.data.successRate24h)} success`} />
              <UsageKpi usage={usage.data} loading={usage.isPending} />
              {(() => {
                const o = overview.data;
                const n = o.failed24h + o.pendingApprovals + o.unhealthyConnections.length;
                const parts = [o.failed24h && `${o.failed24h} failed`, o.pendingApprovals && `${o.pendingApprovals} awaiting approval`, o.unhealthyConnections.length && `${o.unhealthyConnections.length} connection${o.unhealthyConnections.length > 1 ? "s" : ""} expired`].filter(Boolean);
                return <Kpi label="Needs attention" value={String(n)} note={parts.length ? parts.join(" · ") : "nothing needs you"} tone={n ? "danger" : undefined} />;
              })()}
            </>
          )}
        </section>

        {/* Flows table */}
        <Card className="overflow-hidden">
          {flows.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : flows.isError ? (
            <div className="p-4">
              <ErrorState title="Couldn't load flows" body={(flows.error as Error).message} onRetry={() => flows.refetch()} retrying={flows.isFetching} />
            </div>
          ) : flows.data.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon="⚡"
                title="Start with a trigger"
                body="Every flow begins with an event. Create a blank flow or start from a template that runs on local nodes."
                action={
                  <>
                    <Button variant="primary" onClick={() => create.mutate({ name: "Untitled flow" })} disabledReason={newReason} loading={create.isPending}>
                      + New flow
                    </Button>
                    <ButtonLink href={`/w/${workspace.slug}/templates`} variant="ghost">
                      or browse templates
                    </ButtonLink>
                  </>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState icon="⌕" title="No flows match your search" body={`Nothing is named like “${q}”.`} action={<Button onClick={() => setQ("")}>Clear search</Button>} />
            </div>
          ) : (
            <table className="w-full text-left text-base">
              <thead className="text-xs font-medium tracking-[0.4px] text-muted uppercase">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Flow</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Trigger</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Last run</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Success</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const st = flowStatus(f);
                  return (
                    <tr key={f.id} className="group relative border-b border-line last:border-0 hover:bg-elevated/40">
                      <td className="px-4 py-3">
                        <Link href={`/w/${workspace.slug}/flows/${f.id}`} className="font-semibold after:absolute after:inset-0 group-hover:text-hi">
                          {f.name}
                        </Link>
                        <span className="data ml-2 text-xs text-muted">{f.nodeCount} nodes</span>
                      </td>
                      <td className="hidden px-4 py-3 text-med md:table-cell">{f.trigger ? TRIGGER_LABEL[f.trigger] ?? "Trigger" : <span className="text-muted">No trigger</span>}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </td>
                      <td className="data hidden px-4 py-3 text-sm text-med sm:table-cell">{timeAgo(f.lastRunAt, now)}</td>
                      <td className="data hidden px-4 py-3 text-sm text-med lg:table-cell">{percent(f.successRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Activity */}
        <Card className="p-4">
          <h2 className="mb-3 text-xs font-medium tracking-[0.4px] text-muted uppercase">Recent activity</h2>
          {overview.isPending ? (
            <div className="grid gap-2 md:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          ) : overview.isError ? (
            <p className="text-base text-med">Activity is unavailable until the numbers above load.</p>
          ) : overview.data.recent.length === 0 && overview.data.worker.online ? (
            <p className="text-base text-med">No runs yet. Open a flow and press Run — results show up here.</p>
          ) : (
            <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
              {overview.data.unhealthyConnections.map((c) => (
                <li key={c.id} className="flex min-w-0 items-center gap-2 text-base">
                  <Dot tone="warning" />
                  <span className="min-w-0 truncate text-med">
                    {c.label} connection {c.status}
                    {overview.data.pausedFlows ? ` — ${overview.data.pausedFlows} flow${overview.data.pausedFlows > 1 ? "s" : ""} paused` : ""}
                  </span>
                  <Link href={`/w/${workspace.slug}/integrations`} className="ml-auto shrink-0 text-sm text-warning hover:underline">
                    Reconnect →
                  </Link>
                </li>
              ))}
              {overview.data.pendingApprovals > 0 && (
                <li className="flex min-w-0 items-center gap-2 text-base">
                  <Dot tone="warning" />
                  <span className="min-w-0 truncate text-med">
                    {overview.data.pendingApprovals} action{overview.data.pendingApprovals > 1 ? "s" : ""} waiting for approval
                  </span>
                  <Link href={`/w/${workspace.slug}/runs?status=waiting`} className="ml-auto shrink-0 text-sm text-warning hover:underline">
                    Review →
                  </Link>
                </li>
              )}
              {!overview.data.worker.online && (
                <li className="flex items-center gap-2 text-base">
                  <Dot tone="warning" />
                  <span className="text-med">Execution worker offline{overview.data.activeRuns ? ` — ${overview.data.activeRuns} runs waiting` : ""}</span>
                </li>
              )}
              {overview.data.recent.map((r) => (
                <li key={r.id} className="flex min-w-0 items-center gap-2 text-base">
                  <Dot tone={RUN_TONE[r.status] ?? "muted"} />
                  <span className="min-w-0 truncate text-med">
                    <span className="font-medium text-hi">Run #{r.number}</span> {r.flowName} ·{" "}
                    {r.status === "succeeded"
                      ? `completed ${r.stepsDone}/${r.steps} steps in ${duration(r.durationMs)}`
                      : r.status === "failed"
                        ? `failed${r.error?.message ? ` — ${r.error.message}` : ""}`
                        : r.status === "queued"
                          ? "queued"
                          : `in progress · step ${r.stepsDone + 1} of ${r.steps}`}
                  </span>
                  <Link href={`/w/${workspace.slug}/runs?run=${r.id}`} className={`ml-auto shrink-0 text-sm hover:underline ${r.status === "failed" ? "text-danger" : "text-accent"}`}>
                    Inspect →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function UsageKpi({ usage, loading }: { usage?: Usage; loading: boolean }) {
  if (loading || !usage) return <Kpi label="Usage (this month)" value="…" note="loading" muted />;
  const cost = usage.totalMicros / 1_000_000;
  const tokens = usage.rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0);
  const unpriced = usage.rows.reduce((n, r) => n + r.unpriced, 0);
  const budget = usage.budgetMicros != null ? ` / ${(usage.budgetMicros / 1_000_000).toFixed(2)}` : "";
  const note = [tokens ? `${tokens.toLocaleString()} AI tokens` : "no AI usage", unpriced ? `${unpriced} unpriced` : null].filter(Boolean).join(" · ");
  return <Kpi label="Usage (this month)" value={`${usage.currency} ${cost.toFixed(2)}${budget}`} note={note} />;
}

function Kpi({ label, value, note, tone, muted }: { label: string; value: string; note: string; tone?: "danger"; muted?: boolean }) {
  return (
    <Card className="flex min-h-[86px] flex-col justify-between gap-1 px-4 py-3">
      <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{label}</p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : muted ? "text-muted" : "text-hi"}`}>{value}</span>
        <span className={`text-sm leading-tight ${tone === "danger" ? "text-danger" : "text-muted"}`}>{note}</span>
      </p>
    </Card>
  );
}
