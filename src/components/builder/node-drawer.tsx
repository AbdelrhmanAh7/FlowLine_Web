"use client";

import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { evaluateExpression } from "@/engine/expression";
import type { NodeType } from "@/engine/types";
import { useT } from "@/i18n/client";
import { nodeText, runLabel, skipReasonText, statusWord, stepErrorText } from "@/i18n/engine-text";
import { pretty } from "@/lib/format";
import { modKey } from "@/lib/hooks";
import type { RunStepDto } from "@/lib/types";
import { Button, CAT_BG, CAT_TEXT, CATEGORY_HUE, Field, Input, NODE_ICONS, RUN_TONE, StatusBadge, TabPanel, Tabs, cx } from "../ui";
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
  const t = useT();
  const [tab, setTab] = useState<Tab>("configure");
  const def = NODE_DEFINITIONS[node.type as NodeType];
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const hue = CATEGORY_HUE[def.category];
  const Icon = NODE_ICONS[node.type as NodeType];

  return (
    <aside
      role="complementary"
      aria-labelledby={headingId}
      data-testid="node-drawer"
      className={cx(
        "z-30 flex flex-col border-line bg-surface",
        variant === "sheet" ? "motion-sheet fixed inset-x-0 bottom-0 h-[92vh] rounded-t-xl border-t" : "motion-drawer absolute top-0 end-0 bottom-0 w-[var(--drawer-w)] max-w-full border-s shadow-[var(--shadow-popover)]",
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
            <span aria-hidden className={cx("flex size-6 shrink-0 items-center justify-center rounded-md", CAT_BG[hue])}>
              <Icon className={cx("size-3.5", CAT_TEXT[hue])} />
            </span>
            <span className="truncate">{node.data.label}</span>
            {step && (
              <StatusBadge tone={RUN_TONE[step.status] ?? "muted"} className="ms-1 text-sm font-normal">
                {runLabel(t, step.status)}
              </StatusBadge>
            )}
          </h2>
          <p className="data mt-1 truncate text-sm text-muted">
            {nodeText(t, node.type, "subtitle").toLowerCase()} · {node.id}
            {step?.durationMs != null && ` · ${t.duration(step.durationMs)}`}
            {runNumber != null && t("drawer.runRef", { number: runNumber })}
          </p>
        </div>
        <button ref={closeRef} onClick={onClose} aria-label={t("drawer.close")} className="-me-1 flex size-8 shrink-0 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <Tabs tabs={TABS.map((id) => ({ id, label: t(`drawer.tabs.${id}`) }))} value={tab} onChange={setTab} label={t("drawer.tablist")}>
        <TabPanel value="configure" className="px-5 py-4">
          <ConfigureTab node={node} readOnly={readOnly} readOnlyReason={readOnlyReason} issues={issues} onChange={onChange} />
        </TabPanel>
        <TabPanel value="test" className="px-5 py-4">
          <TestTab node={node} step={step} />
        </TabPanel>
        <TabPanel value="logs" className="px-5 py-4">
          <LogsTab step={step} nodeLabel={node.data.label} />
        </TabPanel>
      </Tabs>

      {tab === "configure" && (
        <div className="grid grid-cols-2 gap-3 border-t border-line px-5 py-4">
          <Button onClick={onDuplicate} disabledReason={readOnly ? readOnlyReason : node.type.startsWith("trigger.") ? t("builder.oneTrigger") : null} tooltipSide="top">
            {t("drawer.duplicate")} <span className="data text-xs text-muted">{modKey()}D</span>
          </Button>
          <Button variant="danger" onClick={onDelete} disabledReason={readOnly ? readOnlyReason : null} tooltipSide="top">
            {t("drawer.delete")} <span className="data text-xs text-danger/70">Del</span>
          </Button>
        </div>
      )}
    </aside>
  );
}

function ConfigureTab({ node, readOnly, readOnlyReason, issues, onChange }: { node: RFNode; readOnly: boolean; readOnlyReason?: string; issues: string[]; onChange: Props["onChange"] }) {
  const t = useT();
  const cfg = node.data.config as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) => onChange({ config: { ...cfg, ...patch } });
  const id = node.id;
  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-5">
      {readOnly && readOnlyReason && <p className="rounded-md border border-line bg-card px-3 py-2 text-sm text-med">{readOnlyReason}</p>}
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning" aria-label={t("drawer.issues")}>
          {issues.map((i) => (
            <li key={i}>⚠ {i}</li>
          ))}
        </ul>
      )}
      <Field label={t("drawer.name")} htmlFor={`label-${id}`}>
        <Input id={`label-${id}`} value={node.data.label} maxLength={80} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <NodeConfigForm node={node} cfg={cfg} set={set} readOnly={readOnly} />
      <p className="text-sm text-muted">{nodeText(t, node.type, "description")}</p>
    </fieldset>
  );
}

function Payload({ title, value, tone }: { title: string; value: unknown; tone?: "danger" }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{title}</p>
      <pre dir="ltr" className={cx("data max-h-64 overflow-auto rounded-md border bg-app p-3 text-sm whitespace-pre-wrap break-all", tone === "danger" ? "border-danger-border text-danger" : "border-line text-hi")}>{pretty(value)}</pre>
    </div>
  );
}

function TestTab({ node, step }: { node: RFNode; step?: RunStepDto }) {
  const t = useT();
  const [preview, setPreview] = useState<{ ok: boolean; value: unknown } | null>(null);
  const cfg = node.data.config as Record<string, string>;
  const hasExpr = !node.type.startsWith("trigger.") && typeof cfg.expression === "string" && cfg.expression.trim() !== "";
  if (!step || step.status === "pending") {
    return <p className="text-base text-med">{t("drawer.notRun")}</p>;
  }
  if (step.status === "skipped") {
    return <p className="text-base text-med">{t("drawer.skipped", { reason: step.skipReason ? skipReasonText(t, step.skipReason) : t("drawer.skippedDefault") })}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Payload title={t("drawer.input")} value={step.input} />
      {step.status === "failed" ? <Payload title={t("drawer.error")} value={step.error} tone="danger" /> : <Payload title={t("drawer.output")} value={step.output} />}
      {hasExpr && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-3">
          <p className="text-sm text-med">{t("drawer.tryHint")}</p>
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
            {t("drawer.preview")}
          </Button>
          {preview && <Payload title={t("drawer.previewResult")} value={preview.value} tone={preview.ok ? undefined : "danger"} />}
        </div>
      )}
    </div>
  );
}

function LogsTab({ step, nodeLabel }: { step?: RunStepDto; nodeLabel: string }) {
  const t = useT();
  if (!step) return <p className="text-base text-med">{t("drawer.noLogs")}</p>;
  const rows: ["status" | "started" | "finished" | "duration" | "skipReason" | "error", string][] = [
    ["status", statusWord(t, step.status)],
    ["started", step.startedAt ?? "—"],
    ["finished", step.finishedAt ?? "—"],
    ["duration", t.duration(step.durationMs)],
  ];
  if (step.skipReason) rows.push(["skipReason", skipReasonText(t, step.skipReason)]);
  if (step.error) rows.push(["error", `${step.error.code}: ${stepErrorText(t, step.error, { nodeLabel })}`]);
  return (
    <dl className="data grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{t(`drawer.log.${k}`)}</dt>
          <dd className={cx("break-all", k === "error" ? "text-danger" : "text-hi")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
