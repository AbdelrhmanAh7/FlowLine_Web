"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, ErrorState, Skeleton, StatusBadge, Textarea, cx, type Tone } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText, stepErrorText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import { dataText } from "@/i18n/workspace-text";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/hooks";
import { can, type Role } from "@/lib/permissions";
import { AgentForm, type AgentConfig } from "../agent-form";

interface AgentDetail {
  agent: { id: string; name: string; description: string };
  current: AgentConfig & { id: string; version: number };
  versions: { id: string; version: number; createdAt: string }[];
}
interface Step {
  index: number;
  kind: "model" | "tool";
  tool: string | null;
  args: unknown;
  decision: string | null;
  result: unknown;
  error: { code: string; message: string } | null;
  latencyMs: number | null;
  costMicros: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  at: string;
}
interface AgentRunDetail {
  id: string;
  status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
  input: string;
  output: string | null;
  citations: { sourceName: string; label: string }[] | null;
  error: { code: string; message: string } | null;
  conversationId: string | null;
  costMicros: number;
  stepCount: number;
  version: number | null;
  createdAt: string;
  steps: Step[];
  approvals: { id: string; status: string; actionId: string; argsPreview: unknown; expiresAt: string }[];
}

const TONE: Record<AgentRunDetail["status"], Tone> = { queued: "muted", running: "info", waiting_approval: "warning", succeeded: "success", failed: "danger", cancelled: "muted" };
const active = (s: string) => s === "queued" || s === "running";

export default function AgentPage({ params }: { params: Promise<{ aid: string }> }) {
  const t = useT();
  const { aid } = use(params);
  const { role } = useWorkspace();
  // Deep links (e.g. the dashboard's "Review →"): ?tab=runs&run=<id> opens that run with its decision controls.
  const params2 = useSearchParams();
  const [tab, setTab] = useState<"chat" | "config" | "runs">(() => (params2.get("tab") === "runs" || params2.get("run") ? "runs" : params2.get("tab") === "config" ? "config" : "chat"));
  const q = useQuery({ queryKey: ["agent", aid], queryFn: () => api<AgentDetail>(`/api/agents/${aid}`) });
  return (
    <div className="flex flex-col">
      <PageHeader
        title={q.data?.agent.name ?? t("agents.detail.fallbackTitle")}
        sub={q.data ? t("agents.detail.sub", { version: q.data.current.version, description: q.data.agent.description || t("agents.noDescription") }) : undefined}
      />
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div role="tablist" aria-label={t("agents.detail.tabsAria")} className="flex gap-1">
          {(["chat", "config", "runs"] as const).map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("h-8 rounded-md px-3 text-base", tab === id ? "bg-card text-hi" : "text-med hover:text-hi")}>
              {t(`agents.detail.tabs.${id}`)}
            </button>
          ))}
        </div>
        {q.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : q.isError ? (
          <ErrorState title={t("agents.detail.loadError")} body={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : tab === "chat" ? (
          <Chat agentId={aid} role={role as Role} onReview={() => setTab("runs")} />
        ) : tab === "config" ? (
          <Config detail={q.data} role={role as Role} />
        ) : (
          <Runs agentId={aid} role={role as Role} initialRun={params2.get("run")} />
        )}
      </div>
    </div>
  );
}

function Config({ detail, role }: { detail: AgentDetail; role: Role }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (c: AgentConfig) => api(`/api/agents/${detail.agent.id}`, { method: "PUT", json: c }),
    onSuccess: () => {
      toast(t("agents.detail.saved"), "success");
      void qc.invalidateQueries({ queryKey: ["agent", detail.agent.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("agents.detail.saveError")), "danger"),
  });
  const { current, agent } = detail;
  return (
    <div className="max-w-3xl">
      <AgentForm
        key={current.id}
        initial={{ name: agent.name, description: agent.description, instructions: current.instructions, provider: current.provider, model: current.model, route: current.route ?? null, tools: current.tools, knowledgeSourceIds: current.knowledgeSourceIds, limits: current.limits }}
        saving={save.isPending}
        onSave={(c) => save.mutate(c)}
        readOnlyReason={can(role, "agent.edit") ? null : denyReasonText(t, role, "agent.edit")}
        submitLabel={t("agents.detail.saveVersion")}
      />
      <p className="mt-3 text-sm text-muted">
        {t("agents.detail.versions", { list: detail.versions.map((v) => t("agents.detail.versionTag", { version: v.version })).join(t("perm.listSep")) })}
      </p>
    </div>
  );
}

