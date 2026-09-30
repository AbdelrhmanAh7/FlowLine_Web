"use client";

import { TIME_ZONES } from "@/lib/timezones";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { checkExpressionSyntax } from "@/engine/expression";
import { dueFires } from "@/engine/schedule-math";
import { checkCron } from "@/engine/validate";
import { useT } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import { detailText } from "@/i18n/engine-text";
import { actionDescription, actionTitle } from "@/i18n/integration-text";
import type { MessageKey } from "@/i18n/types";
import { api, ApiError } from "@/lib/api";
import { SIDE_EFFECT_LABEL, useCatalog, useConnections, type CatalogAction } from "@/lib/catalog";
import { useAiOverview, usePickerModels, type AiRouteRef } from "@/lib/ai";
import { ModelPicker } from "../ai/model-picker";
import { useWorkspace } from "../shell/workspace-context";
import { Button, Field, Input, Select as UiSelect, Textarea, cx } from "../ui";
import type { RFNode } from "./graph-utils";

type Cfg = Record<string, unknown>;
interface FormProps {
  node: RFNode;
  cfg: Cfg;
  set: (patch: Cfg) => void;
  readOnly: boolean;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");

export function ExpressionField({ id, label, value, onChange, hint, allowEmpty, rows = 4 }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode; allowEmpty?: boolean; rows?: number }) {
  const t = useT();
  const err = value.trim() ? checkExpressionSyntax(value) : allowEmpty ? null : t("config.expressionEmpty");
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err}>
      <Textarea id={id} mono rows={rows} value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(err)} />
    </Field>
  );
}

export function JsonField({ id, label, value, onChange, hint, rows = 8 }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  const t = useT();
  let err: string | null = null;
  if (value.trim()) {
    try {
      JSON.parse(value);
    } catch (e) {
      err = t("config.invalidJson", { message: (e as Error).message });
    }
  }
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err}>
      <Textarea id={id} mono rows={rows} value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(err)} />
    </Field>
  );
}

function Select({ id, label, value, onChange, options, hint, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; hint?: React.ReactNode; disabled?: boolean }) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <UiSelect id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </UiSelect>
    </Field>
  );
}

