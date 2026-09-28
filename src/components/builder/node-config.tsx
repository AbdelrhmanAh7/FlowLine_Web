"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { checkExpressionSyntax } from "@/engine/expression";
import { dueFires } from "@/engine/schedule-math";
import { checkCron } from "@/engine/validate";
import { api, ApiError } from "@/lib/api";
import { SIDE_EFFECT_LABEL, useCatalog, useConnections, type CatalogAction } from "@/lib/catalog";
import { useWorkspace } from "../shell/workspace-context";
import { Button, Field, Input, Textarea, cx } from "../ui";
import type { RFNode } from "./graph-utils";

type Cfg = Record<string, unknown>;
interface FormProps {
  node: RFNode;
  cfg: Cfg;
  set: (patch: Cfg) => void;
  readOnly: boolean;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const selectCls = "h-9 w-full rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none disabled:text-muted";

export function ExpressionField({ id, label, value, onChange, hint, allowEmpty, rows = 4 }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode; allowEmpty?: boolean; rows?: number }) {
  const err = value.trim() ? checkExpressionSyntax(value) : allowEmpty ? null : "Expression is empty";
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err}>
      <Textarea id={id} mono rows={rows} value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(err)} />
    </Field>
  );
}

export function JsonField({ id, label, value, onChange, hint, rows = 8 }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  let err: string | null = null;
  if (value.trim()) {
    try {
      JSON.parse(value);
    } catch (e) {
      err = `Invalid JSON: ${(e as Error).message}`;
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
      <select id={id} className={selectCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Notice({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  return <p className={cx("rounded-md border px-3 py-2 text-sm", tone === "warning" ? "border-warning/40 bg-warning/5 text-warning" : "border-line bg-card text-med")}>{children}</p>;
}

/** Type-specific configuration for the node drawer. */
export function NodeConfigForm(props: FormProps) {
  const { node, cfg, set } = props;
  const id = node.id;
  switch (node.type) {
    case "trigger.manual":
      return <JsonField id={`payload-${id}`} label="Sample payload (JSON)" value={s(cfg.samplePayload)} onChange={(v) => set({ samplePayload: v })} hint="Sent as the run input when you press Run." />;
    case "trigger.webhook":
      return (
        <>
          <Notice tone="info">Publish the flow to get its webhook URL and signing secret. Each delivery must be signed and carry a unique event id; duplicates are ignored.</Notice>
          <Select
            id={`sig-${id}`}
            label="Signature format"
            value={s(cfg.signatureScheme) || "flowline"}
            onChange={(v) => set({ signatureScheme: v })}
            options={[
              { value: "flowline", label: "Flowline (x-flowline-signature + event id)" },
              { value: "github", label: "GitHub webhooks (X-Hub-Signature-256 + X-GitHub-Delivery)" },
            ]}
          />
          <JsonField id={`payload-${id}`} label="Sample payload for test runs (JSON)" value={s(cfg.samplePayload)} onChange={(v) => set({ samplePayload: v })} />
        </>
      );
    case "trigger.schedule":
      return <ScheduleForm {...props} />;
    case "transform.json":
      return <ExpressionField id={`expr-${id}`} label="Expression (JSONata)" value={s(cfg.expression)} onChange={(v) => set({ expression: v })} rows={6} hint={<>Evaluated against the upstream output. <code className="data">$steps.&lt;id&gt;</code> reads any upstream step.</>} />;
    case "logic.condition":
      return <ExpressionField id={`expr-${id}`} label="Condition (JSONata)" value={s(cfg.expression)} onChange={(v) => set({ expression: v })} hint={<>Truthy → <span className="text-success">true</span> branch, otherwise false. Data passes through unchanged.</>} />;
    case "output":
      return (
        <>
          <Field label="Output key" htmlFor={`key-${id}`} hint="Name of this value in the run result.">
            <Input id={`key-${id}`} className="data" value={s(cfg.key)} onChange={(e) => set({ key: e.target.value })} maxLength={64} />
          </Field>
          <ExpressionField id={`expr-${id}`} label="Value (JSONata, optional)" value={s(cfg.expression)} onChange={(v) => set({ expression: v })} hint="Leave empty to store the input as-is." allowEmpty />
        </>
      );
    case "data.filter":
      return (
        <>
          <ExpressionField id={`src-${id}`} label="Array to filter (JSONata)" value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} allowEmpty hint="Defaults to the whole input." />
          <ExpressionField id={`pred-${id}`} label="Keep items where (JSONata)" value={s(cfg.predicate)} onChange={(v) => set({ predicate: v })} rows={3} hint="Evaluated per item; `$` is the item." />
        </>
      );
    case "data.map":
      return <MapForm {...props} />;
    case "data.merge":
      return (
        <Select
          id={`mode-${id}`}
          label="Combine branches as"
          value={s(cfg.mode)}
          onChange={(v) => set({ mode: v })}
          options={[
            { value: "object", label: "Object keyed by step name" },
            { value: "array", label: "Array of values" },
            { value: "first", label: "First branch that ran" },
          ]}
          hint="Waits for every incoming branch; skipped branches contribute nothing."
        />
      );
    case "data.csv":
      return (
        <>
          <Select id={`mode-${id}`} label="Mode" value={s(cfg.mode)} onChange={(v) => set({ mode: v })} options={[{ value: "parse", label: "Parse CSV text → rows" }, { value: "build", label: "Build CSV from rows" }]} />
          <ExpressionField id={`src-${id}`} label={cfg.mode === "build" ? "Rows (JSONata)" : "CSV text (JSONata)"} value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} allowEmpty />
          <Field label="Delimiter" htmlFor={`d-${id}`}>
            <Input id={`d-${id}`} className="data w-16" maxLength={1} value={s(cfg.delimiter)} onChange={(e) => set({ delimiter: e.target.value })} />
          </Field>
        </>
      );
    case "data.file":
      return <FileForm {...props} />;
    case "data.store":
      return (
        <>
          <Select id={`op-${id}`} label="Operation" value={s(cfg.op)} onChange={(v) => set({ op: v })} options={[{ value: "get", label: "Get value" }, { value: "set", label: "Set value" }]} />
          <Field label="Namespace" htmlFor={`ns-${id}`}>
            <Input id={`ns-${id}`} className="data" value={s(cfg.namespace)} onChange={(e) => set({ namespace: e.target.value })} maxLength={40} />
          </Field>
          <ExpressionField id={`k-${id}`} label="Key (JSONata)" value={s(cfg.key)} onChange={(v) => set({ key: v })} rows={1} />
          {cfg.op === "set" && <ExpressionField id={`v-${id}`} label="Value (JSONata)" value={s(cfg.value)} onChange={(v) => set({ value: v })} rows={2} />}
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
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")] : ["UTC"]), []);
  const cron = s(cfg.cron);
  const tz = s(cfg.timezone) || "UTC";
  const err = checkCron(cron, tz);
  // "Now" is captured once per mount so the preview is stable across re-renders.
  const [mountedAt] = useState(() => Date.now());
  const preview = useMemo(() => {
    if (err) return [];
    try {
      return dueFires(cron, tz, new Date(mountedAt), new Date(mountedAt + 60 * 86400_000), 3).map((d) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d));
    } catch {
      return [];
    }
  }, [cron, tz, err, mountedAt]);
  const presets = [
    ["Every 15 min", "*/15 * * * *"],
    ["Hourly", "0 * * * *"],
    ["Daily 09:00", "0 9 * * *"],
    ["Mondays 09:00", "0 9 * * 1"],
  ];
  return (
    <>
      <Field label="Cron (minute hour day month weekday)" htmlFor={`cron-${node.id}`} error={err}>
        <Input id={`cron-${node.id}`} className="data" value={cron} onChange={(e) => set({ cron: e.target.value })} invalid={Boolean(err)} />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, c]) => (
          <button key={c} type="button" onClick={() => set({ cron: c })} className="rounded-md border border-line px-2 py-1 text-sm text-med hover:bg-card hover:text-hi">
            {label}
          </button>
        ))}
      </div>
      <Select id={`tz-${node.id}`} label="Time zone" value={tz} onChange={(v) => set({ timezone: v })} options={zones.map((z) => ({ value: z, label: z }))} hint="Daylight-saving changes follow this zone." />
      <Select
        id={`missed-${node.id}`}
        label="If runs were missed (e.g. worker down)"
        value={s(cfg.missedPolicy) || "skip"}
        onChange={(v) => set({ missedPolicy: v })}
        options={[
          { value: "skip", label: "Skip them" },
          { value: "run_once", label: "Run once to catch up" },
          { value: "run_all", label: "Run each missed time (max 10)" },
        ]}
      />
      {preview.length > 0 && (
        <p className="text-sm text-med">
          Next: <span className="data text-hi">{preview.join(" · ")}</span>
        </p>
      )}
      <Notice tone="info">Schedules run the published version. Publish after changing them.</Notice>
    </>
  );
}

