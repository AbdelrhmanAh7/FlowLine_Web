"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { NodeType } from "@/engine/types";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, EmptyState, ErrorState, Input, RUN_LABEL, RUN_TONE, Skeleton, StatusBadge, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { duration, pretty, timeAgo } from "@/lib/format";
import { useNow, useOnline, useViewport } from "@/lib/hooks";
import { isActive, type RunDetailDto, type RunListItem, type RunStepDto } from "@/lib/types";

type Filter = "all" | "succeeded" | "failed" | "running";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All runs" },
  { id: "succeeded", label: "Succeeded" },
  { id: "failed", label: "Failed" },
  { id: "running", label: "Running" },
];

const FIXES: Record<string, string> = {
  EXPRESSION_SYNTAX: "Fix the expression syntax in this node's config, save, then re-run from this step.",
  EXPRESSION_RUNTIME: "Check that the fields the expression references exist in the Input tab, adjust the node config, then re-run from this step.",
  EXPRESSION_TIMEOUT: "Simplify the expression — it exceeded the 1s sandbox time limit.",
  EXPRESSION_DEPTH: "Remove unbounded recursion from the expression — it exceeded the sandbox depth limit.",
  EXPRESSION_TOO_LONG: "Shorten the expression to under 4,000 characters.",
  VALUE_TOO_LARGE: "Reduce the size of the value this step produces (256KB max).",
  WORKER_LOST: "The worker stopped mid-run. Make sure `pnpm worker` is running, then re-run from this step.",
  NODE_ERROR: "Check the node configuration, then re-run from this step.",
};

