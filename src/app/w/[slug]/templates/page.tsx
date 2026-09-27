"use client";

import { useMemo, useState } from "react";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { DESIGN_TEMPLATES, type DesignTemplate } from "@/engine/design-templates";
import { useCatalog, useConnections } from "@/lib/catalog";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, Card, EmptyState, Input, SectionLabel, cx } from "@/components/ui";
import { useOnline } from "@/lib/hooks";
import { topoOrder } from "@/engine/validate";
import { useCreateFlow } from "../flows/dashboard";

const CATEGORIES = ["All", "Sales", "Support", "Marketing", "Data ops", "Finance", "Engineering"] as const;

export default function TemplatesPage() {
  const { canEdit, workspace } = useWorkspace();
  const catalog = useCatalog();
  const connections = useConnections(workspace.id);
  const online = useOnline();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [q, setQ] = useState("");
  const create = useCreateFlow();
  const match = (t: { name: string; description: string; category: string }) =>
    (cat === "All" || t.category === cat) && `${t.name} ${t.description}`.toLowerCase().includes(q.trim().toLowerCase());
  const local = useMemo(() => LOCAL_TEMPLATES.filter(match), [cat, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const planned = useMemo(() => DESIGN_TEMPLATES.filter(match), [cat, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const useReason = !canEdit ? "Viewers can't create flows" : !online ? "You're offline — reconnect to create flows" : null;

  return (
    <div className="flex flex-col">
      <PageHeader title="Templates" sub="Each card previews its node chain — using one drops you into the canvas." />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Filter templates by category" className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
                className={cx("h-7 rounded-md px-2.5 text-base transition-colors duration-[var(--dur-tab)]", cat === c ? "bg-elevated text-hi" : "text-med hover:text-hi")}
              >
                {c}
              </button>
            ))}
          </div>
          <label htmlFor="tpl-search" className="sr-only">
            Search templates
          </label>
          <Input id="tpl-search" placeholder="⌕ Search templates…" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto h-8 w-full sm:w-64" />
        </div>

        {local.length === 0 && planned.length === 0 ? (
          <EmptyState
            icon="⌕"
            title="No templates match these filters"
            action={
              <Button
                onClick={() => {
                  setCat("All");
                  setQ("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            {local.length > 0 && (
              <section>
                <SectionLabel className="mb-3">Ready to run · local nodes</SectionLabel>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {local.map((t) => {
                    const chain = topoOrder(t.graph).slice(0, 4);
                    return (
                      <li key={t.id}>
                        <Card className="flex h-full flex-col gap-3 p-4">
                          <Chain items={chain.map((n) => `${NODE_DEFINITIONS[n.type].icon} ${n.data.label}`)} />
                          <div className="flex-1">
                            <p className="text-lg font-semibold">{t.name}</p>
                            <p className="mt-1 text-base text-med">{t.description}</p>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="data text-xs text-muted uppercase">
                              {t.category} · {t.graph.nodes.length} nodes
                            </span>
                            <Button size="sm" variant="primary" disabledReason={useReason} loading={create.isPending && create.variables?.templateId === t.id} onClick={() => create.mutate({ templateId: t.id })}>
                              Use template
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
                <SectionLabel className="mb-3">Connected apps · set up after creating</SectionLabel>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {planned.map((t) => (
                    <li key={t.id}>
                      <Card className="flex h-full flex-col gap-3 p-4" data-testid={`template-${t.id}`}>
                        <Chain items={topoOrder(t.graph).slice(0, 4).map((n) => `${NODE_DEFINITIONS[n.type].icon} ${n.data.label}`)} />
                        <div className="flex-1">
                          <p className="text-lg font-semibold">{t.name}</p>
                          <p className="mt-1 text-base text-med">{t.description}</p>
                        </div>
                        <Requirements t={t} status={(p) => reqStatus(p, catalog.data, connections.data)} />
                        <details className="text-sm text-med">
                          <summary className="cursor-pointer text-hi">Setup ({t.setup.length} steps)</summary>
                          <ol className="mt-2 list-decimal space-y-1 pl-5">
                            {t.setup.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ol>
                        </details>
                        <div className="flex items-center justify-between gap-2">
                          <span className="data text-xs text-muted uppercase">
                            {t.category} · {t.graph.nodes.length} nodes
                          </span>
                          <Button size="sm" variant="primary" disabledReason={useReason} loading={create.isPending && create.variables?.templateId === t.id} onClick={() => create.mutate({ templateId: t.id })}>
                            Use template
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
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
          {i < items.length - 1 && <span aria-hidden className="text-muted">→</span>}
        </span>
      ))}
    </div>
  );
}

type ReqState = { ok: boolean; text: string };
function reqStatus(
  provider: string,
  catalog: ReturnType<typeof useCatalog>["data"],
  conns: ReturnType<typeof useConnections>["data"],
): ReqState {
  if (provider === "http") return { ok: true, text: "Built in" };
  if (provider === "ai") {
    if (!catalog) return { ok: false, text: "Checking…" };
    return catalog.runtime.ai.available ? { ok: true, text: "AI available" } : { ok: false, text: catalog.runtime.ai.reason ?? "AI not configured" };
  }
  if (!conns) return { ok: false, text: "Checking…" };
  const mine = conns.filter((c) => c.provider === provider);
  if (mine.some((c) => c.status === "active")) return { ok: true, text: "Connected" };
  if (mine.length > 0) return { ok: false, text: "Needs reconnect" };
  return { ok: false, text: "Not connected" };
}

function Requirements({ t, status }: { t: DesignTemplate; status: (provider: string) => ReqState }) {
  return (
    <ul aria-label="Requirements" className="flex flex-col gap-1">
      {t.requires.map((r) => {
        const st = status(r.provider);
        return (
          <li key={r.provider} className="flex items-center justify-between gap-2 text-sm" title={r.purpose}>
            <span className="truncate">{r.purpose}</span>
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
