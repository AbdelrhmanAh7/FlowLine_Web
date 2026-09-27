"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button, Card, EmptyState, Input, SectionLabel } from "@/components/ui";

const CATALOG = [
  { name: "Google Sheets", icon: "▦", kind: "Read & append rows" },
  { name: "Gmail", icon: "✉", kind: "Triggers & send email" },
  { name: "Slack", icon: "#", kind: "Messages & channels" },
  { name: "HubSpot", icon: "◉", kind: "CRM contacts & deals" },
  { name: "Zendesk", icon: "🎧", kind: "Tickets" },
  { name: "Airtable", icon: "▲", kind: "Records" },
  { name: "Snowflake", icon: "⬡", kind: "SQL" },
  { name: "GitHub", icon: "🐙", kind: "Issues" },
  { name: "Stripe", icon: "💳", kind: "Payments" },
  { name: "Notion", icon: "▮", kind: "Pages" },
  { name: "Postgres", icon: "🗄", kind: "Database" },
  { name: "Linear", icon: "📊", kind: "Issues" },
];

const REASON = "Connectors ship in Phase 2 (automation & integrations). Nothing can be connected yet.";

export default function IntegrationsPage() {
  const [q, setQ] = useState("");
  const items = useMemo(() => CATALOG.filter((c) => `${c.name} ${c.kind}`.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  return (
    <div className="flex flex-col">
      <PageHeader title="Integrations" sub="Connect apps to use them in flows." />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div role="status" className="rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-base text-med">
          <span className="font-semibold text-info">Not available yet.</span> This preview runs flows on local nodes only (trigger, JSON transform, condition, output).
          App connectors, OAuth tokens, and expired-token recovery arrive in Phase 2 — the list below is the planned catalog, not live connections.
        </div>

        <section>
          <SectionLabel className="mb-3">Connected · 0</SectionLabel>
          <EmptyState icon="⬡" title="No connections" body="When connectors are available, connected apps and their token health will appear here. An expired token will pause only the flows that use it." />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Planned catalog · {CATALOG.length}</SectionLabel>
            <label htmlFor="int-search" className="sr-only">
              Search integrations
            </label>
            <Input id="int-search" placeholder="⌕ Search integrations…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-full sm:w-64" />
          </div>
          {items.length === 0 ? (
            <EmptyState icon="⌕" title="No integrations match" body={`Nothing in the catalog matches “${q}”.`} action={<Button onClick={() => setQ("")}>Clear search</Button>} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {items.map((c) => (
                <li key={c.name}>
                  <Card className="flex items-center gap-3 px-4 py-3">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-lg">
                      {c.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold">{c.name}</p>
                      <p className="truncate text-sm text-muted">{c.kind}</p>
                    </div>
                    <Button size="sm" disabledReason={REASON} tooltipSide="top">
                      Connect
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
