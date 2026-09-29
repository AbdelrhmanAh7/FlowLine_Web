"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { NODE_TYPES, type NodeType } from "@/engine/types";
import { useT } from "@/i18n/client";
import { nodeText, runLabel, statusWord, stepErrorText } from "@/i18n/engine-text";
import { actionTitleById } from "@/i18n/integration-text";
import type { Translator } from "@/i18n/translate";
import { useNow } from "@/lib/hooks";
import { runningDetail } from "@/lib/run-status";
import type { RunDetailDto, RunStepDto } from "@/lib/types";
import { CAT_BG, CAT_TEXT, CATEGORY_HUE, NODE_ICONS, cn, type CategoryHue } from "../ui";
import type { RFNode } from "./graph-utils";

export interface CanvasStatus {
  steps: Map<string, RunStepDto>;
  /** The shown run's events (retries), for the "provider slow / retrying" degraded state. */
  events?: RunDetailDto["events"];
  issues: Map<string, string[]>;
  readOnly: boolean;
  /** Nodes that just appeared (add/duplicate) or are about to disappear (delete) — enter/exit motion. */
  entering?: Set<string>;
  exiting?: Set<string>;
}
export const CanvasStatusContext = createContext<CanvasStatus>({ steps: new Map(), issues: new Map(), readOnly: false });

function RunningLine({ step }: { step: RunStepDto }) {
  const { events } = useContext(CanvasStatusContext);
  const t = useT();
  const now = useNow(1000);
  const d = runningDetail(step, events, now, t);
  return <p className={cn("truncate text-sm", d.degraded ? "text-warning" : "text-info")}>{d.text}</p>;
}

function StatusLine({ step }: { step?: RunStepDto }) {
  const t = useT();
  if (!step) return <p className="text-sm text-muted">{t("canvasNode.notRun")}</p>;
  switch (step.status) {
    case "succeeded":
      return (
        <p className="flex items-center gap-1 text-sm text-success">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="24" className="motion-check-draw" />
          </svg>
          <span className="data">{t.duration(step.durationMs)}</span>
        </p>
      );
    case "reused":
      return <p className="data text-sm text-success">{t("canvasNode.reused")}</p>;
    case "failed":
      return <p className="truncate text-sm text-danger">✗ {step.error ? stepErrorText(t, step.error) : t("canvasNode.failed")}</p>;
    case "running":
      return <RunningLine step={step} />;
    case "waiting_approval":
      return <p className="text-sm text-warning">{t("canvasNode.waiting")}</p>;
    case "uncertain":
      return <p className="text-sm text-warning">{t("canvasNode.uncertain")}</p>;
    case "cancelled":
      return <p className="text-sm text-muted">{runLabel(t, "cancelled")}</p>;
    case "skipped":
      return <p className="text-sm text-muted">{runLabel(t, "skipped")}</p>;
    default:
      return <p className="text-sm text-muted">{runLabel(t, "queued")}</p>;
  }
}

const DOT: Record<string, string> = {
  succeeded: "bg-success",
  reused: "bg-success",
  failed: "bg-danger",
  running: "bg-info",
  skipped: "bg-muted",
  pending: "bg-muted",
  waiting_approval: "bg-warning",
  uncertain: "bg-warning",
  cancelled: "bg-muted",
};

/**
 * "slack.post_message" → "SLACK · POST MESSAGE" (English keeps the id-derived technical form). Other languages
 * show the app id with the translated action title — "SLACK · نشر رسالة" — when the catalogue has one.
 */
function actionSubtitle(t: Translator, actionId: string) {
  const [p, a] = actionId.split(".");
  const app = (p ?? "").replace(/_/g, " ").toUpperCase();
  const title = t.locale === "en" ? null : actionTitleById(t, actionId);
  return title ? `${app} · ${title}` : `${app} · ${(a ?? "").replace(/_/g, " ").toUpperCase()}`;
}

/** One-shot success flash when a step lands in succeeded/reused (a real, server-confirmed outcome). */
function useSucceededFlash(status: string | undefined) {
  const prev = useRef(status);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if ((status === "succeeded" || status === "reused") && was !== "succeeded" && was !== "reused" && was !== undefined) setFlash(true);
  }, [status]);
  return { flash, clearFlash: () => setFlash(false) };
}

