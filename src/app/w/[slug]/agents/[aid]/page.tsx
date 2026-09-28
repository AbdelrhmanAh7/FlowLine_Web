"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, ErrorState, Skeleton, StatusBadge, Textarea, cx, type Tone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useOnline } from "@/lib/hooks";
import { can, denyReason, type Role } from "@/lib/permissions";
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
const LABEL: Record<AgentRunDetail["status"], string> = { queued: "Queued", running: "Running", waiting_approval: "Needs approval", succeeded: "Answered", failed: "Failed", cancelled: "Cancelled" };
const active = (s: string) => s === "queued" || s === "running";

export default function AgentPage({ params }: { params: Promise<{ aid: string }> }) {
  const { aid } = use(params);
  const { role } = useWorkspace();
  // Deep links (e.g. the dashboard's "Review →"): ?tab=runs&run=<id> opens that run with its decision controls.
  const params2 = useSearchParams();
  const [tab, setTab] = useState<"chat" | "config" | "runs">(() => (params2.get("tab") === "runs" || params2.get("run") ? "runs" : params2.get("tab") === "config" ? "config" : "chat"));
  const q = useQuery({ queryKey: ["agent", aid], queryFn: () => api<AgentDetail>(`/api/agents/${aid}`) });
  return (
    <div className="flex flex-col">
      <PageHeader title={q.data?.agent.name ?? "Agent"} sub={q.data ? `v${q.data.current.version} · ${q.data.agent.description || "No description"}` : undefined} />
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div role="tablist" aria-label="Agent sections" className="flex gap-1">
          {(["chat", "config", "runs"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("h-8 rounded-md px-3 text-base", tab === t ? "bg-card text-hi" : "text-med hover:text-hi")}>
              {t === "chat" ? "Chat" : t === "config" ? "Configuration" : "Runs"}
            </button>
          ))}
        </div>
        {q.isPending ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : q.isError ? (
          <ErrorState title="Couldn't load the agent" body={(q.error as Error).message} onRetry={() => q.refetch()} />
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
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (c: AgentConfig) => api(`/api/agents/${detail.agent.id}`, { method: "PUT", json: c }),
    onSuccess: () => {
      toast("Saved as a new version — past runs keep the version they used", "success");
      void qc.invalidateQueries({ queryKey: ["agent", detail.agent.id] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save", "danger"),
  });
  const { current, agent } = detail;
  return (
    <div className="max-w-3xl">
      <AgentForm
        key={current.id}
        initial={{ name: agent.name, description: agent.description, instructions: current.instructions, provider: current.provider, model: current.model, tools: current.tools, knowledgeSourceIds: current.knowledgeSourceIds, limits: current.limits }}
        saving={save.isPending}
        onSave={(c) => save.mutate(c)}
        readOnlyReason={can(role, "agent.edit") ? null : denyReason(role, "agent.edit")}
        submitLabel="Save new version"
      />
      <p className="mt-3 text-sm text-muted">Versions: {detail.versions.map((v) => `v${v.version}`).join(", ")}</p>
    </div>
  );
}

function Chat({ agentId, role, onReview }: { agentId: string; role: Role; onReview: () => void }) {
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
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't send", "danger"),
  });
  const reason = !can(role, "agent.run") ? denyReason(role, "agent.run") : !online ? "You're offline" : !msg.trim() ? "Type a message" : null;
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {(waiting.data ?? 0) > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning" data-testid="agent-waiting-banner">
          {waiting.data} request{waiting.data! > 1 ? "s" : ""} from this agent {waiting.data! > 1 ? "are" : "is"} waiting for a decision.
          <button className="underline" onClick={onReview}>
            Review in Runs
          </button>
        </p>
      )}
      {runIds.length === 0 ? (
        <EmptyState icon="✦" title="Start a conversation" body="Ask a question or ask the agent to run one of its workflows." />
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Conversation">
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
          Message the agent
        </label>
        <Textarea
          id="agent-msg"
          rows={3}
          value={msg}
          maxLength={8000}
          placeholder="Ask something…"
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !reason) send.mutate();
          }}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={send.isPending} disabledReason={reason}>
            Send
          </Button>
          {conversationId && (
            <Button
              variant="ghost"
              onClick={() => {
                setConversationId(undefined);
                setRunIds([]);
              }}
            >
              New conversation
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Turn({ runId, role }: { runId: string; role: Role }) {
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
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't record the decision", "danger"),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/api/agent-runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agent-run", runId] }),
  });
  const r = q.data;
  if (!r) return <Skeleton className="h-20" />;
  const pending = r.approvals.filter((a) => a.status === "pending");
  const decideReason = can(role, "approval.decide") ? null : denyReason(role, "approval.decide");
  return (
    <li className="flex flex-col gap-2" data-testid={`agent-turn-${r.status}`}>
      <p className="self-end rounded-lg bg-card px-3 py-2 text-base whitespace-pre-wrap">{r.input}</p>
      <Card className="flex flex-col gap-2 p-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge tone={TONE[r.status]}>{LABEL[r.status]}</StatusBadge>
          <span className="data text-muted">
            v{r.version} · {r.stepCount} model steps · {r.costMicros > 0 ? `cost ${(r.costMicros / 1_000_000).toFixed(4)}` : "no priced usage"}
          </span>
          {active(r.status) && (
            <Button size="sm" variant="danger-ghost" className="ml-auto" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel
            </Button>
          )}
        </p>
        {active(r.status) && <p className="text-base text-info">Thinking…</p>}
        {r.output && <p className="text-base whitespace-pre-wrap">{r.output}</p>}
        {r.error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            {r.error.message}
          </p>
        )}
        {(r.citations?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Sources</p>
            <ol className="mt-1 list-decimal pl-5 text-sm text-med">
              {r.citations!.map((c, i) => (
                <li key={i}>{c.label}</li>
              ))}
            </ol>
          </div>
        )}
        {pending.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/5 p-3" data-testid="agent-approval">
            <p className="text-sm text-hi">The agent wants to run a tool that needs a human decision ({a.actionId}). Expires {new Date(a.expiresAt).toLocaleString()}.</p>
            <pre className="data max-h-40 overflow-auto rounded-md border border-line bg-app p-2 text-xs">{JSON.stringify(a.argsPreview, null, 2)}</pre>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabledReason={decideReason} loading={decideM.isPending && decideM.variables?.decision === "approve"} onClick={() => decideM.mutate({ id: a.id, decision: "approve" })}>
                Approve
              </Button>
              <Button size="sm" variant="danger" disabledReason={decideReason} loading={decideM.isPending && decideM.variables?.decision === "reject"} onClick={() => decideM.mutate({ id: a.id, decision: "reject" })}>
                Reject
              </Button>
            </div>
          </div>
        ))}
        <button className="self-start text-sm text-accent hover:underline" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
          {showSteps ? "Hide steps" : `Show steps (${r.steps.length})`}
        </button>
        {showSteps && <StepList steps={r.steps} />}
      </Card>
    </li>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Agent steps">
      {steps.map((s) => (
        <li key={s.index} className="rounded-md border border-line bg-app p-2 text-sm">
          <p className="flex flex-wrap gap-x-2">
            <span className="data text-muted">#{s.index >= 10_000 ? s.index - 10_000 : s.index}</span>
            <span className="font-medium">{s.kind === "model" ? "Model" : s.tool}</span>
            {s.decision && <span className={cx(s.decision === "deny" || s.decision === "rejected" ? "text-danger" : s.decision === "ask" ? "text-warning" : "text-success")}>{s.decision}</span>}
            {s.latencyMs != null && <span className="data text-muted">{s.latencyMs} ms</span>}
            {s.inputTokens != null && (
              <span className="data text-muted">
                {s.inputTokens}+{s.outputTokens} tokens
              </span>
            )}
            <span className="data ml-auto text-muted">{new Date(s.at).toLocaleTimeString()}</span>
          </p>
          {s.error && <p className="text-danger">{s.error.message}</p>}
          {s.kind === "tool" && s.args != null && <pre className="data mt-1 max-h-24 overflow-auto text-xs text-med">{JSON.stringify(s.args)}</pre>}
        </li>
      ))}
    </ol>
  );
}

