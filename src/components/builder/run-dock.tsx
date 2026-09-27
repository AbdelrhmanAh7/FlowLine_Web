"use client";

import Link from "next/link";
import { duration, pretty, timeAgo } from "@/lib/format";
import { modKey, useNow } from "@/lib/hooks";
import { runningDetail } from "@/lib/run-status";
import type { RunDetailDto, RunListItem, RunStepDto } from "@/lib/types";
import { Button, RUN_LABEL, RUN_TONE, Skeleton, StatusBadge, cx } from "../ui";

interface Props {
  run: RunDetailDto | null | undefined;
  loading: boolean;
  runs: RunListItem[];
  workspaceSlug: string;
  onSelectRun: (id: string) => void;
  onSelectStep: (nodeId: string) => void;
  onClose: () => void;
  variant: "dock" | "primary";
  onCancel?: () => void;
  cancelling?: boolean;
  canCancel?: boolean;
}

export function RunDock({ run, loading, runs, workspaceSlug, onSelectRun, onSelectStep, onClose, variant, onCancel, cancelling, canCancel }: Props) {
  const open = run && (run.status === "queued" || run.status === "running" || run.status === "waiting_approval");
  return (
    <section
      aria-label="Run dock"
      data-testid="run-dock"
      className={cx("flex flex-col border-t border-line bg-surface", variant === "dock" ? "h-[var(--dock-h)] shrink-0" : "min-h-0 flex-1")}
    >
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
        <h2 className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Runs</h2>
        {run && (
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span className="data text-hi">#{run.number}</span>
            <StatusBadge tone={RUN_TONE[run.status] ?? "muted"} upper>
              {RUN_LABEL[run.status]}
            </StatusBadge>
            <span className="data hidden text-muted sm:inline">
              {run.steps.filter((s) => s.status === "succeeded" || s.status === "reused").length}/{run.steps.filter((s) => s.status !== "skipped").length} · {duration(run.durationMs)}
            </span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {open && onCancel && (
            <Button size="sm" variant="danger-ghost" onClick={onCancel} loading={cancelling} disabledReason={canCancel === false ? "Viewers can't cancel runs" : run?.cancelRequestedAt ? "Cancelling…" : null}>
              Cancel run
            </Button>
          )}
          {run && (
            <Link href={`/w/${workspaceSlug}/runs?run=${run.id}`} className="text-sm text-accent hover:underline">
              Open in inspector →
            </Link>
          )}
          {variant === "dock" && (
            <button onClick={onClose} aria-label={`Hide run dock (${modKey()}J)`} className="flex size-7 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {runs.length > 0 && (
          <ul aria-label="Recent runs" className="hidden w-44 shrink-0 overflow-y-auto border-r border-line py-1 md:block">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onSelectRun(r.id)}
                  aria-current={run?.id === r.id ? "true" : undefined}
                  className={cx("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-card", run?.id === r.id && "bg-card")}
                >
                  <StatusBadge tone={RUN_TONE[r.status] ?? "muted"}>
                    <span className="data text-hi">#{r.number}</span>
                  </StatusBadge>
                  <span className="data ml-auto text-xs text-muted">{timeAgo(r.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="min-w-0 flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-36" />
              ))}
            </div>
          ) : !run ? (
            <p className="text-base text-med">No runs yet. Press Run ({modKey()}↵) to execute this flow; each step&apos;s result appears here.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <ol className="flex flex-wrap items-center gap-2" aria-label={`Steps of run ${run.number}`}>
                {run.steps.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectStep(s.nodeId)}
                      className={cx(
                        "rounded-md border bg-card px-2.5 py-1.5 text-left hover:bg-elevated",
                        s.status === "failed" ? "border-danger/60" : s.status === "skipped" ? "border-dashed border-line-strong opacity-60" : "border-line",
                      )}
                    >
                      <span className="block max-w-36 truncate text-sm font-medium">{s.nodeLabel}</span>
                      {s.status === "running" ? (
                        <RunningBadge step={s} events={run.events} />
                      ) : (
                        <StatusBadge tone={RUN_TONE[s.status] ?? "muted"} className="text-xs">
                          {RUN_LABEL[s.status]}
                          {s.durationMs != null && <span className="data">· {duration(s.durationMs)}</span>}
                        </StatusBadge>
                      )}
                    </button>
                    {i < run.steps.length - 1 && <span aria-hidden className="text-muted">→</span>}
                  </li>
                ))}
              </ol>
              {run.status === "failed" && run.error && (
                <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                  ⚠ {run.error.message}
                </p>
              )}
              {run.status === "succeeded" && (
                <div>
                  <p className="mb-1 text-xs font-medium tracking-[0.4px] text-muted uppercase">Run output</p>
                  <pre className="data max-h-28 overflow-auto rounded-md border border-line bg-app p-2 text-sm">{pretty(run.output)}</pre>
                </div>
              )}
              {(run.status === "queued" || run.status === "running") && (
                <p className="text-sm text-info">{run.cancelRequestedAt ? "Cancelling…" : run.status === "queued" ? "Queued — waiting for the worker…" : "Running…"}</p>
              )}
              {run.status === "waiting_approval" && (
                <p className="text-sm text-warning">
                  Waiting for a human decision.{" "}
                  <Link href={`/w/${workspaceSlug}/runs?run=${run.id}`} className="underline">
                    Review in the inspector →
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RunningBadge({ step, events }: { step: RunStepDto; events: RunDetailDto["events"] }) {
  const now = useNow(1000);
  const d = runningDetail(step, events, now);
  return (
    <StatusBadge tone={d.degraded ? "warning" : "info"} className="text-xs">
      <span data-testid={`running-${step.nodeId}`}>{d.text}</span>
    </StatusBadge>
  );
}