export const FlowNodeCard = memo(function FlowNodeCard({ id, type, data, selected }: NodeProps<RFNode>) {
  const { steps, issues, readOnly, entering, exiting } = useContext(CanvasStatusContext);
  const t = useT();
  const def = NODE_DEFINITIONS[type as NodeType];
  const step = steps.get(id);
  const nodeIssues = issues.get(id);
  const running = step?.status === "running";
  const failed = step?.status === "failed";
  const skipped = step?.status === "skipped";
  const hue: CategoryHue = CATEGORY_HUE[def.category];
  const Icon = NODE_ICONS[type as NodeType];
  const { flash, clearFlash } = useSucceededFlash(step?.status);

  return (
    <div
      data-testid={`node-${id}`}
      aria-label={`${data.label} — ${nodeText(t, type, "title")}${step ? `, ${statusWord(t, step.status)}` : ""}${nodeIssues ? `, ${t("canvasNode.issuesAria", { count: t.number(nodeIssues.length) })}` : ""}`}
      style={{ "--run-hue": `var(--cat-${hue})` } as React.CSSProperties}
      className={cn(
        "relative w-[200px] rounded-lg border bg-card px-3.5 py-3 transition-[border-color,box-shadow] duration-[var(--dur-base)]",
        selected ? "border-accent shadow-[var(--shadow-glow)]" : failed ? "border-danger-border" : "border-line",
        skipped && "border-dashed opacity-60",
        selected && "motion-select-pulse",
        entering?.has(id) && "motion-node-in",
        exiting?.has(id) && "motion-node-out",
        running && "motion-running",
        failed && "motion-shake",
        flash && "motion-success-flash",
      )}
      onAnimationEnd={(e) => {
        if (e.animationName === "m-success-flash") clearFlash();
      }}
    >
      {def.inputs !== 0 && <Handle type="target" position={Position.Left} isConnectable={!readOnly} aria-label={t("canvasNode.inputAria", { label: data.label })} />}
      <p className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", CAT_BG[hue])}>
          <Icon className={cn("size-3.5", CAT_TEXT[hue])} />
        </span>
        <span className="truncate">{data.label}</span>
        <span aria-hidden className={cn("ms-auto size-2 shrink-0 rounded-full", step ? DOT[step.status] : "bg-muted")} />
      </p>
      <p className="data mt-0.5 truncate ps-8 text-[10px] tracking-[0.4px] text-muted uppercase">
        {type === "integration.action" && (data.config as { actionId?: string }).actionId ? actionSubtitle(t, (data.config as { actionId: string }).actionId) : nodeText(t, type, "subtitle")}
      </p>
      <div className="mt-1.5 ps-8">
        <StatusLine step={step} />
      </div>
      {nodeIssues && (
        <span
          title={nodeIssues.join("\n")}
          className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-warning-border bg-app text-[11px] text-warning"
          aria-hidden
        >
          !
        </span>
      )}
      {def.outputs.length === 1 && <Handle type="source" position={Position.Right} id={def.outputs[0]} isConnectable={!readOnly} aria-label={t("canvasNode.outputAria", { label: data.label })} />}
      {def.outputs.length === 2 &&
        def.outputs.map((h, i) => (
          <div key={h}>
            <Handle type="source" position={Position.Right} id={h} style={{ top: `${i === 0 ? 34 : 70}%` }} isConnectable={!readOnly} aria-label={t("canvasNode.branchAria", { label: data.label, branch: h })} />
            <span className={cn("data pointer-events-none absolute -right-9 text-[10px]", h === "true" ? "text-success" : "text-med")} style={{ top: `calc(${i === 0 ? 34 : 70}% - 8px)` }}>
              {h}
            </span>
          </div>
        ))}
    </div>
  );
});

// Every node type renders with the same card.
export const nodeTypes = Object.fromEntries(NODE_TYPES.map((t) => [t, FlowNodeCard])) as Record<NodeType, typeof FlowNodeCard>;
