"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { createContext, memo, useContext } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { NodeType } from "@/engine/types";
import { duration } from "@/lib/format";
import type { RunStepDto } from "@/lib/types";
import { cx } from "../ui";
import type { RFNode } from "./graph-utils";

export interface CanvasStatus {
  steps: Map<string, RunStepDto>;
  issues: Map<string, string[]>;
  readOnly: boolean;
}
export const CanvasStatusContext = createContext<CanvasStatus>({ steps: new Map(), issues: new Map(), readOnly: false });

function StatusLine({ step }: { step?: RunStepDto }) {
  if (!step) return <p className="text-sm text-muted">Not run yet</p>;
  switch (step.status) {
    case "succeeded":
      return (
        <p className="flex items-center gap-1 text-sm text-success">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="24" style={{ animation: "check-draw 300ms var(--ease-out-expo)" }} />
          </svg>
          <span className="data">{duration(step.durationMs)}</span>
        </p>
      );
    case "reused":
      return <p className="data text-sm text-success">↺ reused</p>;
    case "failed":
      return <p className="truncate text-sm text-danger">✗ {step.error?.message ?? "Failed"}</p>;
    case "running":
      return <p className="text-sm text-info">Running…</p>;
    case "skipped":
      return <p className="text-sm text-muted">Skipped</p>;
    default:
      return <p className="text-sm text-muted">Queued</p>;
  }
}

const DOT: Record<string, string> = {
  succeeded: "bg-success",
  reused: "bg-success",
  failed: "bg-danger",
  running: "bg-info",
  skipped: "bg-muted",
  pending: "bg-muted",
};

export const FlowNodeCard = memo(function FlowNodeCard({ id, type, data, selected }: NodeProps<RFNode>) {
  const { steps, issues, readOnly } = useContext(CanvasStatusContext);
  const def = NODE_DEFINITIONS[type as NodeType];
  const step = steps.get(id);
  const nodeIssues = issues.get(id);
  const failed = step?.status === "failed";
  const skipped = step?.status === "skipped";

  return (
    <div
      data-testid={`node-${id}`}
      aria-label={`${data.label} — ${def.title}${step ? `, ${step.status}` : ""}${nodeIssues ? `, ${nodeIssues.length} issue(s)` : ""}`}
      className={cx(
        "relative w-[200px] rounded-lg border bg-card px-3.5 py-3 transition-[border-color,box-shadow] duration-[var(--dur-hover)]",
        selected ? "border-accent shadow-[var(--shadow-glow)]" : failed ? "border-danger/60" : "border-line",
        skipped && "border-dashed opacity-60",
        failed && "animate-shake",
      )}
    >
      {def.inputs !== 0 && <Handle type="target" position={Position.Left} isConnectable={!readOnly} aria-label={`${data.label} input`} />}
      <p className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden className={cx("size-2 shrink-0 rounded-full", step ? DOT[step.status] : "bg-muted")} />
        <span className="truncate">{data.label}</span>
      </p>
      <p className="data mt-0.5 truncate text-[10px] tracking-[0.4px] text-muted uppercase">{def.subtitle}</p>
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
      {def.outputs.length === 1 && <Handle type="source" position={Position.Right} id={def.outputs[0]} isConnectable={!readOnly} aria-label={`${data.label} output`} />}
      {def.outputs.length === 2 &&
        def.outputs.map((h, i) => (
          <div key={h}>
            <Handle type="source" position={Position.Right} id={h} style={{ top: `${i === 0 ? 34 : 70}%` }} isConnectable={!readOnly} aria-label={`${data.label} ${h} branch`} />
            <span className={cx("data pointer-events-none absolute -right-9 text-[10px]", h === "true" ? "text-success" : "text-med")} style={{ top: `calc(${i === 0 ? 34 : 70}% - 8px)` }}>
              {h}
            </span>
          </div>
        ))}
    </div>
  );
});

export const nodeTypes = {
  "trigger.manual": FlowNodeCard,
  "transform.json": FlowNodeCard,
  "logic.condition": FlowNodeCard,
  output: FlowNodeCard,
};