function Notice({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  return <p className={cx("rounded-md border px-3 py-2 text-sm", tone === "warning" ? "border-warning-border bg-warning-bg text-warning" : "border-line bg-card text-med")}>{children}</p>;
}

/** Type-specific configuration for the node drawer. */
export function NodeConfigForm(props: FormProps) {
  const t = useT();
  const { node, cfg, set } = props;
  const id = node.id;
  switch (node.type) {
    case "trigger.manual":
      return <JsonField id={`payload-${id}`} label={t("config.manual.payload")} value={s(cfg.samplePayload)} onChange={(v) => set({ samplePayload: v })} hint={t("config.manual.payloadHint")} />;
    case "trigger.webhook":
      return (
        <>
          <Notice tone="info">{t("config.webhook.notice")}</Notice>
          <Select
            id={`sig-${id}`}
            label={t("config.webhook.signature")}
            value={s(cfg.signatureScheme) || "flowline"}
            onChange={(v) => set({ signatureScheme: v })}
            options={[
              { value: "flowline", label: t("config.webhook.sigFlowline") },
              { value: "github", label: t("config.webhook.sigGithub") },
            ]}
          />
          <JsonField id={`payload-${id}`} label={t("config.webhook.payload")} value={s(cfg.samplePayload)} onChange={(v) => set({ samplePayload: v })} />
        </>
      );
    case "trigger.schedule":
      return <ScheduleForm {...props} />;
    case "transform.json":
      return <ExpressionField id={`expr-${id}`} label={t("config.transform.label")} value={s(cfg.expression)} onChange={(v) => set({ expression: v })} rows={6} hint={t.rich("config.transform.hint", { ref: <code className="data">$steps.&lt;id&gt;</code> })} />;
    case "logic.condition":
      return <ExpressionField id={`expr-${id}`} label={t("config.condition.label")} value={s(cfg.expression)} onChange={(v) => set({ expression: v })} hint={t.rich("config.condition.hint", { trueBranch: <span className="text-success">true</span> })} />;
    case "output":
      return (
        <>
          <Field label={t("config.output.key")} htmlFor={`key-${id}`} hint={t("config.output.keyHint")}>
            <Input id={`key-${id}`} className="data" value={s(cfg.key)} onChange={(e) => set({ key: e.target.value })} maxLength={64} />
          </Field>
          <ExpressionField id={`expr-${id}`} label={t("config.output.value")} value={s(cfg.expression)} onChange={(v) => set({ expression: v })} hint={t("config.output.valueHint")} allowEmpty />
        </>
      );
    case "data.filter":
      return (
        <>
          <ExpressionField id={`src-${id}`} label={t("config.filter.source")} value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} allowEmpty hint={t("config.filter.sourceHint")} />
          <ExpressionField id={`pred-${id}`} label={t("config.filter.predicate")} value={s(cfg.predicate)} onChange={(v) => set({ predicate: v })} rows={3} hint={t("config.filter.predicateHint")} />
        </>
      );
    case "data.map":
      return <MapForm {...props} />;
    case "data.merge":
      return (
        <Select
          id={`mode-${id}`}
          label={t("config.merge.label")}
          value={s(cfg.mode)}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: "object", label: t("config.merge.object") },
            { value: "array", label: t("config.merge.array") },
            { value: "first", label: t("config.merge.first") },
          ]}
          hint={t("config.merge.hint")}
        />
      );
    case "data.csv":
      return (
        <>
          <Select id={`mode-${id}`} label={t("config.csv.mode")} value={s(cfg.mode)} onChange={(v) => set({ mode: v })} options={[{ value: "parse", label: t("config.csv.parse") }, { value: "build", label: t("config.csv.build") }]} />
          <ExpressionField id={`src-${id}`} label={cfg.mode === "build" ? t("config.csv.rows") : t("config.csv.text")} value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} allowEmpty />
          <Field label={t("config.csv.delimiter")} htmlFor={`d-${id}`}>
            <Input id={`d-${id}`} className="data w-16" maxLength={1} value={s(cfg.delimiter)} onChange={(e) => set({ delimiter: e.target.value })} />
          </Field>
        </>
      );
    case "data.file":
      return <FileForm {...props} />;
    case "data.store":
      return (
        <>
          <Select id={`op-${id}`} label={t("config.store.op")} value={s(cfg.op)} onChange={(v) => set({ op: v })} options={[{ value: "get", label: t("config.store.get") }, { value: "set", label: t("config.store.set") }]} />
          <Field label={t("config.store.namespace")} htmlFor={`ns-${id}`}>
            <Input id={`ns-${id}`} className="data" value={s(cfg.namespace)} onChange={(e) => set({ namespace: e.target.value })} maxLength={40} />
          </Field>
          <ExpressionField id={`k-${id}`} label={t("config.store.key")} value={s(cfg.key)} onChange={(v) => set({ key: v })} rows={1} />
          {cfg.op === "set" && <ExpressionField id={`v-${id}`} label={t("config.store.value")} value={s(cfg.value)} onChange={(v) => set({ value: v })} rows={2} />}
        </>
      );
    case "logic.loop":
    case "flow.subflow":
      return <SubflowForm {...props} />;
    case "http.request":
      return <HttpForm {...props} />;
    case "ai.generate":
    case "ai.extract":
    case "ai.classify":
      return <AiForm {...props} />;
    case "code.js":
      return <CodeForm {...props} />;
    case "integration.action":
      return <ActionForm {...props} />;
    default:
      return null;
  }
}

