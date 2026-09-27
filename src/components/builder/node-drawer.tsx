"use client";

import { useId, useRef, useState } from "react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { evaluateExpression } from "@/engine/expression";
import type { NodeType } from "@/engine/types";
import { duration, pretty } from "@/lib/format";
import { modKey } from "@/lib/hooks";
import type { RunStepDto } from "@/lib/types";
import { Button, Field, Input, RUN_LABEL, RUN_TONE, StatusBadge, cx, onTabListKeyDown } from "../ui";
import type { RFNode } from "./graph-utils";
import { NodeConfigForm } from "./node-config";

type Tab = "configure" | "test" | "logs";
const TABS: readonly Tab[] = ["configure", "test", "logs"];

interface Props {
  node: RFNode;
  step?: RunStepDto;
  runNumber?: number;
  readOnly: boolean;
  readOnlyReason?: string;
  issues: string[];
  variant: "side" | "overlay" | "sheet";
  onChange: (patch: { label?: string; config?: Record<string, unknown> }) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeDrawer({ node, step, runNumber, readOnly, readOnlyReason, issues, variant, onChange, onDuplicate, onDelete, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("configure");
  const def = NODE_DEFINITIONS[node.type as NodeType];
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  return (
    <aside
      role="complementary"
      aria-labelledby={headingId}
      data-testid="node-drawer"
      className={cx(
        "z-30 flex flex-col border-line bg-surface",
        variant === "sheet" ? "fixed inset-x-0 bottom-0 h-[92vh] animate-sheet-in rounded-t-xl border-t" : "absolute top-0 right-0 bottom-0 w-[var(--drawer-w)] max-w-full animate-drawer-in border-l shadow-[var(--shadow-popover)]",
      )}
    >
      <div
        className="flex touch-pan-y items-start justify-between gap-3 border-b border-line px-5 pt-4 pb-3"
        // Swipe to dismiss (slide 14): drag the header right (overlay) or down (bottom sheet) past 80px.
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if ((variant === "sheet" ? dy : dx) > 80) onClose();
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="min-w-0">
          <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="text-accent">{def.icon}</span>
            <span className="truncate">{node.data.label}</span>
            {step && (
              <StatusBadge tone={RUN_TONE[step.status] ?? "muted"} className="ml-1 text-sm font-normal">
                {RUN_LABEL[step.status]}
              </StatusBadge>
            )}
          </h2>
          <p className="data mt-1 truncate text-sm text-muted">
            {def.subtitle.toLowerCase()} · {node.id}
            {step?.durationMs != null && ` · ${duration(step.durationMs)}`}
            {runNumber != null && ` · run #${runNumber}`}
          </p>
        </div>
        <button ref={closeRef} onClick={onClose} aria-label="Close drawer (Esc)" className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          ✕
        </button>
      </div>

      <div role="tablist" aria-label="Node panels" className="flex gap-5 border-b border-line px-5" onKeyDown={(e) => onTabListKeyDown(e, TABS, tab, setTab)}>
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            className={cx(
              "relative h-10 text-base capitalize transition-colors duration-[var(--dur-tab)]",
              tab === t ? "font-semibold text-hi after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-muted hover:text-med",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "configure" && <ConfigureTab node={node} readOnly={readOnly} readOnlyReason={readOnlyReason} issues={issues} onChange={onChange} />}
        {tab === "test" && <TestTab node={node} step={step} />}
        {tab === "logs" && <LogsTab step={step} />}
      </div>

      {tab === "configure" && (
        <div className="grid grid-cols-2 gap-3 border-t border-line px-5 py-4">
          <Button onClick={onDuplicate} disabledReason={readOnly ? readOnlyReason : node.type.startsWith("trigger.") ? "A flow can only have one trigger" : null} tooltipSide="top">
            Duplicate <span className="data text-xs text-muted">{modKey()}D</span>
          </Button>
          <Button variant="danger" onClick={onDelete} disabledReason={readOnly ? readOnlyReason : null} tooltipSide="top">
            Delete <span className="data text-xs text-danger/70">Del</span>
          </Button>
        </div>
      )}
    </aside>
  );
}

function ConfigureTab({ node, readOnly, readOnlyReason, issues, onChange }: { node: RFNode; readOnly: boolean; readOnlyReason?: string; issues: string[]; onChange: Props["onChange"] }) {
  const cfg = node.data.config as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => onChange({ config: { ...cfg, ...patch } });
  const id = node.id;
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-5">
      {readOnly && readOnlyReason && <p className="rounded-md border border-line bg-card px-3 py-2 text-sm text-med">{readOnlyReason}</p>}
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning" aria-label="Issues">
          {issues.map((i) => (
            <li key={i}>⚠ {i}</li>
          ))}
        </ul>
      )}
      <Field label="Name" htmlFor={`label-${id}`}>
        <Input id={`label-${id}`} value={node.data.label} maxLength={80} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <NodeConfigForm node={node} cfg={cfg} set={set} readOnly={readOnly} />
      <p className="text-sm text-muted">{NODE_DEFINITIONS[node.type as NodeType].description}</p>
    </fieldset>
  );
}