function Runs({ agentId, role, initialRun }: { agentId: string; role: Role; initialRun: string | null }) {
  const q = useQuery({ queryKey: ["agent-runs", agentId], queryFn: () => api<{ runs: { id: string; status: AgentRunDetail["status"]; input: string; createdAt: string; stepCount: number }[] }>(`/api/agents/${agentId}/runs`), select: (d) => d.runs, refetchInterval: 10_000 });
  const [picked, setOpen] = useState<string | null>(initialRun);
  // Default to the oldest request still waiting for a decision, so it can be decided right here.
  const open = picked ?? q.data?.filter((r) => r.status === "waiting_approval").at(-1)?.id ?? null;
  if (q.isPending) return <Skeleton className="h-40" />;
  if (q.isError) return <ErrorState title="Couldn't load runs" body={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <EmptyState icon="◷" title="No runs yet" />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ul className="flex flex-col gap-1.5" aria-label="Agent runs">
        {q.data.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpen(r.id)} className={cx("flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left", open === r.id ? "border-accent bg-card" : "border-line hover:bg-card")}>
              <StatusBadge tone={TONE[r.status]}>{LABEL[r.status]}</StatusBadge>
              <span className="min-w-0 flex-1 truncate text-base">{r.input}</span>
              <span className="data text-xs text-muted">{timeAgo(r.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        {open ? (
          // The same view as in Chat: answer, sources, steps — and Approve/Reject for a waiting request (disabled with the reason for roles that can't decide).
          <ol aria-label="Selected run">
            <Turn key={open} runId={open} role={role} />
          </ol>
        ) : (
          <p className="text-base text-muted">Select a run to see its steps.</p>
        )}
      </div>
    </div>
  );
}
