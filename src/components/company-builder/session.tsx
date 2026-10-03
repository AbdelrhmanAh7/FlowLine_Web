"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, ErrorState, InlineConfirmation, Skeleton } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import { api, ApiError } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";
import { ExperimentPanel, ExperimentTracker, reportHelp, type HelpTopic } from "./experiment";
import { FactsPanel } from "./facts";
import { InterviewCard } from "./interview";
import { PlanPanel, TaskCard } from "./plan";
import { PrototypePanel } from "./prototype";
import { EntitlementBox, ReviewInbox } from "./reviews";
import { cbt } from "./text";
import type { Overview } from "./types";

const clickKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

/** Focus a section heading after an action (non-modal panels: no focus trap, focus goes where the result is). */
const focusHeading = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 50);

export function CompanyBuilderSession({ sessionId }: { sessionId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const { workspace, role } = useWorkspace();
  const r = role as Role;
  const base = `/api/workspaces/${workspace.id}/company-builder`;
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["cb-session", sessionId, cursor],
    queryFn: () => api<Overview>(`${base}/sessions/${sessionId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    // Poll only while something is in flight (a trial run, an installation).
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && (d.tasks.some((x) => x.trial?.status === "running") || d.planInstallation?.status === "installing") ? 1500 : false;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["cb-session", sessionId] });

  const errorText = (e: unknown) => {
    if (e instanceof ApiError && ["UPLOAD_WORKSPACE_STORAGE_LIMIT", "UPLOAD_INSTALLATION_STORAGE_LIMIT", "UPLOAD_STORAGE_CONFIG"].includes(e.code)) return apiErrorMessage(t, e);
    if (e instanceof ApiError && t.has(`companyBuilder.errors.${e.code}`)) return cbt(t, `errors.${e.code}`);
    return t("companyBuilder.errors.generic");
  };
  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
      after?.();
    } catch (e) {
      setError(errorText(e));
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const answer = useMutation({
    mutationFn: (b: { questionId: string; value: unknown; unknown: boolean; mode: "answer" | "correction" }) => api(`${base}/sessions/${sessionId}/answer`, { method: "POST", json: { ...b, revision: q.data!.session.revision } }),
    onSuccess: async () => {
      setError(null);
      setCursor(null);
      await refresh();
    },
    onError: async (e) => {
      setError(e instanceof ApiError && e.code === "REVISION_CONFLICT" ? t("companyBuilder.interview.conflictTab") : errorText(e));
      await refresh();
    },
  });

  // FB2-10: one delete in flight at a time; an interview that is already gone (another tab, a double click) counts
  // as deleted, and any other failure is shown instead of being swallowed.
  const remove = useMutation({
    mutationFn: () => api(`${base}/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => router.push(`/w/${workspace.slug}/company`),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 404) router.push(`/w/${workspace.slug}/company`);
    },
  });

  if (q.isPending) return <Skeleton className="m-6 h-64 rounded-xl" />;
  if (q.isError) return <ErrorState title={t("companyBuilder.loadError")} onRetry={() => q.refetch()} />;
  const data = q.data;
  const s = data.session;
  const canEdit = can(r, "flow.edit");
  const canRun = can(r, "flow.run");
  const installed = data.installation?.status === "installed";
  const helpEvent = (topic: HelpTopic) => {
    if (data.experiment) reportHelp(base, sessionId, topic);
  };

  return (
    <div className="flex flex-col">
      <PageHeader title={t("companyBuilder.title")} sub={t("companyBuilder.promise")}>
        <Button size="sm" variant="ghost" onClick={() => window.open(`${base}/sessions/${sessionId}/export`, "_blank", "noopener")}>
          {t("companyBuilder.exportInterview")}
        </Button>
        {canEdit && !deleting && (
          <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(true)} data-testid="cb-delete">
            {t("companyBuilder.deleteInterview")}
          </Button>
        )}
      </PageHeader>
      {deleting && (
        <InlineConfirmation label={t("companyBuilder.deleteInterview")} onCancel={() => setDeleting(false)} className="mx-4 mt-4 sm:mx-6">
          <p className="text-sm text-med">{t("companyBuilder.deleteConfirm")}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" loading={remove.isPending} disabled={remove.isPending} onClick={() => remove.mutate()} data-testid="cb-delete-confirm">
              {t("companyBuilder.deleteInterview")}
            </Button>
            <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setDeleting(false)}>
              {t("common.cancel")}
            </Button>
          </div>
          {remove.isError && !(remove.error instanceof ApiError && remove.error.status === 404) && (
            <p role="alert" className="mt-2 text-sm text-danger" data-testid="cb-delete-error">
              {errorText(remove.error)}
            </p>
          )}
        </InlineConfirmation>
      )}
      <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {s.question && canEdit ? (
            <InterviewCard
              key={`${s.question.id}-${s.question.current?.version ?? 0}`}
              question={s.question}
              answered={s.answered}
              backTo={s.backTo}
              pending={answer.isPending}
              error={error}
              onAnswer={(value, unknown) => answer.mutate({ questionId: s.question!.id, value, unknown, mode: "answer" })}
              onBack={(id) => setCursor(id)}
            />
          ) : (
            s.question === null && <p className="text-sm text-muted">{t("companyBuilder.interview.done")}</p>
          )}
          {!s.question && error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <PlanPanel
            data={data}
            canEdit={canEdit}
            busy={busy}
            onGenerate={() => run("generate", () => api(`${base}/sessions/${sessionId}/blueprint`, { method: "POST", json: {} }), () => focusHeading("cb-plan-heading"))}
            onApprove={() => run("approve", () => api(`${base}/blueprints/${data.blueprint!.id}/approve`, { method: "POST", json: {} }))}
            onInstall={() => run("install", () => api(`${base}/blueprints/${data.blueprint!.id}/install`, { method: "POST", json: {} }))}
            onHelp={(topic) => helpEvent(topic)}
            onCancelInstall={() => run("cancelInstall", () => api(`${base}/installations/${data.planInstallation!.id}/cancel`, { method: "POST", json: {} }))}
          />
          {installed && (
            <section aria-label={t("companyBuilder.plan.rolesHeading")} className="flex flex-col gap-3" data-testid="cb-tasks">
              {data.tasks
                .filter((v) => v.task.availability === "operational")
                .map((v) => (
                  <TaskCard
                    key={v.task.id}
                    view={v}
                    slug={workspace.slug}
                    canRun={canRun}
                    canPublish={can(r, "flow.publish")}
                    busy={busy}
                    timezone={data.timezone}
                    onHelp={helpEvent}
                    onVerdict={(trialId, verdict, reason) => run(`verdict:${v.task.id}`, () => api(`${base}/trials/${trialId}/verdict`, { method: "POST", json: reason ? { verdict, reason } : { verdict } }))}
                    onTry={() => run(`try:${v.task.id}`, () => api(`${base}/installations/${data.installation!.id}/tasks/${v.task.id}/trial`, { method: "POST", json: { trialKey: clickKey() } }))}
                    onSendForReview={(trialId) => run(`review:${trialId}`, () => api(`${base}/trials/${trialId}/review`, { method: "POST", json: {} }), () => focusHeading("cb-inbox-heading"))}
                    onActivate={() => run(`activate:${v.task.id}`, () => api(`${base}/installations/${data.installation!.id}/tasks/${v.task.id}/activate`, { method: "POST", json: {} }), () => focusHeading("cb-inbox-heading"))}
                    onPause={() => run(`pause:${v.task.id}`, () => api(`${base}/installations/${data.installation!.id}/tasks/${v.task.id}/pause`, { method: "POST", json: {} }))}
                  />
                ))}
            </section>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <FactsPanel facts={s.facts} pending={answer.isPending} error={error} onCorrect={(questionId, value, unknown) => answer.mutateAsync({ questionId, value, unknown, mode: "correction" })} />
          {installed && (
            <ReviewInbox
              data={data}
              canDecide={can(r, "approval.decide")}
              isOwner={r === "owner"}
              busy={busy}
              onDecide={(id, decision) => run(`decide:${id}`, () => api(`${base}/reviews/${id}`, { method: "POST", json: { decision } }))}
              onVerify={(id) => run(`verify:${id}`, () => api(`${base}/reviews/${id}/verify`, { method: "POST", json: {} }))}
            />
          )}
          {installed && <EntitlementBox data={data} isOwner={r === "owner"} busy={busy} onGrant={() => run("grant", () => api(`${base}/entitlement`, { method: "POST", json: { action: "grant_dev_trial" } }))} onCancel={() => run("cancelTrial", () => api(`${base}/entitlement`, { method: "POST", json: { action: "cancel_dev_trial" } }))} />}
          {data.prototype.allowed && <PrototypePanel base={base} data={data} />}
          {!data.prototype.allowed && data.prototype.reason && <p className="text-xs text-muted">{t("companyBuilder.prototype.unavailable", { reason: cbt(t, `prototype.reason.${data.prototype.reason}`) })}</p>}
          <Link href={`/w/${workspace.slug}/flows`} className="text-sm text-accent-text hover:underline">
            {t("companyBuilder.advanced")}
          </Link>
        </div>
      </div>
      {data.experiment && (
        <div className="mx-auto w-full max-w-6xl p-4 pt-0 sm:p-6 sm:pt-0">
          <ExperimentPanel base={base} sessionId={sessionId} refreshKey={`${data.session.revision}:${data.tasks.map((x) => `${x.trial?.id ?? ""}${x.trial?.userVerdict ?? ""}${x.trial?.status ?? ""}`).join(",")}:${data.blueprint?.version ?? 0}`} />
        </div>
      )}
      <ExperimentTracker base={base} sessionId={sessionId} enabled={data.experiment === true} />
    </div>
  );
}
