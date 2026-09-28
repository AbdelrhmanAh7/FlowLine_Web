"use client";

import { useMemo, useState } from "react";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { DESIGN_TEMPLATES, type DesignTemplate } from "@/engine/design-templates";
import { useCatalog, useConnections } from "@/lib/catalog";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, Card, EmptyState, Input, SectionLabel, cx } from "@/components/ui";
import { useT } from "@/i18n/client";
import { templateNodeLabel } from "@/i18n/template-text";
import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";
import { useOnline } from "@/lib/hooks";
import { topoOrder } from "@/engine/validate";
import { useCreateFlow } from "../flows/dashboard";

const CATEGORIES = ["All", "Sales", "Support", "Marketing", "Data ops", "Finance", "Engineering"] as const;

/** Catalogue text for data-driven keys (template ids, categories), with the template's own English as fallback. */
const tr = (t: Translator, key: string, fallback: string) => (t.has(key) ? t(key as MessageKey) : fallback);

/** A template's name/description in the UI language (local templates: `localTemplates.<id>`, app templates: `designTemplates.<id>`). */
function templateText(t: Translator, group: "localTemplates" | "designTemplates", tpl: { id: string; name: string; description: string }) {
  return { name: tr(t, `${group}.${tpl.id}.name`, tpl.name), description: tr(t, `${group}.${tpl.id}.description`, tpl.description) };
}