function ScheduleForm({ node, cfg, set }: FormProps) {
  const t = useT();
  const cron = s(cfg.cron);
  const tz = s(cfg.timezone) || "UTC";
  const cronError = checkCron(cron, tz);
  const err = cronError && detailText(t, cronError);
  // "Now" is captured once per mount so the preview is stable across re-renders.
  const [mountedAt] = useState(() => Date.now());
  const preview = useMemo(() => {
    if (err) return [];
    try {
      // English keeps its day-month-year preview; Arabic uses the app's Arabic locale with Western digits.
      const fmt = new Intl.DateTimeFormat(t.locale === "en" ? "en-GB" : intlLocale(t.locale), { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
      return dueFires(cron, tz, new Date(mountedAt), new Date(mountedAt + 60 * 86400_000), 3).map((d) => fmt.format(d));
    } catch {
      return [];
    }
  }, [cron, tz, err, mountedAt, t.locale]);
  const zones = TIME_ZONES.includes(tz) ? TIME_ZONES : [tz, ...TIME_ZONES];
  const presets: [MessageKey, string][] = [
    ["config.schedule.every15", "*/15 * * * *"],
    ["config.schedule.hourly", "0 * * * *"],
    ["config.schedule.daily", "0 9 * * *"],
    ["config.schedule.mondays", "0 9 * * 1"],
  ];
  return (
    <>
      <Field label={t("config.schedule.cron")} htmlFor={`cron-${node.id}`} error={err}>
        <Input id={`cron-${node.id}`} className="data" value={cron} onChange={(e) => set({ cron: e.target.value })} invalid={Boolean(err)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, c]) => (
          <button key={c} type="button" onClick={() => set({ cron: c })} className="rounded-md border border-line px-2 py-1 text-sm text-med hover:bg-card hover:text-hi">
            {t(label)}
          </button>
        ))}
      </div>
      <Select id={`tz-${node.id}`} label={t("config.schedule.timezone")} value={tz} onChange={(v) => set({ timezone: v })} options={zones.map((z) => ({ value: z, label: z }))} hint={t("config.schedule.timezoneHint")} />
      <Select
        id={`missed-${node.id}`}
        label={t("config.schedule.missed")}
        value={s(cfg.missedPolicy) || "skip"}
        onChange={(v) => set({ missedPolicy: v })}
        options={[
          { value: "skip", label: t("config.schedule.skip") },
          { value: "run_once", label: t("config.schedule.runOnce") },
          { value: "run_all", label: t("config.schedule.runAll") },
        ]}
      />
      {preview.length > 0 && (
        <p className="text-sm text-med">
          {t("config.schedule.next")} <span className="data text-hi">{preview.join(" · ")}</span>
        </p>
      )}
      <Notice tone="info">{t("config.schedule.notice")}</Notice>
    </>
  );
}

