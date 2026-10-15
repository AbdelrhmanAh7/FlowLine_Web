"use client";

import { useMemo, useState } from "react";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { DESIGN_TEMPLATES, availableDesignTemplates, heldBackDesignTemplates, type DesignTemplate } from "@/engine/design-templates";
import { useAiOverview, type AiStatusDto } from "@/lib/ai";
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
import { HelpDisclosure } from "@/components/help-disclosure";

const CATEGORIES = ["All", "Sales", "Support", "Marketing", "Data ops", "Finance", "Operations", "Personal", "Engineering"] as const;

/** Catalogue text for data-driven keys (template ids, categories), with the template's own English as fallback. */
const tr = (t: Translator, key: string, fallback: string) => (t.has(key) ? t(key as MessageKey) : fallback);

/** A template's name/description in the UI language (local templates: `localTemplates.<id>`, app templates: `designTemplates.<id>`). */
function templateText(t: Translator, group: "localTemplates" | "designTemplates", tpl: { id: string; name: string; description: string }) {
  return { name: tr(t, `${group}.${tpl.id}.name`, tpl.name), description: tr(t, `${group}.${tpl.id}.description`, tpl.description) };
}

export default function TemplatesPage() {
  const t = useT();
  const { canEdit, workspace } = useWorkspace();
  const ai = useAiOverview(workspace.id);
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
  const catalog = useCatalog(workspace.id);
  const available = useMemo(() => new Set(catalog.data?.providers.flatMap((p) => p.actions.map((a) => a.id))), [catalog.data]);
  // A template is offered only once every action it calls exists in the catalog.
  // While the catalog is loading we show a loading state. Once loaded, we compute usable/heldBack.
  const { usable, heldBack } = useMemo(() => {
    if (!catalog.data) return { usable: [] as DesignTemplate[], heldBack: [] as ReturnType<typeof heldBackDesignTemplates> };
    return { usable: availableDesignTemplates(available, planned), heldBack: heldBackDesignTemplates(available, planned) };
  }, [planned, catalog.data, available]);
  const useReason = !canEdit ? t("templates.viewer") : !online ? t("templates.offline") : null;
  const categoryLabel = (c: string) => (c === "All" ? t("templates.all") : tr(t, `templateCategory.${c}`, c));

  // While the catalog is loading, show a loading state instead of rendering templates optimistically.
  // This prevents the race condition where templates appear as "usable" before the catalog resolves.
  if (catalog.isLoading) {
    return (
      <div className="flex flex-col">
        <PageHeader title={t("templates.title")} sub={t("templates.sub")} />
        <div className="flex flex-col gap-6 p-4 sm:p-6">
          <HelpDisclosure label={t("uxPages.templates.helpLabel")}>{t("uxPages.templates.helpBody")}</HelpDisclosure>
          <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" aria-hidden="true" />
            <span className="ms-3 text-med">{t("templates.loading")}</span>
          </div>
        </div>
      </div>
    );
  }
  // Shared by the offered and held-back design cards.
  const designCardBody = (tpl: DesignTemplate) => {
    const shown = templateText(t, "designTemplates", tpl);
    return (
      <>
        <Chain items={topoOrder(tpl.graph).slice(0, 4).map((n) => `${NODE_DEFINITIONS[n.type].icon} ${templateNodeLabel(t, tpl.id, n)}`)} />
        <div className="flex-1">
          <p className="text-lg font-semibold">{shown.name}</p>
          <p className="mt-1 text-base text-med">{shown.description}</p>
        </div>
        <Requirements tpl={tpl} status={(p) => reqStatus(t, p, ai.data?.status, connections.data)} />
      </>
    );
  };

  return (
    <div className="flex flex-col">
      <PageHeader title={t("templates.title")} sub={t("templates.sub")} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <HelpDisclosure label={t("uxPages.templates.helpLabel")}>{t("uxPages.templates.helpBody")}</HelpDisclosure>
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
                <SectionLabel className="mb-1">{t("templates.ready")}</SectionLabel>
                <p className="mb-3 max-w-3xl text-sm text-med">{t("templates.readyNote")}</p>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {local.map((tpl) => {
                    const chain = topoOrder(tpl.graph).slice(0, 4);
                    const shown = templateText(t, "localTemplates", tpl);
                    return (
                      <li key={tpl.id} className="motion-list-in">
                        <Card className="flex h-full flex-col gap-3 p-4" data-testid={`template-${tpl.id}`}>
                          <Chain items={chain.map((n) => `${NODE_DEFINITIONS[n.type].icon} ${templateNodeLabel(t, tpl.id, n)}`)} />
                          <div className="flex-1">
                            <p className="text-lg font-semibold">{shown.name}</p>
                            <p className="mt-1 text-base text-med">{shown.description}</p>
                            <dl className="mt-2 flex flex-col gap-1 text-sm">
                              <div>
                                <dt className="inline font-medium text-hi">{t("templates.sampleLabel")}: </dt>
                                <dd className="inline text-med">{tr(t, `localTemplates.${tpl.id}.sample`, tpl.sample)}</dd>
                              </div>
                              <div>
                                <dt className="inline font-medium text-hi">{t("templates.resultLabel")}: </dt>
                                <dd className="inline text-med">{tr(t, `localTemplates.${tpl.id}.result`, tpl.result)}</dd>
                              </div>
                            </dl>
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
            {usable.length > 0 && (
              <section>
                <SectionLabel className="mb-3">{t("templates.connected")}</SectionLabel>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {usable.map((tpl) => (
                    <li key={tpl.id} className="motion-list-in">
                      <Card className="flex h-full flex-col gap-3 p-4" data-testid={`template-${tpl.id}`}>
                        {designCardBody(tpl)}
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
                  ))}
                </ul>
              </section>
            )}
            {heldBack.length > 0 && (
              // A template whose actions don't exist yet is not a gallery entry: no card, no "Use" button, no setup
              // checklist — just its name and why it can't be used. It moves into the grid above the moment every
              // action id resolves (availableDesignTemplates), with no code change here.
              <section data-testid="templates-held-back">
                <SectionLabel className="mb-1">{t("templates.notAvailableYet")}</SectionLabel>
                <p className="mb-3 max-w-3xl text-sm text-med">{t("templates.actionsMissing")}</p>
                <ul className="flex flex-col gap-2">
                  {heldBack.map(({ template: tpl }) => {
                    const shown = templateText(t, "designTemplates", tpl);
                    return (
                      <li key={tpl.id} data-testid={`template-held-back-${tpl.id}`} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-line bg-app px-3 py-2">
                        <span className="font-medium text-hi">{shown.name}</span>
                        <span className="data text-xs text-muted uppercase">
                          {categoryLabel(tpl.category)} · {t.plural("flows.nodes", tpl.graph.nodes.length)}
                        </span>
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
  ai: AiStatusDto | undefined,
  conns: ReturnType<typeof useConnections>["data"],
): ReqState {
  if (provider === "http") return { ok: true, text: t("templates.req.builtIn") };
  if (provider === "ai") {
    // Template AI steps use the workspace default model (an AI connection the member may use).
    if (!ai) return { ok: false, text: t("templates.req.checking") };
    return ai.defaultRoute && ai.defaultUsable ? { ok: true, text: t("templates.req.aiAvailable") } : { ok: false, text: t("templates.req.aiNotConfigured") };
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
