"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Checkbox, Button, Card, Dialog, EmptyState, ErrorState, Field, InlineConfirmation, Input, SectionLabel, Skeleton, StatusBadge, cx } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import { actionTitle, connectFieldHelp, connectFieldLabel, providerCategory, providerDescription } from "@/i18n/integration-text";
import { dataText } from "@/i18n/workspace-text";
import { api } from "@/lib/api";
import { SIDE_EFFECT_LABEL, useCatalog, useConnections, type CatalogProvider, type ConnectionDto } from "@/lib/catalog";
import { useOnline } from "@/lib/hooks";
import { focusIsFree } from "@/components/ui/focus-return";

export default function IntegrationsPage() {
  return (
    <Suspense>
      <Integrations />
    </Suspense>
  );
}

function Integrations() {
  const t = useT();
  const { workspace, canEdit } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const catalog = useCatalog(workspace.id);
  const connections = useConnections(workspace.id);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ provider: CatalogProvider; reconnect?: ConnectionDto } | null>(null);

  // OAuth callback result.
  useEffect(() => {
    const r = params.get("oauth");
    if (!r) return;
    toast(
      r === "connected" ? t("integrations.oauth.connected") : r === "reconnected" ? t("integrations.oauth.reconnected") : t("integrations.oauth.failed", { message: oauthCodeText(t, params.get("code")) }),
      r === "error" ? "danger" : "success",
    );
    router.replace(`/w/${workspace.slug}/integrations`);
  }, [params, router, toast, workspace.slug, t]);

  const providers = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Search matches the shown (translated) text and the catalog's English alike.
    return (catalog.data?.providers ?? []).filter(
      (p) =>
        !s ||
        [p.name, p.category, providerCategory(t, p.category), ...p.actions.flatMap((a) => [a.title, actionTitle(t, a)])].join(" ").toLowerCase().includes(s),
    );
  }, [catalog.data, q, t]);
  const unhealthy = (connections.data ?? []).filter((c) => c.status !== "active");
  const byId = new Map((catalog.data?.providers ?? []).map((p) => [p.id, p]));
  const editReason = canEdit ? null : t("integrations.viewerReason");

  return (
    <div className="flex flex-col">
      <PageHeader title={t("integrations.title")} sub={t("integrations.sub")} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {unhealthy.map((c) => (
          <div key={c.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-border bg-warning-bg px-4 py-3">
            <span className="text-warning">⚠</span>
            <span className="min-w-0 flex-1 text-base">
              {t.rich("integrations.banner", {
                name: <strong>{byId.get(c.provider)?.name ?? c.provider}</strong>,
                account: <span className="text-med">({c.accountLabel})</span>,
                status: dataText(t, "integrations.statusWord", c.status),
                paused: c.flowCount ? t.plural("integrations.bannerPaused", c.flowCount) : "",
              })}
            </span>
            {byId.get(c.provider) && (
              <Button size="sm" variant="primary" disabledReason={editReason} onClick={() => setDialog({ provider: byId.get(c.provider)!, reconnect: c })}>
                {t("integrations.reconnectProvider", { name: byId.get(c.provider)!.name })}
              </Button>
            )}
          </div>
        ))}

        <section>
          <SectionLabel className="mb-3">{t("integrations.connectedLabel", { count: connections.data?.length ?? "…" })}</SectionLabel>
          {connections.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : connections.isError ? (
            <ErrorState title={t("integrations.loadConnections")} body={(connections.error as Error).message} onRetry={() => connections.refetch()} />
          ) : connections.data.length === 0 ? (
            <EmptyState icon="⬡" title={t("integrations.emptyTitle")} body={t("integrations.emptyBody")} />
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
            <SectionLabel>
              {catalog.data
                ? t("integrations.catalogLabel", { apps: t.plural("integrations.apps", catalog.data.count), actions: t.plural("integrations.actions", catalog.data.actionCount) })
                : t("integrations.catalogLoading")}
            </SectionLabel>
            <label htmlFor="int-search" className="sr-only">
              {t("integrations.searchLabel")}
            </label>
            <Input id="int-search" placeholder={t("integrations.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-full sm:w-64" />
          </div>
          {catalog.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : catalog.isError ? (
            <ErrorState title={t("integrations.loadCatalog")} body={(catalog.error as Error).message} onRetry={() => catalog.refetch()} />
          ) : providers.length === 0 ? (
            <EmptyState icon="⌕" title={t("integrations.noMatch")} action={<Button onClick={() => setQ("")}>{t("integrations.clearSearch")}</Button>} />
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
                        <p className="text-sm text-muted">{providerCategory(t, p.category)}</p>
                      </div>
                      <ConnectButton provider={p} disabledReason={editReason} onOpen={() => setDialog({ provider: p })} />
                    </div>
                    <p className="text-sm text-med">{providerDescription(t, p)}</p>
                    <Verification v={p.verification} />
                    <details className="text-sm">
                      <summary className="cursor-pointer text-med hover:text-hi">{t.plural("integrations.actions", p.actions.length)}</summary>
                      <ul className="mt-2 flex flex-col gap-1">
                        {p.actions.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                            <span className="text-hi">{actionTitle(t, a)}</span>
                            <span className="text-xs text-muted">{dataText(t, "sideEffect", a.sideEffect, SIDE_EFFECT_LABEL[a.sideEffect] ?? a.sideEffect)}</span>
                            {a.sensitive && <span className="text-xs text-warning">{t("integrations.needsApproval")}</span>}
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
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5 text-xs" aria-label={t("integrations.verification.aria")}>
      <span className="rounded-sm border border-line px-1.5 py-0.5 text-med">{t("integrations.verification.adapter")}</span>
      <span className={cx("rounded-sm border px-1.5 py-0.5", v.contractTested ? "border-line text-med" : "border-line text-muted")}>
        {v.contractTested ? t("integrations.verification.contractTested") : t("integrations.verification.notContractTested")}
      </span>
      <span
        title={v.liveNote}
        className={cx("rounded-sm border px-1.5 py-0.5", v.live === "verified" ? "border-success-border text-success" : v.live === "blocked" ? "border-warning-border text-warning" : "border-line text-muted")}
      >
        {v.live === "verified" ? t("integrations.verification.liveVerified") : v.live === "blocked" ? t("integrations.verification.liveBlocked") : t("integrations.verification.liveNotRun")}
      </span>
      {v.betaScope === "deferred" && (
        <span className="rounded-sm border border-line px-1.5 py-0.5 text-muted" title={t("integrations.verification.betaDeferredTitle")}>
          {t("integrations.verification.betaDeferred")}
        </span>
      )}
    </div>
  );
}

function ConnectButton({ provider, disabledReason, onOpen }: { provider: CatalogProvider; disabledReason: string | null; onOpen: () => void }) {
  const t = useT();
  const reason = disabledReason ?? (provider.authType === "oauth2" && !provider.oauthConfigured ? t("integrations.oauthNotConfigured", { name: provider.name }) : null);
  return (
    <Button id={`connect-${provider.id}`} size="sm" disabledReason={reason} tooltipSide="top" onClick={onOpen}>
      {t("integrations.connect")}
    </Button>
  );
}

function ConnectionCard({ c, provider, onReconnect }: { c: ConnectionDto; provider?: CatalogProvider; onReconnect: () => void }) {
  const t = useT();
  const { workspace, canEdit } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const returnAfterRemoval = () => document.getElementById(`connect-${c.provider}`) ?? document.getElementById("int-search");
  const remove = useMutation({
    mutationFn: () => api(`/api/connections/${c.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast(t("integrations.card.removed"), "info");
      const active = document.activeElement as HTMLElement | null;
      const ownConfirmation = active?.closest('[role="alertdialog"]')?.closest(`[data-testid="connection-${c.provider}"]`);
      if (focusIsFree(active) || ownConfirmation) returnAfterRemoval()?.focus();
      void qc.invalidateQueries({ queryKey: ["connections", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("integrations.card.removeError")), "danger"),
  });
  const tone = c.status === "active" ? "success" : c.status === "expired" ? "warning" : "danger";
  const viewerReason = canEdit ? null : t("integrations.viewerReason");
  return (
    <li className="motion-list-in">
      <Card className="flex h-full flex-col gap-2 p-4" data-testid={`connection-${c.provider}`}>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">
            {provider?.icon ?? "⬡"}
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-semibold">{c.label}</span>
          <StatusBadge tone={tone}>{dataText(t, "integrations.card.status", c.status, c.status[0]!.toUpperCase() + c.status.slice(1))}</StatusBadge>
        </div>
        <p className="data truncate text-sm text-muted">{t("integrations.card.meta", { account: c.accountLabel, flows: t.plural("integrations.card.flows", c.flowCount), ago: t.relative(c.lastUsedAt) })}</p>
        <p className="text-sm text-med" data-testid={`visibility-${c.provider}`}>
          {c.visibility === "private" ? t("integrations.card.private") : t("integrations.card.shared")}
        </p>
        {c.statusReason && <p className="text-sm text-warning">{c.statusReason}</p>}
        <div className="mt-auto flex gap-2 pt-1">
          <Button size="sm" onClick={onReconnect} disabledReason={viewerReason}>
            {t("integrations.card.reconnect")}
          </Button>
          <Button size="sm" variant="danger-ghost" aria-expanded={confirm} onClick={() => setConfirm(true)} disabledReason={viewerReason}>
            {t("integrations.card.remove")}
          </Button>
        </div>
          {confirm && (
            <InlineConfirmation label={t("integrations.card.confirmRemove")} onCancel={() => setConfirm(false)} busy={remove.isPending} returnFocusTo={returnAfterRemoval} className="mt-0 flex gap-2">
            <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t("integrations.card.confirmRemove")}
            </Button>
            <Button data-initial-focus size="sm" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            </InlineConfirmation>
          )}
      </Card>
    </li>
  );
}

/** The callback carries only a bounded outcome code (never a provider message): translate it. */
const OAUTH_CODES = ["OAUTH_STATE_INVALID", "OAUTH_EXCHANGE_FAILED", "OAUTH_APP_CHANGED", "OAUTH_ACCESS_REVOKED", "OAUTH_NOT_CONFIGURED", "DIFFERENT_ACCOUNT", "DIFFERENT_PROVIDER", "CONNECTION_REJECTED", "PROVIDER_UNREACHABLE", "EGRESS_BLOCKED", "NOT_FOUND", "PROVIDER_DENIED", "PROVIDER_ERROR", "NO_CODE", "UNKNOWN"] as const;
function oauthCodeText(t: ReturnType<typeof useT>, code: string | null) {
  const known = OAUTH_CODES.find((c) => c === code);
  return known ? t(`integrations.oauth.codes.${known}`) : t("integrations.oauth.unknownError");
}

interface AuthorizationApp {
  source: "platform" | "workspace";
  clientId: string | null;
  scopes: string[];
  configuredBy: string | null;
  verified: boolean | null;
}

function ConnectDialog({ provider, reconnect, onClose }: { provider: CatalogProvider; reconnect?: ConnectionDto; onClose: () => void }) {
  const t = useT();
  const { workspace } = useWorkspace();
  // Consent provenance: which OAuth app (Flowline's or this workspace's own) will ask for consent — shown BEFORE redirecting.
  const provenance = useQuery({
    queryKey: ["oauth-provenance", workspace.id, provider.id],
    queryFn: () => api<{ app: AuthorizationApp | null }>(`/api/workspaces/${workspace.id}/oauth-apps/provenance?provider=${encodeURIComponent(provider.id)}`),
    enabled: provider.authType === "oauth2",
  });
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const [label, setLabel] = useState("");
  const [priv, setPriv] = useState(false);
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
      return api(`/api/workspaces/${workspace.id}/connections`, { method: "POST", json: { provider: provider.id, label, fields, visibility: priv ? "private" : "workspace" } });
    },
    onSuccess: (r) => {
      if (r === null) return;
      toast(reconnect ? t("integrations.dialog.reconnected") : t("integrations.dialog.connected", { name: provider.name }), "success");
      void qc.invalidateQueries({ queryKey: ["connections", workspace.id] });
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(t, e, t("integrations.dialog.connectError"))),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        reconnect ? t("integrations.dialog.reconnectTitle", { name: provider.name }) : t("integrations.dialog.connectTitle", { name: provider.name })
      }
      closeLabel={t("integrations.dialog.close")}
      className="max-w-md"
    >
      <p className="mt-1 text-sm text-med">{reconnect ? t("integrations.dialog.reconnectBody", { account: reconnect.accountLabel }) : t("integrations.dialog.connectBody")}</p>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submit.mutate();
        }}
      >
        {!oauth && !reconnect && (
          <Field label={t("integrations.dialog.label")} htmlFor="conn-label">
            <Input id="conn-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder={t("integrations.dialog.labelPlaceholder", { name: provider.name })} />
          </Field>
        )}
        {!oauth && !reconnect && (
          <label className="flex items-start gap-2 text-base">
            <Checkbox className="mt-1" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
            <span>
              {t("integrations.dialog.private")}
              <span className="block text-sm text-muted">{t("integrations.dialog.privateHint")}</span>
            </span>
          </label>
        )}
        {!oauth &&
          provider.connectFields.map((f) => (
            <Field key={f.key} label={connectFieldLabel(t, provider.id, f)} htmlFor={`f-${f.key}`} hint={connectFieldHelp(t, provider.id, f)}>
              <Input
                id={`f-${f.key}`}
                type={f.secret ? "password" : "text"}
                dir="ltr"
                autoComplete="off"
                placeholder={f.placeholder}
                value={fields[f.key] ?? ""}
                onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                required
              />
            </Field>
          ))}
        {oauth && provenance.data?.app && (
          <p role="note" data-testid="oauth-provenance" className={provenance.data.app.source === "workspace" ? "rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-hi" : "text-sm text-med"}>
            {provenance.data.app.source === "workspace"
              ? t.rich("integrations.dialog.provenanceWorkspace", {
                  provider: provider.name,
                  clientId: <span dir="ltr" className="data break-all">{provenance.data.app.clientId}</span>,
                  by: <span dir="ltr">{provenance.data.app.configuredBy ?? t("integrations.dialog.provenanceUnknownOwner")}</span>,
                })
              : t.rich("integrations.dialog.provenancePlatform", { provider: provider.name, clientId: <span dir="ltr" className="data break-all">{provenance.data.app.clientId}</span> })}
            {provenance.data.app.source === "workspace" && provenance.data.app.verified === false && <span className="mt-1 block text-muted">{t("integrations.dialog.provenanceUnverified")}</span>}
          </p>
        )}
        {oauth && (
          <p className="text-sm text-med">
            {t.rich("integrations.dialog.oauthGrant", {
              name: provider.name,
              scopes: (
                <span dir="ltr" className="data">
                  {provider.actions
                    .flatMap((a) => a.requiredScopes)
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .join(", ")}
                </span>
              ),
            })}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("integrations.dialog.cancel")}</Button>
          <Button type="submit" variant="primary" loading={submit.isPending} disabledReason={online ? null : t("integrations.dialog.offline")}>
            {oauth ? t("integrations.dialog.continueTo", { name: provider.name }) : reconnect ? t("integrations.dialog.reconnect") : t("integrations.dialog.connect")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
