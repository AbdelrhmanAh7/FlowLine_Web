"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { createContext, memo, useContext } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { NODE_TYPES, type NodeType } from "@/engine/types";
import { useT } from "@/i18n/client";
import { nodeText, runLabel, statusWord, stepErrorText } from "@/i18n/engine-text";
import { actionTitleById } from "@/i18n/integration-text";
import type { Translator } from "@/i18n/translate";
import { useNow } from "@/lib/hooks";
import { runningDetail } from "@/lib/run-status";
import type { RunDetailDto, RunStepDto } from "@/lib/types";
import { cx } from "../ui";
import type { RFNode } from "./graph-utils";

export interface CanvasStatus {
  steps: Map<string, RunStepDto>;
  /** The shown run's events (retries), for the "provider slow / retrying" degraded state. */
  events?: RunDetailDto["events"];
  issues: Map<string, string[]>;
  readOnly: boolean;
}
export const CanvasStatusContext = createContext<CanvasStatus>({ steps: new Map(), issues: new Map(), readOnly: false });

function RunningLine({ step }: { step: RunStepDto }) {
  const { events } = useContext(CanvasStatusContext);
  const t = useT();
  const now = useNow(1000);
  const d = runningDetail(step, events, now, t);
  return <p className={cx("truncate text-sm", d.degraded ? "text-warning" : "text-info")}>{d.text}</p>;
}

function StatusLine({ step }: { step?: RunStepDto }) {
  const t = useT();
  if (!step) return <p className="text-sm text-muted">{t("canvasNode.notRun")}</p>;
  switch (step.status) {
    case "succeeded":
      return (
        <p className="flex items-center gap-1 text-sm text-success">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="24" style={{ animation: "check-draw 300ms var(--ease-out-expo)" }} />
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

export const FlowNodeCard = memo(function FlowNodeCard({ id, type, data, selected }: NodeProps<RFNode>) {
  const { steps, issues, readOnly } = useContext(CanvasStatusContext);
  const t = useT();
  const def = NODE_DEFINITIONS[type as NodeType];
  const step = steps.get(id);
  const nodeIssues = issues.get(id);
  const failed = step?.status === "failed";
  const skipped = step?.status === "skipped";

  return (
    <div
      data-testid={`node-${id}`}
      aria-label={`${data.label} — ${nodeText(t, type, "title")}${step ? `, ${statusWord(t, step.status)}` : ""}${nodeIssues ? `, ${t("canvasNode.issuesAria", { count: t.number(nodeIssues.length) })}` : ""}`}
      className={cx(
        "relative w-[200px] rounded-lg border bg-card px-3.5 py-3 transition-[border-color,box-shadow] duration-[var(--dur-hover)]",
        selected ? "border-accent shadow-[var(--shadow-glow)]" : failed ? "border-danger/60" : "border-line",
        skipped && "border-dashed opacity-60",
        failed && "animate-shake",
      )}
    >
      {def.inputs !== 0 && <Handle type="target" position={Position.Left} isConnectable={!readOnly} aria-label={t("canvasNode.inputAria", { label: data.label })} />}
      <p className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden className={cx("size-2 shrink-0 rounded-full", step ? DOT[step.status] : "bg-muted")} />
        <span className="truncate">{data.label}</span>
      </p>
      <p className="data mt-0.5 truncate text-[10px] tracking-[0.4px] text-muted uppercase">
        {type === "integration.action" && (data.config as { actionId?: string }).actionId ? actionSubtitle(t, (data.config as { actionId: string }).actionId) : nodeText(t, type, "subtitle")}
      </p>
      <div className="mt-1.5">
        <StatusLine step={step} />
      </div>
      {nodeIssues && (
        <span
          title={nodeIssues.join("\n")}
          className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-warning/60 bg-app text-[11px] text-warning"
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
            <span className={cx("data pointer-events-none absolute -right-9 text-[10px]", h === "true" ? "text-success" : "text-med")} style={{ top: `calc(${i === 0 ? 34 : 70}% - 8px)` }}>
              {h}
            </span>
          </div>
        ))}
    </div>
  );
});

// Every node type renders with the same card.
export const nodeTypes = Object.fromEntries(NODE_TYPES.map((t) => [t, FlowNodeCard])) as Record<NodeType, typeof FlowNodeCard>;
