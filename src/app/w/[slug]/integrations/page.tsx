"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, ErrorState, Field, Input, SectionLabel, Skeleton, StatusBadge, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { SIDE_EFFECT_LABEL, useCatalog, useConnections, type CatalogProvider, type ConnectionDto } from "@/lib/catalog";
import { timeAgo } from "@/lib/format";
import { useOnline } from "@/lib/hooks";

export default function IntegrationsPage() {
  return (
    <Suspense>
      <Integrations />
    </Suspense>
  );
}

function Integrations() {
  const { workspace, canEdit } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const catalog = useCatalog();
  const connections = useConnections(workspace.id);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ provider: CatalogProvider; reconnect?: ConnectionDto } | null>(null);

  // OAuth callback result.
  useEffect(() => {
    const r = params.get("oauth");
    if (!r) return;
    toast(r === "connected" ? "Connected" : r === "reconnected" ? "Reconnected — paused flows resumed (nothing ran automatically)" : `Connection failed: ${params.get("message") ?? "unknown error"}`, r === "error" ? "danger" : "success");
    router.replace(`/w/${workspace.slug}/integrations`);
  }, [params, router, toast, workspace.slug]);

  const providers = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (catalog.data?.providers ?? []).filter((p) => !s || `${p.name} ${p.category} ${p.actions.map((a) => a.title).join(" ")}`.toLowerCase().includes(s));
  }, [catalog.data, q]);
  const unhealthy = (connections.data ?? []).filter((c) => c.status !== "active");
  const byId = new Map((catalog.data?.providers ?? []).map((p) => [p.id, p]));
  const editReason = canEdit ? null : "Viewers can't change connections";

  return (
    <div className="flex flex-col">
      <PageHeader title="Integrations" sub="Connect apps with your own test accounts. Credentials are encrypted and never shown again." />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {unhealthy.map((c) => (
          <div key={c.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
            <span className="text-warning">⚠</span>
            <span className="min-w-0 flex-1 text-base">
              Your <strong>{byId.get(c.provider)?.name ?? c.provider}</strong> connection <span className="text-med">({c.accountLabel})</span> is {c.status}
              {c.flowCount ? ` — ${c.flowCount} flow${c.flowCount > 1 ? "s are" : " is"} paused` : ""}. Other flows keep running.
            </span>
            {byId.get(c.provider) && (
              <Button size="sm" variant="primary" disabledReason={editReason} onClick={() => setDialog({ provider: byId.get(c.provider)!, reconnect: c })}>
                Reconnect {byId.get(c.provider)!.name}
              </Button>
            )}
          </div>
        ))}

        <section>
          <SectionLabel className="mb-3">Connected · {connections.data?.length ?? "…"}</SectionLabel>
          {connections.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : connections.isError ? (
            <ErrorState title="Couldn't load connections" body={(connections.error as Error).message} onRetry={() => connections.refetch()} />
          ) : connections.data.length === 0 ? (
            <EmptyState icon="⬡" title="No connections yet" body="Connect an app from the catalog below. Use sandbox or test accounts while building." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {connections.data.map((c) => (
                <ConnectionCard key={c.id} c={c} provider={byId.get(c.provider)} onReconnect={() => byId.get(c.provider) && setDialog({ provider: byId.get(c.provider)!, reconnect: c })} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Catalog · {catalog.data ? `${catalog.data.count} apps · ${catalog.data.actionCount} actions` : "…"}</SectionLabel>
            <label htmlFor="int-search" className="sr-only">
              Search integrations
            </label>
            <Input id="int-search" placeholder="⌕ Search integrations…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-full sm:w-64" />
          </div>
          {catalog.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : catalog.isError ? (
            <ErrorState title="Couldn't load the catalog" body={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />
          ) : providers.length === 0 ? (
            <EmptyState icon="⌕" title="No integrations match" action={<Button onClick={() => setQ("")}>Clear search</Button>} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {providers.map((p) => (
                <li key={p.id}>
                  <Card className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-lg">
                        {p.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold">{p.name}</p>
                        <p className="text-sm text-muted">{p.category}</p>
                      </div>
                      <ConnectButton provider={p} disabledReason={editReason} onOpen={() => setDialog({ provider: p })} />
                    </div>
                    <p className="text-sm text-med">{p.description}</p>
                    <Verification v={p.verification} />
                    <details className="text-sm">
                      <summary className="cursor-pointer text-med hover:text-hi">{p.actions.length} actions</summary>
                      <ul className="mt-2 flex flex-col gap-1">
                        {p.actions.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                            <span className="text-hi">{a.title}</span>
                            <span className="text-xs text-muted">{SIDE_EFFECT_LABEL[a.sideEffect]}</span>
                            {a.sensitive && <span className="text-xs text-warning">needs approval</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {dialog && <ConnectDialog provider={dialog.provider} reconnect={dialog.reconnect} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Verification({ v }: { v: CatalogProvider["verification"] }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs" aria-label="Verification level">
      <span className="rounded-sm border border-line px-1.5 py-0.5 text-med">✓ adapter implemented</span>
      <span className={cx("rounded-sm border px-1.5 py-0.5", v.contractTested ? "border-line text-med" : "border-line text-muted")}>{v.contractTested ? "✓ contract tested" : "not contract tested"}</span>
      <span
        title={v.liveNote}
        className={cx("rounded-sm border px-1.5 py-0.5", v.live === "verified" ? "border-success/40 text-success" : v.live === "blocked" ? "border-warning/40 text-warning" : "border-line text-muted")}
      >
        {v.live === "verified" ? "✓ live verified" : v.live === "blocked" ? "live: blocked" : "live: not run"}
      </span>
    </div>
  );
}

function ConnectButton({ provider, disabledReason, onOpen }: { provider: CatalogProvider; disabledReason: string | null; onOpen: () => void }) {
  const reason = disabledReason ?? (provider.authType === "oauth2" && !provider.oauthConfigured ? `${provider.name} uses OAuth, and no OAuth app is configured on this server. An administrator must set its client ID/secret.` : null);
  return (
    <Button size="sm" disabledReason={reason} tooltipSide="top" onClick={onOpen}>
      Connect
    </Button>
  );
}

function ConnectionCard({ c, provider, onReconnect }: { c: ConnectionDto; provider?: CatalogProvider; onReconnect: () => void }) {
  const { workspace, canEdit } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/api/connections/${c.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Connection removed. Flows that used it are paused.", "info");
      void qc.invalidateQueries({ queryKey: ["connections", workspace.id] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't remove", "danger"),
  });
  const tone = c.status === "active" ? "success" : c.status === "expired" ? "warning" : "danger";
  return (
    <li>
      <Card className="flex h-full flex-col gap-2 p-4" data-testid={`connection-${c.provider}`}>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">{provider?.icon ?? "⬡"}</span>
          <span className="min-w-0 flex-1 truncate text-base font-semibold">{c.label}</span>
          <StatusBadge tone={tone}>{c.status === "active" ? "Connected" : c.status[0]!.toUpperCase() + c.status.slice(1)}</StatusBadge>
        </div>
        <p className="data truncate text-sm text-muted">
          {c.accountLabel} · {c.flowCount} flow{c.flowCount === 1 ? "" : "s"} · used {timeAgo(c.lastUsedAt)}
        </p>
        {c.statusReason && <p className="text-sm text-warning">{c.statusReason}</p>}
        <div className="mt-auto flex gap-2 pt-1">
          <Button size="sm" onClick={onReconnect} disabledReason={canEdit ? null : "Viewers can't change connections"}>
            Reconnect
          </Button>
          {confirm ? (
            <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Confirm remove
            </Button>
          ) : (
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirm(true)} disabledReason={canEdit ? null : "Viewers can't change connections"}>
              Remove
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

function ConnectDialog({ provider, reconnect, onClose }: { provider: CatalogProvider; reconnect?: ConnectionDto; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [label, setLabel] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const oauth = provider.authType === "oauth2";

  const submit = useMutation({
    mutationFn: async () => {
      if (oauth) {
        const r = await api<{ url: string }>("/api/oauth/start", {
          method: "POST",
          json: { workspaceId: workspace.id, provider: provider.id, connectionId: reconnect?.id, redirectAfter: `/w/${workspace.slug}/integrations` },
        });
        window.location.assign(r.url);
        return null;
      }
      if (reconnect) return api(`/api/connections/${reconnect.id}`, { method: "PATCH", json: { fields } });
      return api(`/api/workspaces/${workspace.id}/connections`, { method: "POST", json: { provider: provider.id, label, fields } });
    },
    onSuccess: (r) => {
      if (r === null) return;
      toast(reconnect ? "Reconnected — paused flows resumed; nothing ran automatically" : `${provider.name} connected`, "success");
      void qc.invalidateQueries({ queryKey: ["connections", workspace.id] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't connect"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close dialog" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="connect-title" className="relative w-full max-w-md animate-fade-in rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-popover)]">
        <h2 id="connect-title" className="text-lg font-semibold">
          {reconnect ? `Reconnect ${provider.name}` : `Connect ${provider.name}`}
        </h2>
        <p className="mt-1 text-sm text-med">
          {reconnect
            ? `Use credentials for the same account (${reconnect.accountLabel}). A different account is refused. Paused flows resume; nothing runs automatically.`
            : "Use a dedicated test/sandbox account. Credentials are verified with the provider, encrypted, and never shown again."}
        </p>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submit.mutate();
          }}
        >
          {!oauth && !reconnect && (
            <Field label="Label (optional)" htmlFor="conn-label">
              <Input id="conn-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder={`${provider.name} (test)`} />
            </Field>
          )}
          {!oauth &&
            provider.connectFields.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`f-${f.key}`} hint={f.help}>
                <Input
                  id={`f-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={f.placeholder}
                  value={fields[f.key] ?? ""}
                  onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                  required
                />
              </Field>
            ))}
          {oauth && <p className="text-sm text-med">You&apos;ll sign in at {provider.name} and grant: {provider.actions.flatMap((a) => a.requiredScopes).filter((v, i, arr) => arr.indexOf(v) === i).join(", ")}.</p>}
          {error && (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={submit.isPending} disabledReason={online ? null : "You're offline"}>
              {oauth ? `Continue to ${provider.name}` : reconnect ? "Reconnect" : "Connect"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