export function RunInspector() {
  const { workspace, canEdit } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const viewport = useViewport();
  const now = useNow(10_000);

  const filter = (params.get("status") as Filter) || "all";
  const selectedRunId = params.get("run");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [stepId, setStepId] = useState<string | null>(params.get("step"));
  const [tab, setTab] = useState<"input" | "output" | "error">("output");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const setParam = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || (k === "status" && v === "all")) sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const runs = useQuery({
    queryKey: ["runs", workspace.id, filter, debouncedQ],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (filter !== "all") sp.set("status", filter);
      if (debouncedQ.trim()) sp.set("q", debouncedQ.trim());
      return api<{ runs: RunListItem[] }>(`/api/workspaces/${workspace.id}/runs?${sp}`);
    },
    select: (d) => d.runs,
    refetchInterval: (query) => (query.state.data?.runs.some((r) => isActive(r.status)) ? 2000 : false),
  });

  const activeRunId = selectedRunId ?? runs.data?.[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ["run", activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => api<{ run: RunDetailDto }>(`/api/runs/${activeRunId}`),
    select: (d) => d.run,
    refetchInterval: (query) => (query.state.data && isActive(query.state.data.run.status) ? 800 : false),
  });

  const run = detail.data;
  const defaultStep = run ? (run.steps.find((s) => s.status === "failed") ?? run.steps.filter((s) => s.status !== "skipped" && s.status !== "pending").at(-1) ?? run.steps[0]) : undefined;
  const step = run?.steps.find((s) => s.nodeId === stepId) ?? defaultStep;
  const effectiveTab = tab === "error" && step?.status !== "failed" ? "output" : tab;

  const selectRun = (id: string) => {
    setStepId(null);
    setTab("output");
    setParam({ run: id, step: null });
  };
  const selectStep = (s: RunStepDto) => {
    setStepId(s.nodeId);
    setTab(s.status === "failed" ? "error" : "output");
  };

  const rerun = useMutation({
    mutationFn: (fromNodeId: string) => api<{ run: { id: string; number: number } }>(`/api/runs/${run!.id}/rerun`, { method: "POST", json: { fromNodeId } }),
    onSuccess: ({ run: r }) => {
      toast(`Re-running as #${r.number}`, "info");
      void qc.invalidateQueries({ queryKey: ["runs", workspace.id] });
      selectRun(r.id);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't start the re-run", "danger"),
  });

  const rerunReason = !canEdit
    ? "Viewers can't re-run flows"
    : !online
      ? "You're offline — re-running needs a connection"
      : run && isActive(run.status)
        ? "Wait for this run to finish"
        : step?.status === "pending"
          ? "This step hasn't run yet"
          : null;

  const hasFilters = filter !== "all" || debouncedQ.trim() !== "";
  const detailPanel = run && step && (
    <StepPanel
      run={run}
      step={step}
      tab={effectiveTab}
      setTab={setTab}
      onSelectStep={selectStep}
      onClose={() => setParam({ run: null })}
      rerunReason={rerunReason}
      rerunning={rerun.isPending}
      onRerun={() => rerun.mutate(step.nodeId)}
    />
  );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Run history" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
            <label htmlFor="run-search" className="sr-only">
              Search flows or run number
            </label>
            <Input id="run-search" placeholder="⌕ Search flows or #run id…" value={q} onChange={(e) => {
              setQ(e.target.value);
              setParam({ q: e.target.value });
            }} className="h-8 w-full sm:w-64" />
            <div role="tablist" aria-label="Filter runs" className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setParam({ status: f.id, run: null })}
                  className={cx("h-7 rounded-md px-2.5 text-base transition-colors duration-[var(--dur-tab)]", filter === f.id ? "bg-elevated text-hi" : "text-med hover:text-hi")}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {runs.isPending ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-[58px] rounded-xl" />)
          ) : runs.isError ? (
            <ErrorState title="Couldn't load runs" body={(runs.error as Error).message} onRetry={() => runs.refetch()} retrying={runs.isFetching} />
          ) : runs.data.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon="⌕"
                title="No runs match these filters"
                body="Try clearing the search or switching back to all runs."
                action={
                  <Button
                    onClick={() => {
                      setQ("");
                      setParam({ q: null, status: null, run: null });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon="◷" title="No runs yet" body="Open a flow and press Run. Every step's input, output, and errors are recorded here." action={<Link className="text-accent hover:underline" href={`/w/${workspace.slug}/flows`}>Go to flows →</Link>} />
            )
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Runs">
              {runs.data.map((r) => {
                const open = r.id === activeRunId;
                const done = r.steps.filter((s) => s.status === "succeeded" || s.status === "reused").length;
                const total = r.steps.filter((s) => s.status !== "skipped").length;
                const failedStep = r.steps.find((s) => s.status === "failed");
                return (
                  <li key={r.id} className={cx("rounded-xl border bg-card", open ? "border-line-strong" : "border-line")}>
                    <button onClick={() => selectRun(r.id)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left">
                      <span aria-hidden className="text-sm text-muted">{open ? "▾" : "▸"}</span>
                      <span className="data text-med">#{r.number}</span>
                      <span className="font-semibold">{r.flowName}</span>
                      <StatusBadge tone={RUN_TONE[r.status] ?? "muted"} upper>
                        {RUN_LABEL[r.status]}
                      </StatusBadge>
                      <span className="data text-sm text-muted">
                        {done}/{total} · {duration(r.durationMs)}
                        {r.rerunOfRunId && " · re-run"}
                      </span>
                      <span className="data ml-auto text-sm text-muted">{timeAgo(r.createdAt, now)}</span>
                    </button>
                    {open && (
                      <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
                        <ol className="flex flex-wrap items-center gap-2" aria-label="Steps">
                          {r.steps.map((s, i) => {
                            const def = NODE_DEFINITIONS[s.nodeType as NodeType];
                            const selected = run?.id === r.id && step?.nodeId === s.nodeId;
                            const full = run?.id === r.id ? run.steps.find((x) => x.nodeId === s.nodeId) : undefined;
                            return (
                              <li key={s.nodeId} className="flex items-center gap-2">
                                <button
                                  onClick={() => full && selectStep(full)}
                                  aria-pressed={selected}
                                  className={cx(
                                    "min-w-28 rounded-lg border bg-app px-3 py-2 text-left hover:bg-elevated",
                                    selected ? "border-accent" : s.status === "failed" ? "border-danger/50" : s.status === "skipped" ? "border-dashed border-line-strong opacity-60" : "border-line",
                                  )}
                                >
                                  <span className="block max-w-36 truncate text-sm font-medium">
                                    <span aria-hidden className="text-muted">{def?.icon} </span>
                                    {s.nodeLabel}
                                  </span>
                                  <StatusBadge tone={RUN_TONE[s.status] ?? "muted"} className="text-xs">
                                    {RUN_LABEL[s.status]}
                                    {s.durationMs != null && <span className="data">· {duration(s.durationMs)}</span>}
                                  </StatusBadge>
                                </button>
                                {i < r.steps.length - 1 && <span aria-hidden className="text-muted">→</span>}
                              </li>
                            );
                          })}
                        </ol>
                        {failedStep && (
                          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-base">
                            <span className="min-w-0 flex-1 text-danger">
                              ⚠ {failedStep.nodeLabel} — <span className="text-med">{failedStep.error?.message}</span>
                            </span>
                            <Button size="sm" variant="danger" onClick={() => {
                              const full = run?.steps.find((x) => x.nodeId === failedStep.nodeId);
                              if (full) selectStep(full);
                            }}>
                              Inspect
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail: side panel on desktop/tablet, bottom sheet on mobile */}
        {viewport === "mobile" ? (
          selectedRunId && detailPanel ? (
            <div className="fixed inset-0 z-50 flex items-end">
              <button aria-label="Close step details" className="absolute inset-0 bg-black/60" onClick={() => setParam({ run: null })} />
              <div className="relative max-h-[92vh] w-full animate-sheet-in overflow-y-auto rounded-t-xl border-t border-line bg-surface">{detailPanel}</div>
            </div>
          ) : null
        ) : (
          <div className="w-full shrink-0 lg:sticky lg:top-20 lg:w-[400px]">
            {detail.isLoading ? (
              <Skeleton className="h-96 rounded-xl" />
            ) : detail.isError ? (
              <ErrorState title="Couldn't load this run" body={(detail.error as Error).message} onRetry={() => detail.refetch()} />
            ) : detailPanel ? (
              <div className="rounded-xl border border-line bg-surface">{detailPanel}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function StepPanel({
  run,
  step,
  tab,
  setTab,
  onSelectStep,
  onClose,
  rerunReason,
  rerunning,
  onRerun,
}: {
  run: RunDetailDto;
  step: RunStepDto;
  tab: "input" | "output" | "error";
  setTab: (t: "input" | "output" | "error") => void;
  onSelectStep: (s: RunStepDto) => void;
  onClose: () => void;
  rerunReason: string | null;
  rerunning: boolean;
  onRerun: () => void;
}) {
  const def = NODE_DEFINITIONS[step.nodeType as NodeType];
  const failed = step.status === "failed";
  return (
    <div className="flex flex-col gap-4 p-5" data-testid="step-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="text-accent">{def?.icon}</span>
            {step.nodeLabel}
            <StatusBadge tone={RUN_TONE[step.status] ?? "muted"} upper>
              {RUN_LABEL[step.status]}
            </StatusBadge>
          </h2>
          <p className="data mt-1 text-sm text-muted">
            {duration(step.durationMs)} · run #{run.number} · {step.nodeType} · {step.nodeId}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          ✕
        </button>
      </div>

      <div role="tablist" aria-label="Step payload" className="flex gap-4 border-b border-line">
        {(["input", "output", "error"] as const).map((t) => {
          const disabled = t === "error" && !failed;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              aria-disabled={disabled || undefined}
              title={disabled ? "This step didn't fail" : undefined}
              onClick={() => !disabled && setTab(t)}
              className={cx(
                "relative flex h-9 items-center gap-1.5 text-base capitalize",
                tab === t ? "font-semibold text-hi after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent" : disabled ? "cursor-not-allowed text-muted/60" : "text-muted hover:text-med",
              )}
            >
              {t}
              {t === "error" && failed && <span aria-hidden className="size-1.5 rounded-full bg-danger" />}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {step.status === "skipped" && tab !== "error" ? (
          <p className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-base text-med">Skipped — {step.skipReason ?? "not reached"}.</p>
        ) : step.status === "pending" ? (
          <p className="text-base text-med">Waiting to run…</p>
        ) : tab === "error" && step.error ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-danger/40 bg-danger/5 p-3">
              <p className="data font-medium text-danger">⚠ {step.error.code}</p>
              <p className="mt-1 text-base text-hi">{step.error.message}</p>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Suggested fix</p>
              <p className="mt-1 text-base text-med">{FIXES[step.error.code] ?? FIXES.NODE_ERROR}</p>
            </div>
          </div>
        ) : (
          <pre className="data max-h-80 overflow-auto rounded-lg border border-line bg-app p-3 text-sm whitespace-pre-wrap break-all">
            {tab === "input" ? pretty(step.input) : step.status === "failed" ? "— (step failed; see Error)" : pretty(step.output)}
          </pre>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Button variant="primary" className="self-start" onClick={onRerun} loading={rerunning} disabledReason={rerunReason}>
          ↻ Re-run from this step
        </Button>
        <p className="text-sm text-muted">Upstream outputs are reused — only this step and its dependents re-execute, using the latest saved flow.</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-[0.4px] text-muted uppercase">Steps</p>
        <div className="flex flex-wrap gap-2">
          {run.steps.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectStep(s)}
              aria-label={`${s.nodeLabel}: ${RUN_LABEL[s.status]}`}
              title={`${s.nodeLabel}: ${RUN_LABEL[s.status]}`}
              aria-pressed={s.nodeId === step.nodeId}
              className={cx("flex h-8 w-11 items-center justify-center rounded-md border bg-card", s.nodeId === step.nodeId ? "border-accent" : "border-line hover:bg-elevated")}
            >
              <span className={cx("size-2 rounded-full", { succeeded: "bg-success", reused: "bg-success", failed: "bg-danger", running: "bg-info", skipped: "bg-muted", pending: "bg-muted" }[s.status])} />
            </button>
          ))}
        </div>
      </div>
      {run.status === "succeeded" && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-[0.4px] text-muted uppercase">Run output</p>
          <pre className="data max-h-40 overflow-auto rounded-lg border border-line bg-app p-3 text-sm">{pretty(run.output)}</pre>
        </div>
      )}
    </div>
  );
}