function MapForm({ node, cfg, set, readOnly }: FormProps) {
  const fields = (Array.isArray(cfg.fields) ? cfg.fields : []) as { key: string; expression: string }[];
  const update = (i: number, patch: Partial<{ key: string; expression: string }>) => set({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium tracking-[0.4px] text-med uppercase">Fields</p>
      {fields.map((f, i) => {
        const err = f.expression.trim() ? checkExpressionSyntax(f.expression) : "empty";
        return (
          <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-2">
            <Input aria-label={`Field ${i + 1} name`} className="data h-8" value={f.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="field" />
            <Input aria-label={`Field ${i + 1} value`} className="data h-8" value={f.expression} onChange={(e) => update(i, { expression: e.target.value })} placeholder="expression" invalid={Boolean(err)} />
            <Button size="sm" variant="ghost" aria-label={`Remove field ${i + 1}`} onClick={() => set({ fields: fields.filter((_, j) => j !== i) })} disabledReason={readOnly ? "Read-only" : null}>
              ✕
            </Button>
          </div>
        );
      })}
      <Button size="sm" className="self-start" onClick={() => set({ fields: [...fields, { key: `field${fields.length + 1}`, expression: "$" }] })} disabledReason={readOnly ? "Read-only" : fields.length >= 50 ? "At most 50 fields" : null}>
        + Add field
      </Button>
      <p className="text-sm text-muted">Each value is a JSONata expression over the input{node ? "" : ""}.</p>
    </div>
  );
}

function FileForm({ node, cfg, set, readOnly }: FormProps) {
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
      if (!r.ok) throw new ApiError(r.status, b.error?.code ?? "UPLOAD", b.error?.message ?? "Upload failed");
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
        label="File comes from"
        value={s(cfg.from)}
        onChange={(v) => set({ from: v })}
        options={[
          { value: "input", label: "Upstream data (base64, e.g. an attachment)" },
          { value: "upload", label: "An uploaded file" },
          { value: "url", label: "A URL (public, egress-protected)" },
        ]}
      />
      {cfg.from === "upload" ? (
        <div className="flex flex-col gap-2">
          <Select
            id={`file-${node.id}`}
            label="Uploaded file"
            value={s(cfg.fileId)}
            onChange={(v) => set({ fileId: v })}
            options={[{ value: "", label: files.isPending ? "Loading…" : "Choose a file" }, ...(files.data ?? []).map((f) => ({ value: f.id, label: `${f.name} (${Math.ceil(f.size / 1024)}KB)` }))]}
          />
          <input ref={inputRef} type="file" accept=".pdf,.csv,.json,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button size="sm" className="self-start" onClick={() => inputRef.current?.click()} disabledReason={readOnly ? "Read-only" : null}>
            Upload file (5MB max)
          </Button>
          {uploadError && <p role="alert" className="text-sm text-danger">{uploadError}</p>}
        </div>
      ) : (
        <ExpressionField id={`src-${node.id}`} label={cfg.from === "url" ? "URL (JSONata)" : "Base64 data (JSONata)"} value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} />
      )}
      <Select
        id={`as-${node.id}`}
        label="Read as"
        value={s(cfg.as)}
        onChange={(v) => set({ as: v })}
        options={[
          { value: "pdf_text", label: "PDF → text" },
          { value: "csv", label: "CSV → rows" },
          { value: "json", label: "JSON" },
          { value: "text", label: "Plain text" },
        ]}
        hint="Parsing runs in an isolated, memory-limited process."
      />
    </>
  );
}