function MapForm({ node, cfg, set, readOnly }: FormProps) {
  const t = useT();
  const fields = (Array.isArray(cfg.fields) ? cfg.fields : []) as { key: string; expression: string }[];
  const update = (i: number, patch: Partial<{ key: string; expression: string }>) => set({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-[0.4px] text-med uppercase">{t("config.map.fields")}</p>
      {fields.map((f, i) => {
        const err = f.expression.trim() ? checkExpressionSyntax(f.expression) : "empty";
        return (
          <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-2">
            <Input aria-label={t("config.map.fieldName", { n: i + 1 })} className="data h-8" value={f.key} onChange={(e) => update(i, { key: e.target.value })} placeholder={t("config.map.fieldPlaceholder")} />
            <Input aria-label={t("config.map.fieldValue", { n: i + 1 })} className="data h-8" value={f.expression} onChange={(e) => update(i, { expression: e.target.value })} placeholder={t("config.map.expressionPlaceholder")} invalid={Boolean(err)} />
            <Button size="sm" variant="ghost" aria-label={t("config.map.remove", { n: i + 1 })} onClick={() => set({ fields: fields.filter((_, j) => j !== i) })} disabledReason={readOnly ? t("config.readOnly") : null}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        );
      })}
      <Button size="sm" className="self-start" onClick={() => set({ fields: [...fields, { key: `field${fields.length + 1}`, expression: "$" }] })} disabledReason={readOnly ? t("config.readOnly") : fields.length >= 50 ? t("config.map.max") : null}>
        {t("config.map.add")}
      </Button>
      <p className="text-sm text-muted">{node && t("config.map.hint")}</p>
    </div>
  );
}

function FileForm({ node, cfg, set, readOnly }: FormProps) {
  const t = useT();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const files = useQuery({ queryKey: ["files", workspace.id], queryFn: () => api<{ files: { id: string; name: string; size: number }[] }>(`/api/workspaces/${workspace.id}/files`), select: (d) => d.files, enabled: cfg.from === "upload" });
  const upload = async (f: File) => {
    setUploadError(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await fetch(`/api/workspaces/${workspace.id}/files`, { method: "POST", body: fd });
      const b = await r.json();
      if (!r.ok) throw new ApiError(r.status, b.error?.code ?? "UPLOAD", b.error?.message ?? t("config.file.uploadFailed"));
      await qc.invalidateQueries({ queryKey: ["files", workspace.id] });
      set({ fileId: b.file.id });
    } catch (e) {
      setUploadError((e as Error).message);
    }
  };
  return (
    <>
      <Select
        id={`from-${node.id}`}
        label={t("config.file.from")}
        value={s(cfg.from)}
        onChange={(v) => set({ from: v })}
        options={[
          { value: "input", label: t("config.file.fromInput") },
          { value: "upload", label: t("config.file.fromUpload") },
          { value: "url", label: t("config.file.fromUrl") },
        ]}
      />
      {cfg.from === "upload" ? (
        <div className="flex flex-col gap-2">
          <Select
            id={`file-${node.id}`}
            label={t("config.file.uploaded")}
            value={s(cfg.fileId)}
            onChange={(v) => set({ fileId: v })}
            options={[{ value: "", label: files.isPending ? t("config.loading") : t("config.file.choose") }, ...(files.data ?? []).map((f) => ({ value: f.id, label: `${f.name} (${Math.ceil(f.size / 1024)}KB)` }))]}
          />
          <input ref={inputRef} type="file" accept=".pdf,.csv,.json,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button size="sm" className="self-start" onClick={() => inputRef.current?.click()} disabledReason={readOnly ? t("config.readOnly") : null}>
            {t("config.file.upload")}
          </Button>
          {uploadError && <p role="alert" className="text-sm text-danger">{uploadError}</p>}
        </div>
      ) : (
        <ExpressionField id={`src-${node.id}`} label={cfg.from === "url" ? t("config.file.url") : t("config.file.base64")} value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} />
      )}
      <Select
        id={`as-${node.id}`}
        label={t("config.file.readAs")}
        value={s(cfg.as)}
        onChange={(v) => set({ as: v })}
        options={[
          { value: "pdf_text", label: t("config.file.pdf") },
          { value: "csv", label: t("config.file.csv") },
          { value: "json", label: t("config.file.json") },
          { value: "text", label: t("config.file.text") },
        ]}
        hint={t("config.file.hint")}
      />
    </>
  );
}

function SubflowForm({ node, cfg, set }: FormProps) {
  const t = useT();
  const { workspace } = useWorkspace();
  const flows = useQuery({
    queryKey: ["publishable-flows", workspace.id],
    queryFn: () => api<{ flows: { id: string; name: string; publishedVersion: number | null }[] }>(`/api/workspaces/${workspace.id}/flows?published=1`),
    select: (d) => d.flows.filter((f) => f.publishedVersion != null),
  });
  const chosen = flows.data?.find((f) => f.id === s(cfg.flowId));
  return (
    <>
      <Select
        id={`flow-${node.id}`}
        label={node.type === "logic.loop" ? t("config.subflow.perItem") : t("config.subflow.subflow")}
        value={s(cfg.flowId)}
        onChange={(v) => {
          const f = flows.data?.find((x) => x.id === v);
          set({ flowId: v, version: f?.publishedVersion ?? 1 });
        }}
        options={[{ value: "", label: flows.isPending ? t("config.loading") : flows.data?.length ? t("config.subflow.choose") : t("config.subflow.none") }, ...(flows.data ?? []).map((f) => ({ value: f.id, label: `${f.name} (v${f.publishedVersion})` }))]}
        hint={t("config.subflow.hint")}
      />
      {chosen && (
        <Field label={t("config.subflow.pinned")} htmlFor={`ver-${node.id}`} hint={t("config.subflow.latest", { version: chosen.publishedVersion ?? "" })}>
          <Input id={`ver-${node.id}`} type="number" min={1} className="data w-24" value={String(cfg.version ?? 1)} onChange={(e) => set({ version: Number(e.target.value) })} />
        </Field>
      )}
      {node.type === "logic.loop" ? (
        <>
          <ExpressionField id={`items-${node.id}`} label={t("config.subflow.items")} value={s(cfg.items)} onChange={(v) => set({ items: v })} rows={2} />
          <Field label={t("config.subflow.maxItems")} htmlFor={`max-${node.id}`} hint={t("config.subflow.maxItemsHint")}>
            <Input id={`max-${node.id}`} type="number" min={1} max={500} className="data w-24" value={String(cfg.maxItems ?? 50)} onChange={(e) => set({ maxItems: Number(e.target.value) })} />
          </Field>
        </>
      ) : (
        <ExpressionField id={`in-${node.id}`} label={t("config.subflow.input")} value={s(cfg.input)} onChange={(v) => set({ input: v })} rows={2} allowEmpty />
      )}
    </>
  );
}