export default function TemplatesPage() {
  const t = useT();
  const { canEdit, workspace } = useWorkspace();
  const catalog = useCatalog();
  const connections = useConnections(workspace.id);
  const online = useOnline();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [q, setQ] = useState("");
  const create = useCreateFlow();
  // Search matches the shown (translated) text and the original English alike.
  const match = (group: "localTemplates" | "designTemplates") => (tpl: { id: string; name: string; description: string; category: string }) => {
    const shown = templateText(t, group, tpl);
    return (cat === "All" || tpl.category === cat) && `${shown.name} ${shown.description} ${tpl.name} ${tpl.description}`.toLowerCase().includes(q.trim().toLowerCase());
  };
  const local = useMemo(() => LOCAL_TEMPLATES.filter(match("localTemplates")), [cat, q, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const planned = useMemo(() => DESIGN_TEMPLATES.filter(match("designTemplates")), [cat, q, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const useReason = !canEdit ? t("templates.viewer") : !online ? t("templates.offline") : null;
  const categoryLabel = (c: string) => (c === "All" ? t("templates.all") : tr(t, `templateCategory.${c}`, c));

  return (
    <div className="flex flex-col">
      <PageHeader title={t("templates.title")} sub={t("templates.sub")} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={t("templates.filterAria")} className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
                className={cx("h-7 rounded-md px-2.5 text-base transition-colors duration-[var(--dur-tab)]", cat === c ? "bg-elevated text-hi" : "text-med hover:text-hi")}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
          <label htmlFor="tpl-search" className="sr-only">
            {t("templates.searchLabel")}
          </label>
          <Input id="tpl-search" placeholder={t("templates.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} className="ms-auto h-8 w-full sm:w-64" />
        </div>

        {local.length === 0 && planned.length === 0 ? (
          <EmptyState
            icon="⌕"
            title={t("templates.noMatch")}
            action={
              <Button
                onClick={() => {
                  setCat("All");
                  setQ("");
                }}
              >
                {t("templates.clearFilters")}
              </Button>
            }
          />
        ) : (
          <>
            {local.length > 0 && (
              <section>
                <SectionLabel className="mb-3">{t("templates.ready")}</SectionLabel>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {local.map((tpl) => {
                    const chain = topoOrder(tpl.graph).slice(0, 4);
                    const shown = templateText(t, "localTemplates", tpl);
                    return (
                      <li key={tpl.id}>
                        <Card className="flex h-full flex-col gap-3 p-4">
                          <Chain items={chain.map((n) => `${NODE_DEFINITIONS[n.type].icon} ${templateNodeLabel(t, tpl.id, n)}`)} />
                          <div className="flex-1">
                            <p className="text-lg font-semibold">{shown.name}</p>
                            <p className="mt-1 text-base text-med">{shown.description}</p>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="data text-xs text-muted uppercase">
                              {categoryLabel(tpl.category)} · {t.plural("flows.nodes", tpl.graph.nodes.length)}
                            </span>
                            <Button size="sm" variant="primary" disabledReason={useReason} loading={create.isPending && create.variables?.templateId === tpl.id} onClick={() => create.mutate({ templateId: tpl.id })}>
                              {t("templates.use")}
                            </Button>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {planned.length > 0 && (
              <section>
                <SectionLabel className="mb-3">{t("templates.connected")}</SectionLabel>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {planned.map((tpl) => {
                    const shown = templateText(t, "designTemplates", tpl);
                    return (
                      <li key={tpl.id}>
                        <Card className="flex h-full flex-col gap-3 p-4" data-testid={`template-${tpl.id}`}>
                          <Chain items={topoOrder(tpl.graph).slice(0, 4).map((n) => `${NODE_DEFINITIONS[n.type].icon} ${templateNodeLabel(t, tpl.id, n)}`)} />
                          <div className="flex-1">
                            <p className="text-lg font-semibold">{shown.name}</p>
                            <p className="mt-1 text-base text-med">{shown.description}</p>
                          </div>
                          <Requirements tpl={tpl} status={(p) => reqStatus(t, p, catalog.data, connections.data)} />
                          <details className="text-sm text-med">
                            <summary className="cursor-pointer text-hi">{t.plural("templates.setup", tpl.setup.length)}</summary>
                            <ol className="mt-2 list-decimal space-y-1 ps-5">
                              {tpl.setup.map((s, i) => (
                                <li key={s}>{tr(t, `designTemplates.${tpl.id}.setup.s${i + 1}`, s)}</li>
                              ))}
                            </ol>
                          </details>
                          <div className="flex items-center justify-between gap-2">
                            <span className="data text-xs text-muted uppercase">
                              {categoryLabel(tpl.category)} · {t.plural("flows.nodes", tpl.graph.nodes.length)}
                            </span>
                            <Button size="sm" variant="primary" disabledReason={useReason} loading={create.isPending && create.variables?.templateId === tpl.id} onClick={() => create.mutate({ templateId: tpl.id })}>
                              {t("templates.use")}
                            </Button>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Chain({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-app p-2.5">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="max-w-32 truncate rounded-md border border-line bg-card px-2 py-1 text-sm">{it}</span>
          {i < items.length - 1 && <span aria-hidden className="flip-rtl text-muted">→</span>}
        </span>
      ))}
    </div>
  );
}

type ReqState = { ok: boolean; text: string };
function reqStatus(
  t: Translator,
  provider: string,
  catalog: ReturnType<typeof useCatalog>["data"],
  conns: ReturnType<typeof useConnections>["data"],
): ReqState {
  if (provider === "http") return { ok: true, text: t("templates.req.builtIn") };
  if (provider === "ai") {
    if (!catalog) return { ok: false, text: t("templates.req.checking") };
    return catalog.runtime.ai.available ? { ok: true, text: t("templates.req.aiAvailable") } : { ok: false, text: catalog.runtime.ai.reason ?? t("templates.req.aiNotConfigured") };
  }
  if (!conns) return { ok: false, text: t("templates.req.checking") };
  const mine = conns.filter((c) => c.provider === provider);
  if (mine.some((c) => c.status === "active")) return { ok: true, text: t("templates.req.connected") };
  if (mine.length > 0) return { ok: false, text: t("templates.req.needsReconnect") };
  return { ok: false, text: t("templates.req.notConnected") };
}

function Requirements({ tpl, status }: { tpl: DesignTemplate; status: (provider: string) => ReqState }) {
  const t = useT();
  return (
    <ul aria-label={t("templates.requirements")} className="flex flex-col gap-1">
      {tpl.requires.map((r) => {
        const st = status(r.provider);
        const purpose = tr(t, `designTemplates.${tpl.id}.requires.${r.provider}`, r.purpose);
        return (
          <li key={r.provider} className="flex items-center justify-between gap-2 text-sm" title={purpose}>
            <span className="truncate">{purpose}</span>
            <span className={cx("data shrink-0 rounded px-1.5 py-0.5 text-xs", st.ok ? "bg-elevated text-hi" : "text-muted")}>
              {st.ok ? "✓ " : ""}
              {st.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
