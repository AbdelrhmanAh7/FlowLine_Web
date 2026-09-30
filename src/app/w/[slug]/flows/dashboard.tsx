"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CopilotPanel } from "@/components/builder/copilot-panel";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, ButtonLink, Card, Dot, EmptyState, ErrorState, Input, RUN_TONE, Skeleton, StatusBadge, useKeepMounted, type Tone } from "@/components/ui";
import { useT } from "@/i18n/client";
import { stepErrorText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";
import { api } from "@/lib/api";
import { useNow, useOnline, useViewport } from "@/lib/hooks";

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
  pendingAgentApprovals: { agentId: string; agentRunId: string; agentName: string }[];
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
    error: { code?: string; message: string; nodeId?: string } | null;
    steps: number;
    stepsDone: number;
  }[];
}

const TRIGGER_LABEL: Record<string, MessageKey> = { "trigger.manual": "flows.trigger.manual", "trigger.webhook": "flows.trigger.webhook", "trigger.schedule": "flows.trigger.schedule" };

type FlowStatusKey = "expired" | "paused" | "running" | "needsApproval" | "activeFailing" | "active" | "failed" | "healthy" | "draft";

/** Status of a flow row; `label` is a catalogue key suffix under `flows.status`. */
export function flowStatus(f: FlowRow): { tone: Tone; label: FlowStatusKey } {
  // A broken connection pauses only the flows that use it (pausedReason = connection:<id>:<status>).
  if (f.pausedReason) return f.pausedReason.endsWith(":expired") ? { tone: "danger", label: "expired" } : { tone: "warning", label: "paused" };
  if (f.lastRunStatus === "running" || f.lastRunStatus === "queued") return { tone: "info", label: "running" };
  if (f.lastRunStatus === "waiting_approval") return { tone: "warning", label: "needsApproval" };
  if (f.publishedVersion != null && f.trigger && f.trigger !== "trigger.manual") return f.lastRunStatus === "failed" ? { tone: "danger", label: "activeFailing" } : { tone: "success", label: "active" };
  if (f.lastRunStatus === "failed") return { tone: "danger", label: "failed" };
  if (f.lastRunStatus === "succeeded") return { tone: "success", label: "healthy" };
  return { tone: "muted", label: "draft" };
}

export function useCreateFlow() {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  return useMutation({
    mutationFn: (body: { name?: string; templateId?: string }) => api<{ flow: { id: string } }>(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: body }),
    onSuccess: ({ flow }) => router.push(`/w/${workspace.slug}/flows/${flow.id}`),
    onError: (e) => toast(apiErrorMessage(t, e, t("flows.createError")), "danger"),
  });
}