function HttpForm({ node, cfg, set }: FormProps) {
  const t = useT();
  const retry = (cfg.retry as { maxAttempts?: number } | undefined)?.maxAttempts ?? 3;
  return (
    <>
      <Select id={`m-${node.id}`} label={t("config.http.method")} value={s(cfg.method)} onChange={(v) => set({ method: v, sideEffect: v === "GET" ? "none" : s(cfg.sideEffect) === "none" ? "non_idempotent" : s(cfg.sideEffect) })} options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))} />
      <ExpressionField id={`url-${node.id}`} label={t("config.http.url")} value={s(cfg.url)} onChange={(v) => set({ url: v })} rows={1} hint={t.rich("config.http.urlHint", { example: <code className="data" dir="ltr">&apos;https://api.example.com/items&apos;</code> })} />
      <ExpressionField id={`h-${node.id}`} label={t("config.http.headers")} value={s(cfg.headers)} onChange={(v) => set({ headers: v })} rows={2} allowEmpty hint={t("config.http.headersHint")} />
      {cfg.method !== "GET" && <ExpressionField id={`b-${node.id}`} label={t("config.http.body")} value={s(cfg.body)} onChange={(v) => set({ body: v })} rows={3} allowEmpty />}
      {cfg.method !== "GET" && (
        <Select
          id={`se-${node.id}`}
          label={t("config.http.sideEffect")}
          value={s(cfg.sideEffect) || "non_idempotent"}
          onChange={(v) => set({ sideEffect: v })}
          options={[
            { value: "non_idempotent", label: t("config.http.nonIdempotent") },
            { value: "idempotent", label: t("config.http.idempotent") },
          ]}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("config.http.timeout")} htmlFor={`t-${node.id}`}>
          <Input id={`t-${node.id}`} type="number" className="data" min={1000} max={60000} value={String(cfg.timeoutMs ?? 15000)} onChange={(e) => set({ timeoutMs: Number(e.target.value) })} />
        </Field>
        <Field label={t("config.http.attempts")} htmlFor={`r-${node.id}`} hint={t("config.http.attemptsHint")}>
          <Input id={`r-${node.id}`} type="number" className="data" min={1} max={5} value={String(retry)} onChange={(e) => set({ retry: { maxAttempts: Number(e.target.value) } })} />
        </Field>
      </div>
    </>
  );
}

function isRoute(v: unknown): v is AiRouteRef {
  return Boolean(v && typeof v === "object" && typeof (v as AiRouteRef).connectionId === "string" && typeof (v as AiRouteRef).modelId === "string");
}

function AiForm({ node, cfg, set, readOnly }: FormProps) {
  const t = useT();
  const { workspace } = useWorkspace();
  const overview = useAiOverview(workspace.id);
  const canUse = overview.data?.canUse ?? false;
  const models = usePickerModels(workspace.id, canUse);
  const status = overview.data?.status;
  const route = isRoute(cfg.route) ? cfg.route : null;
  const legacyModel = !route && s(cfg.model) ? s(cfg.model) : null;
  const def = status?.defaultRoute;
  return (
    <>
      {status && !status.canUseAny && (
        <Notice tone="warning">
          {status.usableConnections === 0 && (overview.data?.connections.length ?? 0) > 0 ? t("aiHub.node.notAllowed") : t("aiHub.node.noConnections")}{" "}
          <Link className="underline" href={`/w/${workspace.slug}/settings?tab=ai`}>
            {t("aiHub.node.openSettings")}
          </Link>
        </Notice>
      )}
      {legacyModel && <Notice tone="warning">{t("aiHub.node.legacyModel", { model: legacyModel })}</Notice>}
      <Field label={t("config.ai.instructions")} htmlFor={`ins-${node.id}`} hint={t("config.ai.instructionsHint")}>
        <Textarea id={`ins-${node.id}`} rows={4} value={s(cfg.instructions)} onChange={(e) => set({ instructions: e.target.value })} maxLength={4000} />
      </Field>
      <ExpressionField id={`src-${node.id}`} label={t("config.ai.content")} value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} />
      {node.type === "ai.extract" && <JsonField id={`schema-${node.id}`} label={t("config.ai.schema")} value={s(cfg.schema)} onChange={(v) => set({ schema: v })} rows={9} hint={t("config.ai.schemaHint")} />}
      {node.type === "ai.classify" && (
        <Field label={t("config.ai.labels")} htmlFor={`labels-${node.id}`}>
          <Input id={`labels-${node.id}`} className="data" value={s(cfg.labels)} onChange={(e) => set({ labels: e.target.value })} />
        </Field>
      )}
      <Field label={t("config.ai.route")} htmlFor={`route-${node.id}`} hint={t("config.ai.routeHint")}>
        <ModelPicker
          id={`route-${node.id}`}
          models={models.data ?? []}
          loading={overview.isPending || (canUse && models.isPending)}
          value={route}
          disabled={readOnly || !canUse}
          allowDefault
          defaultLabel={def ? t("aiHub.node.useDefault", { model: def.modelId, connection: def.connectionLabel }) : t("aiHub.node.useDefaultNone")}
          onChange={(v) => set(v ? { route: v, model: "" } : { route: null })}
        />
      </Field>
      {node.type !== "ai.classify" && (
        <Field label={t("config.ai.maxTokens")} htmlFor={`mt-${node.id}`}>
          <Input id={`mt-${node.id}`} type="number" className="data" min={16} max={4000} value={String(cfg.maxTokens ?? 400)} onChange={(e) => set({ maxTokens: Number(e.target.value) })} />
        </Field>
      )}
    </>
  );
}

function CodeForm({ node, cfg, set }: FormProps) {
  const t = useT();
  const catalog = useCatalog();
  const sb = catalog.data?.runtime.codeSandbox;
  return (
    <>
      {sb && !sb.available && <Notice tone="warning">{t("config.code.unavailable", { reason: sb.reason ?? "" })}</Notice>}
      {sb?.available && <Notice tone="info">{t("config.code.isolated")}</Notice>}
      <Field label={t("config.code.js")} htmlFor={`code-${node.id}`} hint={t("config.code.jsHint")}>
        <Textarea id={`code-${node.id}`} mono rows={10} value={s(cfg.code)} onChange={(e) => set({ code: e.target.value })} />
      </Field>
      <Field label={t("config.http.timeout")} htmlFor={`ct-${node.id}`}>
        <Input id={`ct-${node.id}`} type="number" className="data w-28" min={500} max={30000} value={String(cfg.timeoutMs ?? 5000)} onChange={(e) => set({ timeoutMs: Number(e.target.value) })} />
      </Field>
    </>
  );
}

/** Builds a starting JSONata mapping from an action's input schema. */
export function mappingSkeleton(a: CatalogAction) {
  const props = a.inputSchema?.properties ?? {};
  const req = new Set(a.inputSchema?.required ?? []);
  const lines = Object.entries(props).map(([k, p]) => {
    const v = p.type === "number" || p.type === "integer" ? "0" : p.type === "boolean" ? "false" : p.type === "array" ? "[]" : p.type === "object" ? "{}" : `""`;
    return `  "${k}": ${v}${req.has(k) ? "" : "  /* optional */"}`;
  });
  return `{\n${lines.join(",\n")}\n}`;
}

function ActionForm({ node, cfg, set }: FormProps) {
  const t = useT();
  const { workspace, user } = useWorkspace();
  const catalog = useCatalog();
  const connections = useConnections(workspace.id);
  const actionId = s(cfg.actionId);
  const providerId = actionId.split(".")[0] ?? "";
  const [pickProvider, setPickProvider] = useState(providerId);
  const provider = catalog.data?.providers.find((p) => p.id === (pickProvider || providerId));
  const action = provider?.actions.find((a) => a.id === actionId);
  const conns = (connections.data ?? []).filter((c) => c.provider === provider?.id);
  const conn = conns.find((c) => c.id === s(cfg.connectionId));
  const retry = (cfg.retry as { maxAttempts?: number } | undefined)?.maxAttempts ?? 3;
  const required = action?.inputSchema?.required ?? [];
  return (
    <>
      <Select
        id={`app-${node.id}`}
        label={t("config.action.app")}
        value={provider?.id ?? ""}
        onChange={(v) => {
          setPickProvider(v);
          set({ actionId: "", connectionId: "" });
        }}
        options={[{ value: "", label: catalog.isPending ? t("config.loading") : t("config.action.chooseApp") }, ...(catalog.data?.providers ?? []).map((p) => ({ value: p.id, label: p.name }))]}
      />
      {provider && (
        <Select
          id={`action-${node.id}`}
          label={t("config.action.action")}
          value={actionId}
          onChange={(v) => {
            const a = provider.actions.find((x) => x.id === v);
            set({ actionId: v, requireApproval: a?.sensitive ? true : Boolean(cfg.requireApproval), inputMapping: a ? mappingSkeleton(a) : "{}" });
          }}
          options={[{ value: "", label: t("config.action.chooseAction") }, ...provider.actions.map((a) => ({ value: a.id, label: `${actionTitle(t, a)} · ${t.has(`sideEffect.${a.sideEffect}`) ? t(`sideEffect.${a.sideEffect}` as MessageKey) : (SIDE_EFFECT_LABEL[a.sideEffect] ?? a.sideEffect)}` }))]}
        />
      )}
      {action && <p className="text-sm text-muted">{actionDescription(t, action)}</p>}
      {provider && (
        <Select
          id={`conn-${node.id}`}
          label={t("config.action.connection")}
          value={s(cfg.connectionId)}
          onChange={(v) => set({ connectionId: v })}
          options={[{ value: "", label: conns.length ? t("config.action.chooseConnection") : t("config.action.noConnections", { provider: provider.name }) }, ...conns.map((c) => ({ value: c.id, label: `${c.label}${c.status !== "active" ? ` (${c.status})` : ""}${c.visibility === "private" ? (c.ownerId === user.id ? t("config.action.privateYours") : t("config.action.privateOther")) : ""}` }))]}
          hint={
            <Link href={`/w/${workspace.slug}/integrations`} className="text-accent-text hover:underline">
              {t("config.action.manage")} <span aria-hidden className="flip-rtl">→</span>
            </Link>
          }
        />
      )}
      {conn && conn.status !== "active" && <Notice tone="warning">{t("config.action.connStatus", { label: conn.label, status: conn.status })}</Notice>}
      {action && (
        <>
          <ExpressionField
            id={`map-${node.id}`}
            label={t("config.action.mapping")}
            value={s(cfg.inputMapping)}
            onChange={(v) => set({ inputMapping: v })}
            rows={8}
            hint={t.rich("config.action.mappingHint", {
              fields: required.length ? <>{required.map((r) => <code key={r} className="data me-1">{r}</code>)}</> : t("config.action.none"),
              ref: <code className="data">$steps.&lt;id&gt;</code>,
            })}
          />
          <Button size="sm" className="self-start" onClick={() => set({ inputMapping: mappingSkeleton(action) })}>
            {t("config.action.reset")}
          </Button>
          <label className="flex items-start gap-2 text-base">
            <input type="checkbox" className="mt-1" checked={Boolean(cfg.requireApproval) || action.sensitive} disabled={action.sensitive} onChange={(e) => set({ requireApproval: e.target.checked })} />
            <span>
              {t("config.action.requireApproval")}
              {action.sensitive && <span className="block text-sm text-muted">{t("config.action.alwaysRequired")}</span>}
            </span>
          </label>
          <Field label={t("config.http.attempts")} htmlFor={`ra-${node.id}`} hint={action.sideEffect === "non_idempotent" ? t("config.action.attemptsNonIdempotent") : t("config.action.attemptsIdempotent")}>
            <Input id={`ra-${node.id}`} type="number" className="data w-24" min={1} max={5} value={String(retry)} onChange={(e) => set({ retry: { maxAttempts: Number(e.target.value) } })} />
          </Field>
        </>
      )}
    </>
  );
}
