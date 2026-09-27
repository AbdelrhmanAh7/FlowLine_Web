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
  lastRunAt: string | null;
  lastRunStatus: string | null;
  runCount: number;
  successRate: number | null;
}

interface Overview {
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

export function flowStatus(f: FlowRow): { tone: Tone; label: string } {
  if (f.lastRunStatus === "running" || f.lastRunStatus === "queued") return { tone: "info", label: "Running" };
  if (f.lastRunStatus === "failed") return { tone: "danger", label: "Failed" };
  if (f.lastRunStatus === "succeeded") return { tone: "success", label: "Healthy" };
  return { tone: "muted", label: "Draft" };
}

export function useCreateFlow() {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: { name?: string; templateId?: string }) => api<{ flow: { id: string } }>(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: body }),
    onSuccess: ({ flow }) => router.push(`/w/${workspace.slug}/flows/${flow.id}`),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't create the flow", "danger"),
  });
}

export function Dashboard() {
  const { workspace, canEdit } = useWorkspace();
  const online = useOnline();
  const now = useNow();
  const [q, setQ] = useState("");
  const overview = useQuery({ queryKey: ["overview", workspace.id], queryFn: () => api<Overview>(`/api/workspaces/${workspace.id}/overview`), refetchInterval: 10_000 });
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
        <Button variant="primary" onClick={() => create.mutate({ name: "Untitled flow" })} loading={create.isPending} disabledReason={newReason}>
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
              <Kpi label="Credits used" value="—" note="Not metered in this preview" muted />
              <Kpi
                label="Needs attention"
                value={String(overview.data.failed24h)}
                note={overview.data.failed24h ? "failed in 24h" : "nothing failing"}
                tone={overview.data.failed24h ? "danger" : undefined}
              />
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
                    <tr key={f.id} className="group border-b border-line last:border-0 hover:bg-elevated/40">
                      <td className="px-4 py-3">
                        <Link href={`/w/${workspace.slug}/flows/${f.id}`} className="font-semibold after:absolute after:inset-0 group-hover:text-hi">
                          {f.name}
                        </Link>
                        <span className="data ml-2 text-xs text-muted">{f.nodeCount} nodes</span>
                      </td>
                      <td className="hidden px-4 py-3 text-med md:table-cell">{f.hasTrigger ? "Manual" : <span className="text-muted">No trigger</span>}</td>
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
                    <span className="data text-hi">Run #{r.number}</span> {r.flowName} ·{" "}
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

function Kpi({ label, value, note, tone, muted }: { label: string; value: string; note: string; tone?: "danger"; muted?: boolean }) {
  return (
    <Card className="flex h-[86px] flex-col justify-between px-4 py-3">
      <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className={`data text-2xl font-semibold ${tone === "danger" ? "text-danger" : muted ? "text-muted" : "text-hi"}`}>{value}</span>
        <span className={`truncate text-sm ${tone === "danger" ? "text-danger" : "text-muted"}`}>{note}</span>
      </p>
    </Card>
  );
}
