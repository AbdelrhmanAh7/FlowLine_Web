"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { approvalActionId, runLabel, stepErrorText } from "@/i18n/engine-text";
import { pretty } from "@/lib/format";
import { modKey, useNow } from "@/lib/hooks";
import { runningDetail } from "@/lib/run-status";
import type { RunDetailDto, RunListItem, RunStepDto } from "@/lib/types";
import { Button, RUN_TONE, Skeleton, StatusBadge, cx, useSidePanel } from "../ui";

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
  const t = useT();
  const { panelRef, onKeyDown } = useSidePanel<HTMLElement>({ open: variant === "dock", onClose });
  const open = run && (run.status === "queued" || run.status === "running" || run.status === "waiting_approval");
  return (
    <section
      ref={panelRef}
      onKeyDown={variant === "dock" ? onKeyDown : undefined}
      aria-label={t("runDock.aria")}
      data-testid="run-dock"
      className={cx("flex flex-col border-t border-line bg-surface", variant === "dock" ? "h-[var(--dock-h)] shrink-0" : "min-h-0 flex-1")}
    >
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
        <h2 className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("runDock.title")}</h2>
        {run && (
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span className="data text-hi">#{run.number}</span>
            <StatusBadge tone={RUN_TONE[run.status] ?? "muted"} upper>
              {runLabel(t, run.status)}
            </StatusBadge>
            <span className="data hidden text-muted sm:inline">
              {run.steps.filter((s) => s.status === "succeeded" || s.status === "reused").length}/{run.steps.filter((s) => s.status !== "skipped").length} · {t.duration(run.durationMs)}
            </span>
          </span>
        )}
        <div className="ms-auto flex items-center gap-3">
          {open && onCancel && (
            <Button size="sm" variant="danger-ghost" onClick={onCancel} loading={cancelling} disabledReason={canCancel === false ? t("runDock.viewersCantCancel") : run?.cancelRequestedAt ? t("runDock.cancelling") : null}>
              {t("runDock.cancelRun")}
            </Button>
          )}
          {run && (
            <Link href={`/w/${workspaceSlug}/runs?run=${run.id}`} className="text-sm text-accent-text hover:underline">
              {t("runDock.openInspector")} <span aria-hidden className="flip-rtl">→</span>
            </Link>
          )}
          {variant === "dock" && (
            <button data-initial-focus onClick={onClose} aria-label={t("runDock.hide", { shortcut: `${modKey()}J` })} className="flex size-7 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {runs.length > 0 && (
          <ul aria-label={t("runDock.recent")} className="hidden w-44 shrink-0 overflow-y-auto border-e border-line py-1 md:block">
            {runs.map((r) => (
              <li key={r.id} className="motion-list-in">
                <button
                  onClick={() => onSelectRun(r.id)}
                  aria-current={run?.id === r.id ? "true" : undefined}
                  className={cx("flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-card", run?.id === r.id && "bg-card")}
                >
                  <StatusBadge tone={RUN_TONE[r.status] ?? "muted"}>
                    <span className="data text-hi">#{r.number}</span>
                  </StatusBadge>
                  <span className="data ms-auto text-xs text-muted">{t.relative(r.createdAt)}</span>
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
            <p className="text-base text-med">{t("runDock.empty", { shortcut: `${modKey()}↵` })}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <ol className="flex flex-wrap items-center gap-2" aria-label={t("runDock.steps", { number: run.number })}>
                {run.steps.map((s, i) => (
                  <li key={s.id} className="motion-list-in flex items-center gap-2">
                    <button
                      onClick={() => onSelectStep(s.nodeId)}
                      className={cx(
                        "rounded-md border bg-card px-2.5 py-1.5 text-start hover:bg-elevated",
                        s.status === "failed" ? "border-danger-border" : s.status === "skipped" ? "border-dashed border-line-strong opacity-60" : "border-line",
                      )}
                    >
                      <bdi className="block max-w-36 truncate text-sm font-medium">{s.nodeLabel}</bdi>
                      {s.status === "running" ? (
                        <RunningBadge step={s} events={run.events} />
                      ) : (
                        <StatusBadge tone={RUN_TONE[s.status] ?? "muted"} className="text-xs">
                          {runLabel(t, s.status)}
                          {s.durationMs != null && <span className="data">· {t.duration(s.durationMs)}</span>}
                        </StatusBadge>
                      )}
                    </button>
                    {i < run.steps.length - 1 && <span aria-hidden className="flip-rtl text-muted">→</span>}
                  </li>
                ))}
              </ol>
              {run.status === "failed" && run.error && (
                <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
                  ⚠ {stepErrorText(t, run.error, { actionId: approvalActionId(run.approvals, run.error.nodeId) })}
                </p>
              )}
              {run.status === "succeeded" && (
                <div>
                  <p className="mb-1 text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("runDock.output")}</p>
                  <pre dir="ltr" className="data max-h-28 overflow-auto rounded-md border border-line bg-app p-2 text-sm">{pretty(run.output)}</pre>
                </div>
              )}
              {(run.status === "queued" || run.status === "running") && (
                <p className="text-sm text-info">{run.cancelRequestedAt ? t("runDock.cancelling") : run.status === "queued" ? t("runDock.queued") : t("runDock.running")}</p>
              )}
              {run.status === "waiting_approval" && (
                <p className="text-sm text-warning">
                  {t("runDock.waiting")}{" "}
                  <Link href={`/w/${workspaceSlug}/runs?run=${run.id}`} className="underline">
                    {t("runDock.review")} <span aria-hidden className="flip-rtl">→</span>
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
  const t = useT();
  const now = useNow(1000);
  const d = runningDetail(step, events, now, t);
  return (
    <StatusBadge tone={d.degraded ? "warning" : "info"} className="text-xs">
      <span data-testid={`running-${step.nodeId}`}>{d.text}</span>
    </StatusBadge>
  );
}