function Chat({ agentId, role, onReview }: { agentId: string; role: Role; onReview: () => void }) {
  const t = useT();
  const toast = useToast();
  const online = useOnline();
  // Requests from earlier conversations that still wait for a person: never lost when you navigate away.
  const waiting = useQuery({
    queryKey: ["agent-runs", agentId],
    queryFn: () => api<{ runs: { id: string; status: AgentRunDetail["status"] }[] }>(`/api/agents/${agentId}/runs`),
    select: (d) => d.runs.filter((r) => r.status === "waiting_approval").length,
    refetchInterval: 10_000,
  });
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [runIds, setRunIds] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const send = useMutation({
    mutationFn: () => api<{ run: { id: string; conversationId: string } }>(`/api/agents/${agentId}/runs`, { method: "POST", json: { message: msg, conversationId } }),
    onSuccess: ({ run }) => {
      setConversationId(run.conversationId);
      setRunIds((r) => [...r, run.id]);
      setMsg("");
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("agents.chat.sendError")), "danger"),
  });
  const reason = !can(role, "agent.run") ? denyReasonText(t, role, "agent.run") : !online ? t("agents.chat.offline") : !msg.trim() ? t("agents.chat.typeMessage") : null;
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {(waiting.data ?? 0) > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning" data-testid="agent-waiting-banner">
          {t.plural("agents.chat.waiting", waiting.data!)}
          <button className="underline" onClick={onReview}>
            {t("agents.chat.review")}
          </button>
        </p>
      )}
      {runIds.length === 0 ? (
        <EmptyState icon="✦" title={t("agents.chat.startTitle")} body={t("agents.chat.startBody")} />
      ) : (
        <ol className="flex flex-col gap-3" aria-label={t("agents.chat.conversationAria")}>
          {runIds.map((id) => (
            <Turn key={id} runId={id} role={role} />
          ))}
        </ol>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <label htmlFor="agent-msg" className="sr-only">
          {t("agents.chat.messageLabel")}
        </label>
        <Textarea
          id="agent-msg"
          rows={3}
          value={msg}
          maxLength={8000}
          placeholder={t("agents.chat.placeholder")}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !reason) send.mutate();
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={send.isPending} disabledReason={reason}>
            {t("agents.chat.send")}
          </Button>
          {conversationId && (
            <Button
              variant="ghost"
              onClick={() => {
                setConversationId(undefined);
                setRunIds([]);
              }}
            >
              {t("agents.chat.newConversation")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Turn({ runId, role }: { runId: string; role: Role }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [showSteps, setShowSteps] = useState(false);
  const q = useQuery({
    queryKey: ["agent-run", runId],
    queryFn: () => api<{ run: AgentRunDetail }>(`/api/agent-runs/${runId}`),
    select: (d) => d.run,
    refetchInterval: (query) => {
      const s = query.state.data?.run.status;
      return !s || active(s) ? 800 : s === "waiting_approval" ? 3000 : false;
    },
  });
  const decideM = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject" }) => api(`/api/approvals/${v.id}/decide`, { method: "POST", json: { decision: v.decision } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agent-run", runId] });
      void qc.invalidateQueries({ queryKey: ["agent-runs"] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("agents.run.decideError")), "danger"),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/api/agent-runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agent-run", runId] }),
  });
  const r = q.data;
  if (!r) return <Skeleton className="h-20" />;
  const pending = r.approvals.filter((a) => a.status === "pending");
  const decideReason = can(role, "approval.decide") ? null : denyReasonText(t, role, "approval.decide");
  return (
    <li className="motion-list-in flex flex-col gap-2" data-testid={`agent-turn-${r.status}`}>
      <p className="self-end rounded-lg bg-card px-3 py-2 text-base whitespace-pre-wrap">{r.input}</p>
      <Card className="flex flex-col gap-2 p-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge tone={TONE[r.status]}>{t(`agents.run.status.${r.status}`)}</StatusBadge>
          <span className="data text-muted">
            {t("agents.run.meta", {
              version: r.version ?? "—",
              steps: t.plural("agents.run.modelSteps", r.stepCount),
              cost: r.costMicros > 0 ? t("agents.run.cost", { amount: (r.costMicros / 1_000_000).toFixed(4) }) : t("agents.run.noPricedUsage"),
            })}
          </span>
          {active(r.status) && (
            <Button size="sm" variant="danger-ghost" className="ms-auto" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              {t("agents.run.cancel")}
            </Button>
          )}
        </p>
        {active(r.status) && <p className="text-base text-info">{t("agents.run.thinking")}</p>}
        {r.output && <p className="text-base whitespace-pre-wrap">{r.output}</p>}
        {r.error && (
          <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
            {stepErrorText(t, r.error)}
          </p>
        )}
        {(r.citations?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("agents.run.sources")}</p>
            <ol className="mt-1 list-decimal ps-5 text-sm text-med">
              {r.citations!.map((c, i) => (
                <li key={i}>{c.label}</li>
              ))}
            </ol>
          </div>
        )}
        {pending.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 rounded-md border border-warning-border bg-warning-bg p-3" data-testid="agent-approval">
            <p className="text-sm text-hi">
              {t.rich("agents.run.approvalBody", {
                action: (
                  <span dir="ltr" className="data">
                    {a.actionId}
                  </span>
                ),
                date: t.date(a.expiresAt),
              })}
            </p>
            <pre dir="ltr" className="data max-h-40 overflow-auto rounded-md border border-line bg-app p-2 text-xs">{JSON.stringify(a.argsPreview, null, 2)}</pre>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabledReason={decideReason} loading={decideM.isPending && decideM.variables?.decision === "approve"} onClick={() => decideM.mutate({ id: a.id, decision: "approve" })}>
                {t("agents.run.approve")}
              </Button>
              <Button size="sm" variant="danger" disabledReason={decideReason} loading={decideM.isPending && decideM.variables?.decision === "reject"} onClick={() => decideM.mutate({ id: a.id, decision: "reject" })}>
                {t("agents.run.reject")}
              </Button>
            </div>
          </div>
        ))}
        <button className="self-start text-sm text-accent-text hover:underline" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
          {showSteps ? t("agents.run.hideSteps") : t("agents.run.showSteps", { count: r.steps.length })}
        </button>
        {showSteps && <StepList steps={r.steps} />}
      </Card>
    </li>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  const t = useT();
  return (
    <ol className="flex flex-col gap-1.5" aria-label={t("agents.run.stepsAria")}>
      {steps.map((s) => (
        <li key={s.index} className="motion-list-in rounded-md border border-line bg-app p-2 text-sm">
          <p className="flex flex-wrap gap-x-2">
            <span className="data text-muted">#{s.index >= 10_000 ? s.index - 10_000 : s.index}</span>
            <span className="font-medium">{s.kind === "model" ? t("agents.run.model") : s.tool}</span>
            {s.decision && (
              <span className={cx(s.decision === "deny" || s.decision === "rejected" ? "text-danger" : s.decision === "ask" ? "text-warning" : "text-success")}>{dataText(t, "agents.run.decision", s.decision)}</span>
            )}
            {s.latencyMs != null && <span className="data text-muted">{t("agents.run.latency", { ms: s.latencyMs })}</span>}
            {s.inputTokens != null && <span className="data text-muted">{t("agents.run.tokens", { input: s.inputTokens, output: s.outputTokens ?? 0 })}</span>}
            <span className="data ms-auto text-muted">{t.date(s.at, { timeStyle: "medium" })}</span>
          </p>
          {s.error && <p className="text-danger">{stepErrorText(t, s.error)}</p>}
          {s.kind === "tool" && s.args != null && <pre dir="ltr" className="data mt-1 max-h-24 overflow-auto text-xs text-med">{JSON.stringify(s.args)}</pre>}
        </li>
      ))}
    </ol>
  );
}

