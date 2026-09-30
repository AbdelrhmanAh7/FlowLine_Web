"use client";

import { useMemo, useState } from "react";
import { modelFreeNote } from "@/i18n/ai-provider-text";
import { useT } from "@/i18n/client";
import type { AiRouteRef, PickerModelDto } from "@/lib/ai";
import { Input, Select, StatusBadge, cx } from "../ui";
import { LtrRuns } from "./ltr-runs";

type CapFilter = "any" | "tools" | "structuredOutput";
type CostFilter = "any" | "known" | "unknown" | "free";
type CtxFilter = "any" | "known";

function perM(micros: number | null) {
  return micros == null ? "?" : (micros / 1_000_000).toFixed(micros % 1_000_000 === 0 ? 0 : 2);
}

/**
 * Reusable, searchable model picker. It only ever lists models on connections the member may USE (the server
 * filters by ai.use + the connection's use_roles). Direct and gateway routes are labelled distinctly; unknown
 * prices and context sizes stay "unknown" (never shown as 0).
 */
export function ModelPicker({
  id,
  models,
  value,
  onChange,
  allowDefault,
  defaultLabel,
  disabled,
  loading,
}: {
  id: string;
  models: PickerModelDto[];
  value: AiRouteRef | null;
  onChange: (v: AiRouteRef | null) => void;
  allowDefault?: boolean;
  defaultLabel?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [cap, setCap] = useState<CapFilter>("any");
  const [provider, setProvider] = useState("all");
  const [cost, setCost] = useState<CostFilter>("any");
  const [ctx, setCtx] = useState<CtxFilter>("any");
  const [showRemoved, setShowRemoved] = useState(false);
  const providers = useMemo(() => [...new Map(models.map((m) => [m.provider, m.providerName])).entries()], [models]);
  const selected = value ? models.find((m) => m.connectionId === value.connectionId && m.modelId === value.modelId) : undefined;
  const shown = models.filter((m) => {
    if (!showRemoved && m.lifecycle === "removed") return false;
    if (provider !== "all" && m.provider !== provider) return false;
    if (cap !== "any" && m.capabilities[cap] !== "SUPPORTED") return false;
    if (cost === "known" && !m.price.known) return false;
    if (cost === "unknown" && m.price.known) return false;
    if (cost === "free" && !m.price.zero) return false;
    if (ctx === "known" && m.contextWindow == null) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${m.modelId} ${m.connectionLabel} ${m.providerName} ${m.ownedBy ?? ""}`.toLowerCase().includes(needle);
  });

  return (
    <div className={cx("flex flex-col gap-2", disabled && "pointer-events-none opacity-60")} data-testid="model-picker">
      <p className="text-sm text-med" aria-live="polite">
        {value ? (
          <>
            {t("aiHub.picker.selected")}{" "}
            <span dir="ltr" className="data text-hi">
              {value.modelId}
            </span>{" "}
            · {selected ? selected.connectionLabel : t("aiHub.picker.selectedUnavailable")}
          </>
        ) : allowDefault ? (
          defaultLabel
        ) : (
          t("aiHub.picker.none")
        )}
      </p>
      <Input id={id} type="search" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("aiHub.picker.search")} aria-label={t("aiHub.picker.search")} className="h-8" />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("aiHub.picker.filters")}>
        <Select size="sm" aria-label={t("aiHub.picker.capability")} className="w-auto text-sm" value={cap} onChange={(e) => setCap(e.target.value as CapFilter)}>
          <option value="any">{t("aiHub.picker.capAny")}</option>
          <option value="tools">{t("aiHub.picker.capTools")}</option>
          <option value="structuredOutput">{t("aiHub.picker.capStructured")}</option>
        </Select>
        <Select size="sm" aria-label={t("aiHub.picker.provider")} className="w-auto text-sm" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="all">{t("aiHub.picker.providerAll")}</option>
          {providers.map(([pid, name]) => (
            <option key={pid} value={pid}>
              {name}
            </option>
          ))}
        </Select>
        <Select size="sm" aria-label={t("aiHub.picker.cost")} className="w-auto text-sm" value={cost} onChange={(e) => setCost(e.target.value as CostFilter)}>
          <option value="any">{t("aiHub.picker.costAny")}</option>
          <option value="known">{t("aiHub.picker.costKnown")}</option>
          <option value="unknown">{t("aiHub.picker.costUnknown")}</option>
          <option value="free">{t("aiHub.picker.costFree")}</option>
        </Select>
        <Select size="sm" aria-label={t("aiHub.picker.context")} className="w-auto text-sm" value={ctx} onChange={(e) => setCtx(e.target.value as CtxFilter)}>
          <option value="any">{t("aiHub.picker.contextAny")}</option>
          <option value="known">{t("aiHub.picker.contextKnown")}</option>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-med">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
          {t("aiHub.picker.showRemoved")}
        </label>
      </div>
      <ul role="listbox" aria-label={t("aiHub.picker.list")} className="max-h-64 overflow-y-auto rounded-md border border-line bg-app">
        {allowDefault && (
          <li role="option" aria-selected={!value} tabIndex={0} onClick={() => onChange(null)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onChange(null))} className={cx("cursor-pointer border-b border-line px-3 py-2 text-sm focus:outline-none focus-visible:bg-card", !value ? "bg-card text-hi" : "text-med hover:bg-card")}>
            {defaultLabel}
          </li>
        )}
        {loading && <li className="px-3 py-2 text-sm text-muted">{t("aiHub.picker.loading")}</li>}
        {!loading && models.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("aiHub.picker.noConnections")}</li>}
        {!loading && models.length > 0 && shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("aiHub.picker.noMatch")}</li>}
        {shown.map((m) => {
          const isSel = value?.connectionId === m.connectionId && value.modelId === m.modelId;
          const pick = () => m.lifecycle !== "removed" && onChange({ connectionId: m.connectionId, modelId: m.modelId });
          return (
            <li
              key={`${m.connectionId}/${m.modelId}`}
              role="option"
              aria-selected={isSel}
              aria-disabled={m.lifecycle === "removed"}
              tabIndex={0}
              onClick={pick}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
              className={cx(
                "flex cursor-pointer flex-col gap-0.5 border-b border-line px-3 py-2 text-sm last:border-b-0 focus:outline-none focus-visible:bg-card",
                isSel ? "bg-card" : "hover:bg-card",
                m.lifecycle === "removed" && "cursor-not-allowed text-muted",
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span dir="ltr" className="data text-hi">
                  {m.modelId}
                </span>
                <StatusBadge tone={m.routeKind === "gateway" ? "info" : "muted"}>{m.routeKind === "gateway" ? t("aiHub.routeKind.gateway") : t("aiHub.routeKind.direct")}</StatusBadge>
                {m.lifecycle === "removed" && <StatusBadge tone="danger">{t("aiHub.picker.removed")}</StatusBadge>}
                {m.accessConfirmed && <StatusBadge tone="success">{t("aiHub.picker.confirmed")}</StatusBadge>}
                {m.price.zero && (
                  <span data-testid="model-free">
                    <StatusBadge tone="success">{t("aiHub.picker.free")}</StatusBadge>
                  </span>
                )}
              </span>
              <span className="text-muted">
                {m.providerName} · {m.connectionLabel} ·{" "}
                {m.price.known ? t("aiHub.picker.price", { input: perM(m.price.inputPerMTokMicros), output: perM(m.price.outputPerMTokMicros) }) : t("aiHub.picker.priceUnknown")} ·{" "}
                {m.contextWindow != null ? t("aiHub.picker.contextSize", { n: m.contextWindow.toLocaleString() }) : t("aiHub.picker.contextUnknown")}
              </span>
              {m.price.known && m.price.source === "catalogue" && m.price.sourceUrl && (
                <span className="text-xs text-muted">
                  {t("aiHub.picker.priceSource", { date: m.price.verifiedAt ?? "—" })}{" "}
                  <a dir="ltr" className="text-accent-text hover:underline" href={m.price.sourceUrl} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
                    {new URL(m.price.sourceUrl).hostname}
                  </a>
                </span>
              )}
              {m.price.known && m.price.source === "workspace_price_table" && <span className="text-xs text-muted">{t("aiHub.picker.priceOwn")}</span>}
              {m.idUnverified && <span className="text-xs text-muted">{t("aiHub.picker.idUnverified")}</span>}
              {m.freeTierNote && (
                <span className="text-xs text-muted">
                  <LtrRuns text={modelFreeNote(t, m)!} rtl={t.locale === "ar"} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