function SubflowForm({ node, cfg, set }: FormProps) {
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
        label={node.type === "logic.loop" ? "Run this subflow per item" : "Subflow"}
        value={s(cfg.flowId)}
        onChange={(v) => {
          const f = flows.data?.find((x) => x.id === v);
          set({ flowId: v, version: f?.publishedVersion ?? 1 });
        }}
        options={[{ value: "", label: flows.isPending ? "Loading…" : flows.data?.length ? "Choose a published flow" : "No published flows yet" }, ...(flows.data ?? []).map((f) => ({ value: f.id, label: `${f.name} (v${f.publishedVersion})` }))]}
        hint="Only published versions can be used; the version is pinned."
      />
      {chosen && (
        <Field label="Pinned version" htmlFor={`ver-${node.id}`} hint={`Latest published: v${chosen.publishedVersion}`}>
          <Input id={`ver-${node.id}`} type="number" min={1} className="data w-24" value={String(cfg.version ?? 1)} onChange={(e) => set({ version: Number(e.target.value) })} />
        </Field>
      )}
      {node.type === "logic.loop" ? (
        <>
          <ExpressionField id={`items-${node.id}`} label="Items (JSONata → array)" value={s(cfg.items)} onChange={(v) => set({ items: v })} rows={2} />
          <Field label="Max items" htmlFor={`max-${node.id}`} hint="The step fails (rather than silently truncating) when there are more items. Hard cap 500.">
            <Input id={`max-${node.id}`} type="number" min={1} max={500} className="data w-24" value={String(cfg.maxItems ?? 50)} onChange={(e) => set({ maxItems: Number(e.target.value) })} />
          </Field>
        </>
      ) : (
        <ExpressionField id={`in-${node.id}`} label="Subflow input (JSONata)" value={s(cfg.input)} onChange={(v) => set({ input: v })} rows={2} allowEmpty />
      )}
    </>
  );
}