function Runs({ agentId, role, initialRun }: { agentId: string; role: Role; initialRun: string | null }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["agent-runs", agentId],
    queryFn: () => api<{ runs: { id: string; status: AgentRunDetail["status"]; input: string; createdAt: string; stepCount: number }[] }>(`/api/agents/${agentId}/runs`),
    select: (d) => d.runs,
    refetchInterval: 10_000,
  });
  const [picked, setOpen] = useState<string | null>(initialRun);
  // Default to the oldest request still waiting for a decision, so it can be decided right here.
  const open = picked ?? q.data?.filter((r) => r.status === "waiting_approval").at(-1)?.id ?? null;
  if (q.isPending) return <Skeleton className="h-40" />;
  if (q.isError) return <ErrorState title={t("agents.runs.loadError")} body={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <EmptyState icon="◷" title={t("agents.runs.empty")} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ul className="flex flex-col gap-1.5" aria-label={t("agents.runs.listAria")}>
        {q.data.map((r) => (
          <li key={r.id} className="motion-list-in">
            <button onClick={() => setOpen(r.id)} className={cx("flex w-full items-center gap-2 rounded-md border px-3 py-2 text-start", open === r.id ? "border-accent bg-card" : "border-line hover:bg-card")}>
              <StatusBadge tone={TONE[r.status]}>{t(`agents.run.status.${r.status}`)}</StatusBadge>
              <span className="min-w-0 flex-1 truncate text-base">{r.input}</span>
              <span className="data text-xs text-muted">{t.relative(r.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        {open ? (
          // The same view as in Chat: answer, sources, steps — and Approve/Reject for a waiting request (disabled with the reason for roles that can't decide).
          <ol aria-label={t("agents.runs.selectedAria")}>
            <Turn key={open} runId={open} role={role} />
          </ol>
        ) : (
          <p className="text-base text-muted">{t("agents.runs.selectHint")}</p>
        )}
      </div>
    </div>
  );
}