function Payload({ title, value, tone }: { title: string; value: unknown; tone?: "danger" }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{title}</p>
      <pre className={cx("data max-h-64 overflow-auto rounded-md border bg-app p-3 text-sm whitespace-pre-wrap break-all", tone === "danger" ? "border-danger/40 text-danger" : "border-line text-hi")}>{pretty(value)}</pre>
    </div>
  );
}

function TestTab({ node, step }: { node: RFNode; step?: RunStepDto }) {
  const [preview, setPreview] = useState<{ ok: boolean; value: unknown } | null>(null);
  const cfg = node.data.config as Record<string, string>;
  const hasExpr = !node.type.startsWith("trigger.") && typeof cfg.expression === "string" && cfg.expression.trim() !== "";
  if (!step || step.status === "pending") {
    return <p className="text-base text-med">Run the flow to see this step&apos;s input and output here.</p>;
  }
  if (step.status === "skipped") {
    return <p className="text-base text-med">This step was skipped in the latest run — {step.skipReason ?? "an upstream step didn't pass data to it"}.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Payload title="Input (latest run)" value={step.input} />
      {step.status === "failed" ? <Payload title="Error" value={step.error} tone="danger" /> : <Payload title="Output (latest run)" value={step.output} />}
      {hasExpr && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-3">
          <p className="text-sm text-med">Try the current expression against the latest input. This preview runs in your browser and isn&apos;t recorded as a run.</p>
          <Button
            size="sm"
            className="self-start"
            onClick={async () => {
              try {
                const v = await evaluateExpression(cfg.expression!, step.input);
                setPreview({ ok: true, value: node.type === "logic.condition" ? { result: v, branch: v ? "true" : "false" } : v });
              } catch (e) {
                setPreview({ ok: false, value: { message: (e as Error).message } });
              }
            }}
          >
            Preview expression
          </Button>
          {preview && <Payload title="Preview result" value={preview.value} tone={preview.ok ? undefined : "danger"} />}
        </div>
      )}
    </div>
  );
}

function LogsTab({ step }: { step?: RunStepDto }) {
  if (!step) return <p className="text-base text-med">No logs yet — this node hasn&apos;t run.</p>;
  const rows: [string, string][] = [
    ["status", step.status],
    ["started", step.startedAt ?? "—"],
    ["finished", step.finishedAt ?? "—"],
    ["duration", duration(step.durationMs)],
  ];
  if (step.skipReason) rows.push(["skip reason", step.skipReason]);
  if (step.error) rows.push(["error", `${step.error.code}: ${step.error.message}`]);
  return (
    <dl className="data grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className={cx("break-all", k === "error" ? "text-danger" : "text-hi")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