function HttpForm({ node, cfg, set }: FormProps) {
  const retry = (cfg.retry as { maxAttempts?: number } | undefined)?.maxAttempts ?? 3;
  return (
    <>
      <Select id={`m-${node.id}`} label="Method" value={s(cfg.method)} onChange={(v) => set({ method: v, sideEffect: v === "GET" ? "none" : s(cfg.sideEffect) === "none" ? "non_idempotent" : s(cfg.sideEffect) })} options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))} />
      <ExpressionField id={`url-${node.id}`} label="URL (JSONata)" value={s(cfg.url)} onChange={(v) => set({ url: v })} rows={1} hint={<>Quote literals: <code className="data">&apos;https://api.example.com/items&apos;</code>. Private and metadata addresses are blocked.</>} />
      <ExpressionField id={`h-${node.id}`} label="Headers (JSONata object, optional)" value={s(cfg.headers)} onChange={(v) => set({ headers: v })} rows={2} allowEmpty hint="Don't paste secrets here — use an app connection for authenticated APIs." />
      {cfg.method !== "GET" && <ExpressionField id={`b-${node.id}`} label="JSON body (JSONata, optional)" value={s(cfg.body)} onChange={(v) => set({ body: v })} rows={3} allowEmpty />}
      {cfg.method !== "GET" && (
        <Select
          id={`se-${node.id}`}
          label="Side effect"
          value={s(cfg.sideEffect) || "non_idempotent"}
          onChange={(v) => set({ sideEffect: v })}
          options={[
            { value: "non_idempotent", label: "Not idempotent — never auto-retry a lost response" },
            { value: "idempotent", label: "Idempotent — safe to retry" },
          ]}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Timeout (ms)" htmlFor={`t-${node.id}`}>
          <Input id={`t-${node.id}`} type="number" className="data" min={1000} max={60000} value={String(cfg.timeoutMs ?? 15000)} onChange={(e) => set({ timeoutMs: Number(e.target.value) })} />
        </Field>
        <Field label="Attempts" htmlFor={`r-${node.id}`} hint="1–5, with backoff">
          <Input id={`r-${node.id}`} type="number" className="data" min={1} max={5} value={String(retry)} onChange={(e) => set({ retry: { maxAttempts: Number(e.target.value) } })} />
        </Field>
      </div>
    </>
  );
}

function AiForm({ node, cfg, set }: FormProps) {
  const catalog = useCatalog();
  const ai = catalog.data?.runtime.ai;
  return (
    <>
      {ai && !ai.available && <Notice tone="warning">AI is unavailable on this server: {ai.reason}. Runs using this step will fail until it is configured.</Notice>}
      {ai?.available && (
        <p className="text-sm text-muted">
          Provider: <span className="data text-med">{ai.provider}</span> · default model <span className="data text-med">{ai.model}</span>. Usage and cost are recorded per run.
        </p>
      )}
      <Field label="Instructions" htmlFor={`ins-${node.id}`} hint="Content from documents/emails is treated as data; instructions inside it are ignored.">
        <Textarea id={`ins-${node.id}`} rows={4} value={s(cfg.instructions)} onChange={(e) => set({ instructions: e.target.value })} maxLength={4000} />
      </Field>
      <ExpressionField id={`src-${node.id}`} label="Content (JSONata)" value={s(cfg.source)} onChange={(v) => set({ source: v })} rows={2} />
      {node.type === "ai.extract" && <JsonField id={`schema-${node.id}`} label="Output JSON Schema" value={s(cfg.schema)} onChange={(v) => set({ schema: v })} rows={9} hint="Output that doesn't match fails the step." />}
      {node.type === "ai.classify" && (
        <Field label="Labels (comma-separated)" htmlFor={`labels-${node.id}`}>
          <Input id={`labels-${node.id}`} className="data" value={s(cfg.labels)} onChange={(e) => set({ labels: e.target.value })} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model (optional)" htmlFor={`model-${node.id}`} hint="Blank = server default">
          <Input id={`model-${node.id}`} className="data" value={s(cfg.model)} onChange={(e) => set({ model: e.target.value })} maxLength={80} />
        </Field>
        {node.type !== "ai.classify" && (
          <Field label="Max tokens" htmlFor={`mt-${node.id}`}>
            <Input id={`mt-${node.id}`} type="number" className="data" min={16} max={4000} value={String(cfg.maxTokens ?? 400)} onChange={(e) => set({ maxTokens: Number(e.target.value) })} />
          </Field>
        )}
      </div>
    </>
  );
}

function CodeForm({ node, cfg, set }: FormProps) {
  const catalog = useCatalog();
  const sb = catalog.data?.runtime.codeSandbox;
  return (
    <>
      {sb && !sb.available && <Notice tone="warning">Code is unavailable: {sb.reason}. User code never runs inside the server.</Notice>}
      {sb?.available && <Notice tone="info">Runs in an isolated container: no network, 128MB memory, 0.5 CPU, no access to server secrets.</Notice>}
      <Field label="JavaScript" htmlFor={`code-${node.id}`} hint="`input` holds the upstream data. `return` a JSON value.">
        <Textarea id={`code-${node.id}`} mono rows={10} value={s(cfg.code)} onChange={(e) => set({ code: e.target.value })} />
      </Field>
      <Field label="Timeout (ms)" htmlFor={`ct-${node.id}`}>
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
        label="App"
        value={provider?.id ?? ""}
        onChange={(v) => {
          setPickProvider(v);
          set({ actionId: "", connectionId: "" });
        }}
        options={[{ value: "", label: catalog.isPending ? "Loading…" : "Choose an app" }, ...(catalog.data?.providers ?? []).map((p) => ({ value: p.id, label: p.name }))]}
      />
      {provider && (
        <Select
          id={`action-${node.id}`}
          label="Action"
          value={actionId}
          onChange={(v) => {
            const a = provider.actions.find((x) => x.id === v);
            set({ actionId: v, requireApproval: a?.sensitive ? true : Boolean(cfg.requireApproval), inputMapping: a ? mappingSkeleton(a) : "{}" });
          }}
          options={[{ value: "", label: "Choose an action" }, ...provider.actions.map((a) => ({ value: a.id, label: `${a.title} · ${SIDE_EFFECT_LABEL[a.sideEffect]}` }))]}
        />
      )}
      {action && <p className="text-sm text-muted">{action.description}</p>}
      {provider && (
        <Select
          id={`conn-${node.id}`}
          label="Connection"
          value={s(cfg.connectionId)}
          onChange={(v) => set({ connectionId: v })}
          options={[{ value: "", label: conns.length ? "Choose a connection" : `No ${provider.name} connections yet` }, ...conns.map((c) => ({ value: c.id, label: `${c.label}${c.status !== "active" ? ` (${c.status})` : ""}${c.visibility === "private" ? (c.ownerId === user.id ? " · private (yours)" : " · private to another member — can't run for you") : ""}` }))]}
          hint={
            <Link href={`/w/${workspace.slug}/integrations`} className="text-accent hover:underline">
              Manage connections <span aria-hidden className="flip-rtl">→</span>
            </Link>
          }
        />
      )}
      {conn && conn.status !== "active" && <Notice tone="warning">{conn.label} is {conn.status}. Reconnect it — flows using it are paused.</Notice>}
      {action && (
        <>
          <ExpressionField
            id={`map-${node.id}`}
            label="Input mapping (JSONata → object)"
            value={s(cfg.inputMapping)}
            onChange={(v) => set({ inputMapping: v })}
            rows={8}
            hint={<>Required: {required.length ? required.map((r) => <code key={r} className="data me-1">{r}</code>) : "none"}. Use <code className="data">$steps.&lt;id&gt;</code> for upstream data.</>}
          />
          <Button size="sm" className="self-start" onClick={() => set({ inputMapping: mappingSkeleton(action) })}>
            Reset to template
          </Button>
          <label className="flex items-start gap-2 text-base">
            <input type="checkbox" className="mt-1" checked={Boolean(cfg.requireApproval) || action.sensitive} disabled={action.sensitive} onChange={(e) => set({ requireApproval: e.target.checked })} />
            <span>
              Require human approval before running
              {action.sensitive && <span className="block text-sm text-muted">Always required for this action.</span>}
            </span>
          </label>
          <Field label="Attempts" htmlFor={`ra-${node.id}`} hint={action.sideEffect === "non_idempotent" ? "Lost responses are verified or sent for review — never blindly retried." : "Retries use exponential backoff with jitter."}>
            <Input id={`ra-${node.id}`} type="number" className="data w-24" min={1} max={5} value={String(retry)} onChange={(e) => set({ retry: { maxAttempts: Number(e.target.value) } })} />
          </Field>
        </>
      )}
    </>
  );
}