export function Dashboard() {
  const t = useT();
  const { workspace, canEdit } = useWorkspace();
  const online = useOnline();
  const now = useNow();
  const [q, setQ] = useState("");
  const overview = useQuery({ queryKey: ["overview", workspace.id], queryFn: () => api<Overview>(`/api/workspaces/${workspace.id}/overview`), refetchInterval: 10_000 });
  const usage = useQuery({ queryKey: ["usage", workspace.id], queryFn: () => api<Usage>(`/api/workspaces/${workspace.id}/usage`), refetchInterval: 30_000 });
  const flows = useQuery({ queryKey: ["flows", workspace.id], queryFn: () => api<{ flows: FlowRow[] }>(`/api/workspaces/${workspace.id}/flows`), select: (d) => d.flows });
  const create = useCreateFlow();
  const router = useRouter();
  // "Create with Copilot" makes no flow until a proposal is approved (no empty drafts left behind).
  const [copilotOpen, setCopilotOpen] = useState(false);
  const copilotButton = useRef<HTMLButtonElement>(null); // the panel gives focus back here when it closes (Escape or ×)

  const filtered = useMemo(() => (flows.data ?? []).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())), [flows.data, q]);
  const isMobile = useViewport() === "mobile";
  // Mobile is monitor-first: a new flow couldn't be edited (or built with Copilot) here anyway.
  const newReason = !canEdit ? t("flows.reasons.viewer") : !online ? t("flows.reasons.offline") : isMobile ? t("flows.reasons.mobile") : null;
  const copilotVisible = copilotOpen && !newReason;
  const copilotMounted = useKeepMounted(copilotVisible);
  const untitled = t("common.untitledFlow");

  return (
    <div className="flex flex-col">
      <PageHeader title={t("flows.title")}>
        <label className="sr-only" htmlFor="flow-search">
          {t("flows.searchLabel")}
        </label>
        <Input id="flow-search" placeholder={t("flows.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-44 sm:w-60" />
        <Button ref={copilotButton} onClick={() => setCopilotOpen(true)} disabledReason={newReason}>
          {t("flows.createWithCopilot")}
        </Button>
        <Button variant="primary" onClick={() => create.mutate({ name: untitled })} loading={create.isPending} disabledReason={newReason}>
          {t("flows.newFlow")}
        </Button>
      </PageHeader>
      {copilotMounted && (
        <div hidden={!copilotVisible} className="fixed inset-y-0 end-0 z-40 w-full max-w-md">
          <CopilotPanel open={copilotVisible} target={{ kind: "new", workspaceId: workspace.id }} onClose={() => setCopilotOpen(false)} returnFocusTo={() => copilotButton.current} onApplied={({ flowId }) => router.push(`/w/${workspace.slug}/flows/${flowId}`)} />
        </div>
      )}

      <div className="flex flex-col gap-5 p-4 sm:p-6">
        {/* KPIs */}
        <section aria-label={t("flows.kpiAria")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {overview.isPending ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)
          ) : overview.isError ? (
            <div className="col-span-full">
              <ErrorState title={t("flows.numbersError")} body={apiErrorMessage(t, overview.error)} onRetry={() => overview.refetch()} retrying={overview.isFetching} />
            </div>
          ) : (
            <>
              <Kpi label={t("flows.kpi.flows")} value={t.number(overview.data.flows)} note={t.plural("flows.kpi.ranIn24h", overview.data.flowsRun24h)} />
              <Kpi
                label={t("flows.kpi.runs24h")}
                value={t.number(overview.data.runs24h)}
                note={overview.data.successRate24h == null ? t("flows.kpi.noFinished") : t("flows.kpi.successNote", { pct: t.percent(overview.data.successRate24h) })}
              />
              <UsageKpi usage={usage.data} loading={usage.isPending} />
              {(() => {
                const o = overview.data;
                const n = o.failed24h + o.pendingApprovals + o.unhealthyConnections.length;
                const parts = [
                  o.failed24h && t.plural("flows.kpi.failed", o.failed24h),
                  o.pendingApprovals && t.plural("flows.kpi.awaitingApproval", o.pendingApprovals),
                  o.unhealthyConnections.length && t.plural("flows.kpi.connectionsExpired", o.unhealthyConnections.length),
                ].filter(Boolean);
                return <Kpi label={t("flows.kpi.needsAttention")} value={t.number(n)} note={parts.length ? parts.join(" · ") : t("flows.kpi.nothing")} tone={n ? "danger" : undefined} />;
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
              <ErrorState title={t("flows.flowsError")} body={apiErrorMessage(t, flows.error)} onRetry={() => flows.refetch()} retrying={flows.isFetching} />
            </div>
          ) : flows.data.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon="⚡"
                title={t("flows.empty.title")}
                body={t("flows.empty.body")}
                action={
                  <>
                    <Button variant="primary" onClick={() => create.mutate({ name: untitled })} disabledReason={newReason} loading={create.isPending}>
                      {t("flows.newFlow")}
                    </Button>
                    <ButtonLink href={`/w/${workspace.slug}/templates`} variant="ghost">
                      {t("flows.empty.browse")}
                    </ButtonLink>
                  </>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState icon="⌕" title={t("flows.noMatch.title")} body={t("flows.noMatch.body", { q })} action={<Button onClick={() => setQ("")}>{t("flows.noMatch.clear")}</Button>} />
            </div>
          ) : (
            <table className="w-full text-start text-base">
              <thead className="text-xs font-medium tracking-[0.4px] text-muted uppercase">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">{t("flows.table.flow")}</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">{t("flows.table.trigger")}</th>
                  <th className="px-4 py-3 font-medium">{t("flows.table.status")}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{t("flows.table.lastRun")}</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">{t("flows.table.success")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const st = flowStatus(f);
                  return (
                    <tr key={f.id} className="motion-list-in group relative border-b border-line last:border-0 hover:bg-elevated/40">
                      <td className="px-4 py-3">
                        <Link href={`/w/${workspace.slug}/flows/${f.id}`} className="font-semibold after:absolute after:inset-0 group-hover:text-hi">
                          <bdi>{f.name}</bdi>
                        </Link>
                        <span className="data ms-2 text-xs text-muted">{t.plural("flows.nodes", f.nodeCount)}</span>
                      </td>
                      <td className="hidden px-4 py-3 text-med md:table-cell">{f.trigger ? t(TRIGGER_LABEL[f.trigger] ?? "flows.trigger.generic") : <span className="text-muted">{t("flows.trigger.none")}</span>}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={st.tone}>{t(`flows.status.${st.label}`)}</StatusBadge>
                      </td>
                      <td className="data hidden px-4 py-3 text-sm text-med sm:table-cell">{t.relative(f.lastRunAt, now)}</td>
                      <td className="data hidden px-4 py-3 text-sm text-med lg:table-cell">{t.percent(f.successRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {/* Activity */}
        <Card className="p-4">
          <h2 className="mb-3 text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("flows.activity.title")}</h2>
          {overview.isPending ? (
            <div className="grid gap-2 md:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          ) : overview.isError ? (
            <p className="text-base text-med">{t("flows.activity.unavailable")}</p>
          ) : overview.data.recent.length === 0 && overview.data.worker.online && overview.data.pendingApprovals === 0 && overview.data.unhealthyConnections.length === 0 ? (
            <p className="text-base text-med">{t("flows.activity.empty")}</p>
          ) : (
            <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
              {overview.data.unhealthyConnections.map((c) => (
                <li key={c.id} className="motion-list-in flex min-w-0 items-center gap-2 text-base">
                  <Dot tone="warning" />
                  <span className="min-w-0 truncate text-med">
                    {t("flows.activity.connection", { label: c.label, status: c.status })}
                    {overview.data.pausedFlows ? t.plural("flows.activity.pausedFlows", overview.data.pausedFlows) : ""}
                  </span>
                  <Link href={`/w/${workspace.slug}/integrations`} className="ms-auto shrink-0 text-sm text-warning hover:underline">
                    {t("flows.activity.reconnect")}
                  </Link>
                </li>
              ))}
              {overview.data.pendingApprovals - overview.data.pendingAgentApprovals.length > 0 && (
                <li className="motion-list-in flex min-w-0 items-center gap-2 text-base">
                  <Dot tone="warning" />
                  <span className="min-w-0 truncate text-med">
                    {t.plural("flows.activity.workflowApprovals", overview.data.pendingApprovals - overview.data.pendingAgentApprovals.length)}
                  </span>
                  <Link href={`/w/${workspace.slug}/runs?status=waiting`} className="ms-auto shrink-0 text-sm text-warning hover:underline">
                    {t("flows.activity.review")}
                  </Link>
                </li>
              )}
              {overview.data.pendingAgentApprovals.map((a) => (
                <li key={a.agentRunId} className="motion-list-in flex min-w-0 items-center gap-2 text-base">
                  <Dot tone="warning" />
                  <span className="min-w-0 truncate text-med">{t("flows.activity.agentWaiting", { name: a.agentName })}</span>
                  <Link href={`/w/${workspace.slug}/agents/${a.agentId}?tab=runs&run=${a.agentRunId}`} className="ms-auto shrink-0 text-sm text-warning hover:underline">
                    {t("flows.activity.review")}
                  </Link>
                </li>
              ))}
              {!overview.data.worker.online && (
                <li className="motion-list-in flex items-center gap-2 text-base">
                  <Dot tone="warning" />
                  <span className="text-med">
                    {t("flows.activity.workerOffline")}
                    {overview.data.activeRuns ? t.plural("flows.activity.runsWaiting", overview.data.activeRuns) : ""}
                  </span>
                </li>
              )}
              {overview.data.recent.map((r) => (
                <li key={r.id} className="motion-list-in flex min-w-0 items-center gap-2 text-base">
                  <Dot tone={RUN_TONE[r.status] ?? "muted"} />
                  <span className="min-w-0 truncate text-med">
                    <span className="font-medium text-hi">{t("flows.activity.run", { number: r.number })}</span> <bdi>{r.flowName}</bdi> ·{" "}
                    {r.status === "succeeded"
                      ? t("flows.activity.completed", { done: r.stepsDone, total: r.steps, duration: t.duration(r.durationMs) })
                      : r.status === "failed"
                        ? r.error?.message
                          ? t("flows.activity.failedWith", { message: stepErrorText(t, r.error) })
                          : t("flows.activity.failed")
                        : r.status === "queued"
                          ? t("flows.activity.queued")
                          : t("flows.activity.inProgress", { step: r.stepsDone + 1, total: r.steps })}
                  </span>
                  <Link href={`/w/${workspace.slug}/runs?run=${r.id}`} className={`ms-auto shrink-0 text-sm hover:underline ${r.status === "failed" ? "text-danger" : "text-accent-text"}`}>
                    {t("flows.activity.inspect")}
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
  const t = useT();
  if (loading || !usage) return <Kpi label={t("flows.kpi.usage")} value="…" note={t("flows.kpi.loading")} muted />;
  const money = (micros: number) => t.number(micros / 1_000_000, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tokens = usage.rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0);
  const unpriced = usage.rows.reduce((n, r) => n + r.unpriced, 0);
  const budget = usage.budgetMicros != null ? ` / ${money(usage.budgetMicros)}` : "";
  const note = [tokens ? t.plural("flows.kpi.aiTokens", tokens) : t("flows.kpi.noAi"), unpriced ? t("flows.kpi.unpriced", { count: t.number(unpriced) }) : null].filter(Boolean).join(" · ");
  // Currency code + amount read left-to-right in both languages ("USD 1.25 / 10.00").
  return <Kpi label={t("flows.kpi.usage")} value={<bdi dir="ltr">{`${usage.currency} ${money(usage.totalMicros)}${budget}`}</bdi>} note={note} />;
}

function Kpi({ label, value, note, tone, muted }: { label: string; value: React.ReactNode; note: string; tone?: "danger"; muted?: boolean }) {
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
