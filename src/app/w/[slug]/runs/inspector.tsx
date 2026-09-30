"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { NodeType } from "@/engine/types";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { metaText } from "@/lib/meta-text";
import { useToast } from "@/components/toast";
import { Button, Dialog, Drawer, EmptyState, ErrorState, Input, RUN_TONE, Skeleton, StatusBadge, TabPanel, Tabs, cx, useConfirm, useSidePanel } from "@/components/ui";
import { useT } from "@/i18n/client";
import { approvalActionId, denyReasonText, runLabel, skipReasonText, statusWord, stepErrorText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";
import { pretty } from "@/lib/format";
import { useNow, useOnline, useViewport } from "@/lib/hooks";
import { isActive, isOpen, type ApprovalDto, type RunDetailDto, type RunListItem, type RunStepDto } from "@/lib/types";

type Filter = "all" | "succeeded" | "failed" | "running" | "waiting" | "cancelled";
const FILTERS: readonly Filter[] = ["all", "succeeded", "failed", "running", "waiting", "cancelled"];

/** Suggested fix per error code (catalogue `runs.fixes.<CODE>`); unknown codes get the generic NODE_ERROR advice. */
function fixFor(t: ReturnType<typeof useT>, code: string): string {
  return t.has(`runs.fixes.${code}`) ? t(`runs.fixes.${code}` as MessageKey) : t("runs.fixes.NODE_ERROR");
}
/** The action a step waits on or ran, when the loaded run is the row's own (list rows don't carry approvals). */
const actionIdOf = (run: RunDetailDto | undefined, runId: string, nodeId: string) => (run?.id === runId ? approvalActionId(run.approvals, nodeId) : null);
const DOT: Record<string, string> = { succeeded: "bg-success", reused: "bg-success", failed: "bg-danger", running: "bg-info", skipped: "bg-muted", pending: "bg-muted", cancelled: "bg-muted", waiting_approval: "bg-warning", uncertain: "bg-warning" };

export function RunInspector() {
  const { workspace, canEdit } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const t = useT();
  const toast = useToast();
  const online = useOnline();
  const viewport = useViewport();
  const now = useNow(10_000);

  const filter = (params.get("status") as Filter) || "all";
  const selectedRunId = params.get("run");
  const [autoSelect, setAutoSelect] = useState(true);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [stepId, setStepId] = useState<string | null>(params.get("step"));
  const [tab, setTab] = useState<"input" | "output" | "error" | "log" | null>(null);
  const [rerunFor, setRerunFor] = useState<RunStepDto | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const setParam = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || (k === "status" && v === "all")) sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const runs = useInfiniteQuery({
    queryKey: ["runs", workspace.id, filter, debouncedQ],
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ limit: "25" });
      if (filter !== "all") sp.set("status", filter);
      if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
      if (pageParam) {
        sp.set("beforeAt", pageParam.createdAt);
        sp.set("beforeId", pageParam.id);
      }
      return api<{ runs: RunListItem[]; nextCursor: { createdAt: string; id: string } | null }>(`/api/workspaces/${workspace.id}/runs?${sp}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: (query) => (query.state.data?.pages.some((p) => p.runs.some((r) => isOpen(r.status))) ? 3000 : false),
  });
  const allRuns = runs.data?.pages.flatMap((p) => p.runs) ?? [];

  const activeRunId = selectedRunId ?? (autoSelect ? allRuns[0]?.id : null) ?? null;
  const detail = useQuery({
    queryKey: ["run", activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => api<{ run: RunDetailDto }>(`/api/runs/${activeRunId}`),
    select: (d) => d.run,
    refetchInterval: (query) => (query.state.data && isActive(query.state.data.run.status) ? 800 : query.state.data?.run.status === "waiting_approval" ? 4000 : false),
  });

  const run = detail.data;
  const defaultStep = run
    ? (run.steps.find((s) => s.status === "waiting_approval" || s.status === "uncertain") ??
      run.steps.find((s) => s.status === "failed") ??
      run.steps.filter((s) => s.status !== "skipped" && s.status !== "pending").at(-1) ??
      run.steps[0])
    : undefined;
  const step = run?.steps.find((s) => s.nodeId === stepId) ?? defaultStep;
  const effectiveTab = tab === null ? (step?.status === "failed" ? "error" : "output") : tab === "error" && step?.status !== "failed" ? "output" : tab;

  const selectRun = (id: string) => {
    setStepId(null);
    setTab(null);
    setParam({ run: id, step: null });
  };
  const closeRun = () => {
    setAutoSelect(false);
    setParam({ run: null });
  };
  const selectStep = (s: Pick<RunStepDto, "nodeId" | "status">) => {
    setStepId(s.nodeId);
    setTab(null);
  };

  const cancel = useMutation({
    mutationFn: (id: string) => api<{ status: string }>(`/api/runs/${id}/cancel`, { method: "POST" }),
    onSuccess: (r) => {
      toast(r.status === "cancelled" ? t("runs.cancelled") : t("runs.cancelling"), "info");
      void qc.invalidateQueries({ queryKey: ["run", activeRunId] });
      void qc.invalidateQueries({ queryKey: ["runs", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("runs.cancelError")), "danger"),
  });

  const rerunReason = !canEdit
    ? t("runs.rerunReason.viewer")
    : !online
      ? t("runs.rerunReason.offline")
      : run && isOpen(run.status)
        ? t("runs.rerunReason.open")
        : step?.status === "pending"
          ? t("runs.rerunReason.pending")
          : null;

  const hasFilters = filter !== "all" || debouncedQ.trim() !== "";
  // What names the phone bottom sheet: the run it shows (the step's own name is the panel's heading inside it).
  const sheetLabel = run ? `${run.flowName} · ${t("runs.panel.runRef", { number: run.number })}` : t("runs.title");
  const detailPanel = run && step && (
    <StepPanel
      desktop={viewport !== "mobile"}
      run={run}
      step={step}
      tab={effectiveTab}
      setTab={setTab}
      onSelectStep={selectStep}
      onClose={closeRun}
      rerunReason={rerunReason}
      onRerun={() => setRerunFor(step)}
      onCancel={() => cancel.mutate(run.id)}
      cancelling={cancel.isPending}
    />
  );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={t("runs.title")} />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
            <label htmlFor="run-search" className="sr-only">
              {t("runs.searchLabel")}
            </label>
            <Input
              id="run-search"
              placeholder={t("runs.searchPlaceholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setParam({ q: e.target.value });
              }}
              className="h-8 w-full sm:w-64"
            />
            <div role="group" aria-label={t("runs.filterAria")} className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  aria-pressed={filter === f}
                  onClick={() => setParam({ status: f, run: null })}
                  className={cx("h-7 rounded-md px-2.5 text-base transition-colors duration-[var(--dur-tab)]", filter === f ? "bg-elevated text-hi" : "text-med hover:text-hi")}
                >
                  {t(`runs.filters.${f}`)}
                </button>
              ))}
            </div>
          </div>

          {runs.isPending ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-[58px] rounded-xl" />)
          ) : runs.isError ? (
            <ErrorState title={t("runs.loadError")} body={apiErrorMessage(t, runs.error, (runs.error as Error).message)} onRetry={() => runs.refetch()} retrying={runs.isFetching} />
          ) : allRuns.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon="⌕"
                title={t("runs.noMatchTitle")}
                body={t("runs.noMatchBody")}
                action={
                  <Button
                    onClick={() => {
                      setQ("");
                      setParam({ q: null, status: null, run: null });
                    }}
                  >
                    {t("runs.clearFilters")}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon="◷"
                title={t("runs.emptyTitle")}
                body={t("runs.emptyBody")}
                action={
                  <Link className="text-accent-text hover:underline" href={`/w/${workspace.slug}/flows`}>
                    {t("runs.goToFlows")} <span aria-hidden className="flip-rtl">→</span>
                  </Link>
                }
              />
            )
          ) : (
            <>
              <ul className="flex flex-col gap-3" aria-label={t("runs.runsAria")}>
                {allRuns.map((r) => {
                  const open = r.id === activeRunId;
                  const done = r.steps.filter((s) => s.status === "succeeded" || s.status === "reused").length;
                  const total = r.steps.filter((s) => s.status !== "skipped").length;
                  const attention = r.steps.find((s) => s.status === "failed" || s.status === "waiting_approval" || s.status === "uncertain");
                  return (
                    <li key={r.id} className={cx("motion-list-in rounded-xl border bg-card", open ? "border-line-strong" : "border-line")}>
                      <button id={`run-row-${r.id}`} onClick={() => selectRun(r.id)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-start">
                        <span aria-hidden className="text-sm text-muted">{open ? "▾" : "▸"}</span>
                        <span className="data text-med">#{r.number}</span>
                        <bdi className="font-semibold">{r.flowName}</bdi>
                        <StatusBadge tone={RUN_TONE[r.status] ?? "muted"} upper>
                          {runLabel(t, r.status)}
                        </StatusBadge>
                        <span className="data text-sm text-muted">
                          {done}/{total} · {t.duration(r.durationMs)}
                        </span>
                        {r.triggerKind && r.triggerKind !== "manual" && (
                          <span className="rounded-sm border border-line px-1.5 text-xs text-med">{t.has(`runs.trigger.${r.triggerKind}`) ? t(`runs.trigger.${r.triggerKind}` as MessageKey) : r.triggerKind}</span>
                        )}
                        <span className="data ms-auto text-sm text-muted">{t.relative(r.createdAt, now)}</span>
                      </button>
                      {open && (
                        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
                          <ol className="flex flex-wrap items-center gap-2" aria-label={t("runs.stepsAria")}>
                            {r.steps.map((s, i) => {
                              const def = NODE_DEFINITIONS[s.nodeType as NodeType];
                              const selected = run?.id === r.id && step?.nodeId === s.nodeId;
                              return (
                                <li key={s.nodeId} className="motion-list-in flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      if (r.id !== activeRunId) setParam({ run: r.id });
                                      selectStep(s);
                                    }}
                                    aria-pressed={selected}
                                    className={cx(
                                      "min-w-28 rounded-lg border bg-app px-3 py-2 text-start hover:bg-elevated",
                                      selected
                                        ? "border-accent"
                                        : s.status === "failed"
                                          ? "border-danger-border"
                                          : s.status === "waiting_approval" || s.status === "uncertain"
                                            ? "border-warning-border"
                                            : s.status === "skipped" || s.status === "cancelled"
                                              ? "border-dashed border-line-strong opacity-60"
                                              : "border-line",
                                    )}
                                  >
                                    <span className="block max-w-36 truncate text-sm font-medium">
                                      <span aria-hidden className="text-muted">{def?.icon} </span>
                                      <bdi>{s.nodeLabel}</bdi>
                                    </span>
                                    <StatusBadge tone={RUN_TONE[s.status] ?? "muted"} className="text-xs">
                                      {runLabel(t, s.status)}
                                      {s.durationMs != null && <span className="data">· {t.duration(s.durationMs)}</span>}
                                    </StatusBadge>
                                  </button>
                                  {i < r.steps.length - 1 && <span aria-hidden className="flip-rtl text-muted">→</span>}
                                </li>
                              );
                            })}
                          </ol>
                          {attention && (
                            <div className={cx("flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-base", attention.status === "failed" ? "border-danger-border bg-danger-bg" : "border-warning-border bg-warning-bg")}>
                              <span className={cx("min-w-0 flex-1", attention.status === "failed" ? "text-danger" : "text-warning")}>
                                {attention.status === "failed" ? "⚠" : "⏸"} {attention.nodeLabel} — <span className="text-med">{attention.error ? stepErrorText(t, attention.error, { actionId: actionIdOf(run, r.id, attention.nodeId), nodeLabel: attention.nodeLabel }) : runLabel(t, attention.status)}</span>
                              </span>
                              <Button size="sm" variant={attention.status === "failed" ? "danger" : "secondary"} onClick={() => selectStep(attention)}>
                                {attention.status === "failed" ? t("runs.inspect") : t("runs.review")}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {runs.hasNextPage && (
                <Button className="self-center" onClick={() => runs.fetchNextPage()} loading={runs.isFetchingNextPage}>
                  {t("runs.loadOlder")}
                </Button>
              )}
            </>
          )}
        </div>

        {viewport === "mobile" ? (
          selectedRunId && detailPanel ? (
            // A real modal dialog on phone widths (DV2-Q05): named after the run, focus moves into it and is trapped, and
            // Escape / a tap on the scrim close it exactly like the panel's close button (clear `run`). Focus goes back to
            // the run row that opened it. While it is open the run list behind it is hidden from assistive technology, as
            // for any modal. The desktop split layout below is not modal.
            <Drawer
              open
              onOpenChange={(o) => !o && closeRun()}
              variant="sheet"
              label={sheetLabel}
              closeLabel={t("runs.panel.close")}
              testId="run-sheet"
              fallbackFocus={() => document.getElementById(`run-row-${selectedRunId}`)}
            >
              {detailPanel}
            </Drawer>
          ) : null
        ) : (
          <div className="w-full shrink-0 lg:sticky lg:top-20 lg:w-[420px]">
            {detail.isLoading ? (
              <Skeleton className="h-96 rounded-xl" />
            ) : detail.isError ? (
              <ErrorState title={t("runs.loadRunError")} body={apiErrorMessage(t, detail.error, (detail.error as Error).message)} onRetry={() => detail.refetch()} />
            ) : detailPanel ? (
              <div className="rounded-xl border border-line bg-surface">{detailPanel}</div>
            ) : null}
          </div>
        )}
      </div>
      {rerunFor && run && (
        <RerunDialog
          run={run}
          step={rerunFor}
          onClose={() => setRerunFor(null)}
          onStarted={(id) => {
            setRerunFor(null);
            void qc.invalidateQueries({ queryKey: ["runs", workspace.id] });
            selectRun(id);
          }}
        />
      )}
    </div>
  );
}

function StepPanel({
  desktop,
  run,
  step,
  tab,
  setTab,
  onSelectStep,
  onClose,
  rerunReason,
  onRerun,
  onCancel,
  cancelling,
}: {
  desktop: boolean;
  run: RunDetailDto;
  step: RunStepDto;
  tab: "input" | "output" | "error" | "log";
  setTab: (t: "input" | "output" | "error" | "log") => void;
  onSelectStep: (s: RunStepDto) => void;
  onClose: () => void;
  rerunReason: string | null;
  onRerun: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { canEdit, workspace } = useWorkspace();
  const t = useT();
  const { panelRef, onKeyDown } = useSidePanel<HTMLDivElement>({
    open: desktop,
    onClose,
    returnFocusTo: () => document.getElementById(`run-row-${run.id}`),
  });
  const def = NODE_DEFINITIONS[step.nodeType as NodeType];
  const failed = step.status === "failed";
  const pending = (run.approvals ?? []).find((a) => a.nodeId === step.nodeId && a.status === "pending");
  const meta = step.meta ?? {};
  const events = (run.events ?? []).filter((e) => e.nodeId === step.nodeId || e.nodeId === null);
  return (
    <div ref={panelRef} onKeyDown={desktop ? onKeyDown : undefined} className="flex flex-col gap-4 p-5" data-testid="step-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="text-accent-text">{def?.icon}</span>
            <bdi>{step.nodeLabel}</bdi>
            <StatusBadge tone={RUN_TONE[step.status] ?? "muted"} upper>
              {runLabel(t, step.status)}
            </StatusBadge>
          </h2>
          <p className="data mt-1 text-sm text-muted">
            {t.duration(step.durationMs)} · {t("runs.panel.runRef", { number: run.number })} · v{run.version} · {step.nodeType} · {step.nodeId}
            {step.attempts ? ` · ${t.plural("runs.panel.attempts", step.attempts)}` : ""}
          </p>
        </div>
        <button data-initial-focus onClick={onClose} aria-label={t("runs.panel.close")} className="flex size-8 shrink-0 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {isOpen(run.status) && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
          <span className="text-med">{run.cancelRequestedAt ? t("runs.panel.cancelling") : run.status === "waiting_approval" ? t("runs.panel.waiting") : t("runs.panel.inProgress")}</span>
          <Button size="sm" variant="danger-ghost" onClick={onCancel} loading={cancelling} disabledReason={!canEdit ? t("runs.panel.viewersCantCancel") : run.cancelRequestedAt ? t("runs.panel.alreadyCancelling") : null}>
            {t("runs.panel.cancelRun")}
          </Button>
        </div>
      )}

      {pending && <DecisionBox approval={pending} runId={run.id} />}

      {Object.keys(meta).length > 0 && (
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" aria-label={t("runs.panel.details")}>
          {Object.entries(meta)
            .filter(([k, v]) => !["approvalId", "reviewId"].includes(k) && (v !== null || k === "costMicros"))
            .map(([k, v]) => (
              <div key={k} className="contents">
                {/* CXQ-02: the converted amount is labelled with its real unit (the workspace currency), not "costMicros". */}
                <dt className="text-muted">{k === "costMicros" ? t("runs.panel.costIn", { currency: workspace.currency ?? "USD" }) : k}</dt>
                <dd className="data truncate text-hi" title={metaText(v)}>
                  {k === "costMicros" ? (v == null ? t("runs.panel.costUnknown") : (Number(v) / 1_000_000).toFixed(6)) : metaText(v)}
                </dd>
              </div>
            ))}
        </dl>
      )}

      <Tabs
        tabs={(["input", "output", "error", "log"] as const).map((id) => ({
          id,
          label: (
            <>
              {t(`runs.panel.tabs.${id}`)}
              {id === "error" && failed && <span aria-hidden className="ms-1.5 inline-block size-1.5 rounded-full bg-danger" />}
            </>
          ),
          disabledReason: id === "error" && !failed ? t("runs.panel.didntFail") : null,
        }))}
        value={tab}
        onChange={setTab}
        label={t("runs.panel.payload")}
        // The step panel already has its own p-5: no extra inset on the strip, and the pre-migration 36px / gap-4 look.
        listClassName="gap-4 px-0"
        tabClassName="h-9"
      >
        {(["input", "output", "error", "log"] as const).map((id) => (
          <TabPanel key={id} value={id} className="pt-4">
            {id === "log" ? (
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm" aria-label={t("runs.panel.eventLog")}>
                {(step.log ?? []).map((l, i) => (
                  <li key={`l${i}`} className="data text-med">
                    {l}
                  </li>
                ))}
                {events.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="data shrink-0 text-muted">{t.date(e.at, { timeStyle: "medium" })}</span>
                    <span className="text-hi">{t.has(`runEvent.${e.type}`) ? t(`runEvent.${e.type}` as MessageKey) : e.type.replace(/_/g, " ")}</span>
                    {e.data != null && <span className="data truncate text-muted">{JSON.stringify(e.data)}</span>}
                  </li>
                ))}
                {events.length === 0 && !(step.log ?? []).length && <li className="text-muted">{t("runs.panel.noEvents")}</li>}
              </ul>
            ) : (step.status === "skipped" || step.status === "cancelled") && id !== "error" ? (
              <p className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-base text-med">
                {t("runs.panel.skipped", { status: runLabel(t, step.status), reason: step.skipReason ? skipReasonText(t, step.skipReason) : t("runs.panel.notReached") })}
              </p>
            ) : step.status === "pending" ? (
              <p className="text-base text-med">{t("runs.panel.waitingToRun")}</p>
            ) : id === "error" && step.error ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-danger-border bg-danger-bg p-3">
                  <p className="data font-medium text-danger">⚠ {step.error.code}</p>
                  <p className="mt-1 text-base text-hi">{stepErrorText(t, step.error, { actionId: actionIdOf(run, run.id, step.nodeId), nodeLabel: step.nodeLabel })}</p>
                </div>
                <div className="rounded-lg border border-line bg-card p-3">
                  <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("runs.panel.suggestedFix")}</p>
                  <p className="mt-1 text-base text-med">{fixFor(t, step.error.code)}</p>
                </div>
              </div>
            ) : (
              <pre dir="ltr" className="data max-h-80 overflow-auto rounded-lg border border-line bg-app p-3 text-sm whitespace-pre-wrap break-all">
                {id === "input"
                  ? pretty(step.input)
                  : step.status === "failed"
                    ? t("runs.panel.failedOutput")
                    : step.status === "waiting_approval" || step.status === "uncertain"
                      ? t("runs.panel.pausedOutput", { status: runLabel(t, step.status).toLowerCase() })
                      : pretty(step.output)}
              </pre>
            )}
          </TabPanel>
        ))}
      </Tabs>

      <div className="flex flex-col gap-1.5">
        <Button variant="primary" className="self-start" onClick={onRerun} disabledReason={rerunReason}>
          {t("runs.panel.rerun")}
        </Button>
        <p className="text-sm text-muted">{t("runs.panel.rerunHint")}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("runs.panel.steps")}</p>
        <div className="flex flex-wrap gap-2">
          {run.steps.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectStep(s)}
              aria-label={t("runs.panel.stepStatus", { label: s.nodeLabel, status: runLabel(t, s.status) })}
              title={t("runs.panel.stepStatus", { label: s.nodeLabel, status: runLabel(t, s.status) })}
              aria-pressed={s.nodeId === step.nodeId}
              className={cx("flex h-8 w-11 items-center justify-center rounded-md border bg-card", s.nodeId === step.nodeId ? "border-accent" : "border-line hover:bg-elevated")}
            >
              <span className={cx("size-2 rounded-full", DOT[s.status])} />
            </button>
          ))}
        </div>
      </div>
      {run.status === "succeeded" && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("runs.panel.runOutput")}</p>
          <pre dir="ltr" className="data max-h-40 overflow-auto rounded-lg border border-line bg-app p-3 text-sm">{pretty(run.output)}</pre>
        </div>
      )}
    </div>
  );
}

function DecisionBox({ approval, runId }: { approval: ApprovalDto; runId: string }) {
  const { role } = useWorkspace();
  const qc = useQueryClient();
  const t = useT();
  const toast = useToast();
  const [note, setNote] = useState("");
  const approved = useConfirm();
  const rejected = useConfirm();
  const decide = useMutation({
    mutationFn: (decision: string) => api(`/api/approvals/${approval.id}/decide`, { method: "POST", json: { decision, note: note || undefined } }),
    onSuccess: (_r, decision) => {
      if (decision === "approve") approved.flash();
      else if (decision === "reject") rejected.flash();
      toast(t("runs.decision.recorded"), "success");
      void qc.invalidateQueries({ queryKey: ["run", runId] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("runs.decision.error")), "danger"),
  });
  // Same rule the server enforces (approval.decide): viewers can see the request but not decide it.
  const reason = can(role as Role, "approval.decide") ? null : denyReasonText(t, role as Role, "approval.decide");
  const review = approval.kind === "review";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning-border bg-warning-bg p-3" data-testid="decision-box">
      <p className="text-base font-semibold text-warning">{review ? t("runs.decision.reviewTitle") : t("runs.decision.approvalTitle")}</p>
      <p className="text-sm text-med">
        {review ? t("runs.decision.reviewBody") : t("runs.decision.approvalBody")}{" "}
        {t("runs.decision.expires", {
          date: t.date(approval.expiresAt, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }),
        })}
      </p>
      <pre dir="ltr" className="data max-h-40 overflow-auto rounded-md border border-line bg-app p-2 text-sm">{pretty(approval.argsPreview)}</pre>
      <label htmlFor={`note-${approval.id}`} className="sr-only">
        {t("runs.decision.note")}
      </label>
      <Input id={`note-${approval.id}`} className="h-8" placeholder={t("runs.decision.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <div className="flex flex-wrap gap-2">
        {review ? (
          <>
            <Button size="sm" variant="primary" onClick={() => decide.mutate("done")} loading={decide.isPending && decide.variables === "done"} disabledReason={reason}>
              {t("runs.decision.done")}
            </Button>
            <Button size="sm" onClick={() => decide.mutate("retry")} loading={decide.isPending && decide.variables === "retry"} disabledReason={reason}>
              {t("runs.decision.retry")}
            </Button>
            <Button size="sm" variant="danger" onClick={() => decide.mutate("fail")} loading={decide.isPending && decide.variables === "fail"} disabledReason={reason}>
              {t("runs.decision.fail")}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" confirm={approved.confirmed} onClick={() => decide.mutate("approve")} loading={decide.isPending && decide.variables === "approve"} disabledReason={reason}>
              {t("runs.decision.approve")}
            </Button>
            <Button size="sm" variant="danger" confirm={rejected.confirmed} onClick={() => decide.mutate("reject")} loading={decide.isPending && decide.variables === "reject"} disabledReason={reason}>
              {t("runs.decision.reject")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface Preview {
  revision: string;
  willRerun: { nodeId: string; label: string; type: string; sideEffect: string; sensitive: boolean; previousStatus: string }[];
  reused: { nodeId: string; label: string }[];
  warnings: string[];
  missingUpstream: string[];
}

function RerunDialog({ run, step, onClose, onStarted }: { run: RunDetailDto; step: RunStepDto; onClose: () => void; onStarted: (runId: string) => void }) {
  const t = useT();
  const toast = useToast();
  const [revision, setRevision] = useState<"original" | "latest">("original");
  const preview = useQuery({
    queryKey: ["rerun-preview", run.id, step.nodeId, revision],
    queryFn: () => api<Preview>(`/api/runs/${run.id}/rerun-preview?fromNodeId=${encodeURIComponent(step.nodeId)}&revision=${revision}`),
    retry: false,
  });
  const start = useMutation({
    mutationFn: () => api<{ run: { id: string; number: number } }>(`/api/runs/${run.id}/rerun`, { method: "POST", json: { fromNodeId: step.nodeId, revision } }),
    onSuccess: ({ run: r }) => {
      toast(t("runs.rerun.started", { number: r.number }), "info");
      onStarted(r.id);
    },
    // No toast for a failure: the dialog stays open, so the error is shown inline next to the action (role="alert")
    // where it stays until the next attempt, instead of vanishing after a few seconds.
  });
  const willRerun = preview.data?.willRerun.length;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("runs.rerun.title", { number: run.number, label: step.nodeLabel })}
      closeLabel={t("runs.rerun.close")}
      className="max-w-lg"
    >
      <fieldset className="mt-3 flex flex-col gap-1.5 text-base">
        <legend className="mb-1 text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("runs.rerun.revision")}</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="rev" checked={revision === "original"} onChange={() => setRevision("original")} />
          {t("runs.rerun.original", { version: run.version ?? "" })}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="rev" checked={revision === "latest"} onChange={() => setRevision("latest")} />
          {t("runs.rerun.latest")}
        </label>
      </fieldset>
      {preview.isPending ? (
        <Skeleton className="mt-4 h-32" />
      ) : preview.isError ? (
        <p role="alert" className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          {apiErrorMessage(t, preview.error, (preview.error as Error).message)}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3" data-testid="rerun-preview">
          {preview.data.warnings.map((w) => (
            <p key={w} role="alert" className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning">
              ⚠ {w}
            </p>
          ))}
          <div>
            <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("runs.rerun.willRerun", { count: t.number(preview.data.willRerun.length) })}</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {preview.data.willRerun.map((s) => (
                <li key={s.nodeId} className="flex flex-wrap gap-x-2">
                  <bdi className="text-hi">{s.label}</bdi>
                  <span className={cx(s.sideEffect === "non_idempotent" ? "text-warning" : "text-muted")}>
                    {t.has(`runs.rerun.sideEffect.${s.sideEffect}`) ? t(`runs.rerun.sideEffect.${s.sideEffect}` as MessageKey) : s.sideEffect.replace("_", "-")}
                  </span>
                  {s.sensitive && <span className="text-warning">{t("runs.rerun.needsApproval")}</span>}
                  <span className="text-muted">{t("runs.rerun.was", { status: statusWord(t, s.previousStatus) })}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">
              {t("runs.rerun.reused", { number: run.number, count: t.number(preview.data.reused.length) })}
            </p>
            <p className="mt-1 text-sm text-med">{preview.data.reused.map((r) => r.label).join(t("perm.listSep")) || "—"}</p>
          </div>
          {preview.data.missingUpstream.length > 0 && <p className="text-sm text-warning">{t("runs.rerun.missing", { labels: preview.data.missingUpstream.join(t("perm.listSep")) })}</p>}
        </div>
      )}
      {start.isError && (
        <p role="alert" data-testid="rerun-error" className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          {apiErrorMessage(t, start.error, t("runs.rerun.startError"))}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>{t("runs.rerun.cancel")}</Button>
        <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending} disabledReason={preview.isSuccess ? null : t("runs.rerun.waitingPreview")}>
          {willRerun == null ? t("runs.rerun.startPending") : t.plural("runs.rerun.start", willRerun)}
        </Button>
      </div>
    </Dialog>
  );
}
