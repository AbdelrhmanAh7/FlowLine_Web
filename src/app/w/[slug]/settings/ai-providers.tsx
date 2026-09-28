"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ModelPicker } from "@/components/ai/model-picker";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Skeleton, StatusBadge, type Tone } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";
import { useAiOverview, usePickerModels, type AiConnectionDto, type AiOverviewDto, type AiProviderDto, type AiRouteRef } from "@/lib/ai";
import { api } from "@/lib/api";
import type { Role } from "@/lib/permissions";

const STATUS_TONE: Record<AiConnectionDto["status"], Tone> = { CONNECTED: "success", DEGRADED: "warning", REVOKED: "muted" };

/**
 * Settings → AI Providers. Workspace BYOK: the owner adds connections here (name + API key); keys are checked with a
 * metadata-only call, encrypted, and never shown again (only a masked hint). Connecting doesn't grant members:
 * each connection lists the roles that may use it.
 */
export function AiProviders() {
  const t = useT();
  const { workspace } = useWorkspace();
  const ov = useAiOverview(workspace.id);
  const [connectTo, setConnectTo] = useState<AiProviderDto | null>(null);
  if (ov.isPending) return <Skeleton className="h-64" />;
  if (ov.isError || !ov.data) return <ErrorState title={t("aiHub.loadError")} onRetry={() => void ov.refetch()} retrying={ov.isFetching} />;
  const d = ov.data;
  const active = d.connections.filter((c) => c.status !== "REVOKED");
  const revoked = d.connections.filter((c) => c.status === "REVOKED");
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("aiHub.title")}</h2>
        <p className="mt-1 text-base text-med">{t("aiHub.intro")}</p>
        {d.status.testDouble && (
          <p className="mt-3 rounded-md border border-line bg-card px-3 py-2 text-sm text-med" data-testid="ai-test-double">
            {t("aiHub.testDouble")}
          </p>
        )}
      </Card>
      {d.legacy.any && <LegacyBanner legacy={d.legacy} />}
      <DefaultRoute overview={d} />
      <CostPolicy overview={d} />
      <section aria-labelledby="ai-conns" className="flex flex-col gap-3">
        <h3 id="ai-conns" className="text-base font-semibold">
          {t("aiHub.connections.title")}
        </h3>
        {active.length === 0 && <p className="text-sm text-muted">{t("aiHub.connections.empty")}</p>}
        {active.map((c) => (
          <ConnectionCard key={c.id} conn={c} overview={d} />
        ))}
        {revoked.length > 0 && (
          <details className="text-sm text-med">
            <summary className="cursor-pointer">{t.plural("aiHub.connections.revoked", revoked.length)}</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {revoked.map((c) => (
                <li key={c.id}>
                  {c.label} · {c.providerName} · {t("aiHub.status.REVOKED")} {t.relative(c.revokedAt)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section aria-labelledby="ai-providers" className="flex flex-col gap-3">
        <h3 id="ai-providers" className="text-base font-semibold">
          {t("aiHub.providers.title")}
        </h3>
        {(["core", "expansion", "deferred"] as const).map((tier) => (
          <div key={tier} className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-med">{t(`aiHub.tier.${tier}`)}</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.providers
                .filter((p) => p.tier === tier)
                .map((p) => (
                  <ProviderCard key={p.id} p={p} count={active.filter((c) => c.provider === p.id).length} canManage={d.canManage} onConnect={() => setConnectTo(p)} />
                ))}
            </ul>
          </div>
        ))}
      </section>
      {connectTo && <ConnectDialog provider={connectTo} onClose={() => setConnectTo(null)} />}
    </div>
  );
}

function LegacyBanner({ legacy }: { legacy: AiOverviewDto["legacy"] }) {
  const t = useT();
  const { workspace } = useWorkspace();
  return (
    <div role="status" className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm" data-testid="ai-legacy-banner">
      <p className="font-medium text-warning">{t("aiHub.legacy.title")}</p>
      <p className="mt-1 text-med">{t("aiHub.legacy.body")}</p>
      <ul className="mt-2 list-disc ps-5 text-med">
        {legacy.workspaceDefault && (
          <li>
            {t("aiHub.legacy.workspaceDefault")}{" "}
            <span dir="ltr" className="data">
              {legacy.workspaceDefault.provider}
              {legacy.workspaceDefault.model ? ` / ${legacy.workspaceDefault.model}` : ""}
            </span>
          </li>
        )}
        {legacy.agents.map((a) => (
          <li key={a.id}>
            {t("aiHub.legacy.agent")}{" "}
            <Link className="text-accent hover:underline" href={`/w/${workspace.slug}/agents/${a.id}`}>
              {a.name}
            </Link>
          </li>
        ))}
        {legacy.flows.map((f) => (
          <li key={f.id}>
            {t("aiHub.legacy.flow")}{" "}
            <Link className="text-accent hover:underline" href={`/w/${workspace.slug}/flows/${f.id}`}>
              {f.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DefaultRoute({ overview }: { overview: AiOverviewDto }) {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const models = usePickerModels(workspace.id, overview.canUse);
  const [value, setValue] = useState<AiRouteRef | null>(overview.defaultRoute);
  const dirty = JSON.stringify(value) !== JSON.stringify(overview.defaultRoute);
  const save = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}/ai/default-route`, { method: "PUT", json: { route: value } }),
    onSuccess: () => {
      toast(t("aiHub.default.saved"), "success");
      void qc.invalidateQueries({ queryKey: ["ai", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.saveError")), "danger"),
  });
  const reason = !overview.canManage ? denyReasonText(t, role as Role, "ai.manage") : !dirty ? t("settings.noChanges") : null;
  return (
    <Card className="p-5" data-testid="ai-default-route">
      <h3 className="text-base font-semibold">{t("aiHub.default.title")}</h3>
      <p className="mt-1 text-sm text-med">{t("aiHub.default.body")}</p>
      {overview.status.defaultError && overview.defaultRoute && <p className="mt-2 text-sm text-warning">{errorLine(t, overview.status.defaultError)}</p>}
      <div className="mt-3">
        <ModelPicker
          id="ai-default-model"
          models={models.data ?? []}
          loading={overview.canUse && models.isPending}
          value={value}
          onChange={setValue}
          allowDefault
          defaultLabel={t("aiHub.default.none")}
          disabled={!overview.canManage}
        />
      </div>
      <div className="mt-3">
        <Button variant="primary" loading={save.isPending} disabledReason={reason} onClick={() => save.mutate()}>
          {t("aiHub.default.save")}
        </Button>
      </div>
    </Card>
  );
}

/** Owner policy: may calls whose price is unknown run while a spending cap applies? (default: no) */
function CostPolicy({ overview }: { overview: AiOverviewDto }) {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const initial = Boolean(overview.policy?.allowUnknownCost);
  const [allow, setAllow] = useState(initial);
  const save = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}/ai/policy`, { method: "PUT", json: { allowUnknownCost: allow } }),
    onSuccess: () => {
      toast(t("aiHub.policy.saved"), "success");
      void qc.invalidateQueries({ queryKey: ["ai", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.saveError")), "danger"),
  });
  return (
    <Card className="p-5">
      <h3 className="text-base font-semibold">{t("aiHub.policy.title")}</h3>
      <label className="mt-2 flex items-start gap-2 text-sm text-med">
        <input type="checkbox" className="mt-1" checked={allow} disabled={!overview.canManage} onChange={(e) => setAllow(e.target.checked)} />
        <span>
          {t("aiHub.policy.allowUnknown")}
          <span className="block text-muted">{t("aiHub.policy.allowUnknownHint")}</span>
        </span>
      </label>
      <div className="mt-3">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()} disabledReason={!overview.canManage ? denyReasonText(t, role as Role, "ai.manage") : allow === initial ? t("settings.noChanges") : null}>
          {t("aiHub.policy.save")}
        </Button>
      </div>
    </Card>
  );
}

/** Provider requirements in the UI language (registry text is the English fallback). */
function requirementText(t: ReturnType<typeof useT>, p: AiProviderDto) {
  const key = `aiHub.requirements.${p.id}`;
  return t.has(key) ? t(key as MessageKey) : p.requirements.join("; ");
}

function errorLine(t: ReturnType<typeof useT>, e: { code: string; message: string }) {
  const key = `aiHub.errors.${e.code}`;
  return t.has(key) ? t(key as MessageKey) : e.message;
}

function ProviderCard({ p, count, canManage, onConnect }: { p: AiProviderDto; count: number; canManage: boolean; onConnect: () => void }) {
  const t = useT();
  const { role } = useWorkspace();
  const statusTone: Tone = p.connectable ? "success" : p.status === "UNSUITABLE" ? "muted" : "info";
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3" data-testid={`ai-provider-${p.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-hi">{p.name}</span>
        <StatusBadge tone={statusTone}>{p.connectable ? t("aiHub.providerStatus.available") : p.status === "UNSUITABLE" ? t("aiHub.providerStatus.unsuitable") : t("aiHub.providerStatus.pending")}</StatusBadge>
      </div>
      <p className="text-sm text-muted">
        {p.routeKind === "gateway" ? t("aiHub.routeKind.gateway") : t("aiHub.routeKind.direct")} ·{" "}
        {p.connectable ? (p.contractVerified ? t("aiHub.verification.CONTRACT_VERIFIED") : t("aiHub.verification.IMPLEMENTED")) : t("aiHub.verification.none")}
        {count > 0 ? ` · ${t.plural("aiHub.providers.connections", count)}` : ""}
      </p>
      {p.connectable && p.requirements.length > 0 && <p className="text-sm text-med">{t("aiHub.providers.needs", { what: requirementText(t, p) })}</p>}
      {p.sources[0] && (
        <a className="text-sm text-accent hover:underline" href={p.sources.at(-1)!.url} target="_blank" rel="noreferrer noopener">
          {t("aiHub.providers.docs")}
        </a>
      )}
      <div>
        <Button size="sm" onClick={onConnect} disabledReason={!p.connectable ? t("aiHub.providers.notAvailable") : !canManage ? denyReasonText(t, role as Role, "ai.manage") : null}>
          {t("aiHub.providers.add")}
        </Button>
      </div>
    </li>
  );
}

function ConnectionCard({ conn, overview }: { conn: AiConnectionDto; overview: AiOverviewDto }) {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [roles, setRoles] = useState<string[]>(conn.useRoles);
  const [dialog, setDialog] = useState<"replace" | "disconnect" | "inference" | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["ai", workspace.id] });
    void qc.invalidateQueries({ queryKey: ["ai-models", workspace.id] });
  };
  const base = `/api/workspaces/${workspace.id}/ai/connections/${conn.id}`;
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; models?: number; code?: string; message?: string }>(`${base}/test`, { method: "POST", json: { kind: "metadata" } }),
    onSuccess: (r) => {
      toast(r.ok ? t("aiHub.connection.testOk", { count: r.models ?? 0 }) : errorLine(t, { code: r.code ?? "", message: r.message ?? "" }), r.ok ? "success" : "danger");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e), "danger"),
  });
  const refreshModels = useMutation({
    mutationFn: () => api<{ ok: boolean; count?: number; code?: string; message?: string }>(`${base}/models`, { method: "POST" }),
    onSuccess: (r) => {
      toast(r.ok ? t("aiHub.connection.refreshed", { count: r.count ?? 0 }) : errorLine(t, { code: r.code ?? "", message: r.message ?? "" }), r.ok ? "success" : "danger");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e), "danger"),
  });
  const saveRoles = useMutation({
    mutationFn: () => api(base, { method: "PATCH", json: { useRoles: roles } }),
    onSuccess: () => {
      toast(t("aiHub.connection.rolesSaved"), "success");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e), "danger"),
  });
  const manageReason = overview.canManage ? null : denyReasonText(t, role as Role, "ai.manage");
  const rolesDirty = [...roles].sort().join() !== [...conn.useRoles].sort().join();
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="ai-connection">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-hi">{conn.label}</p>
          <p className="text-sm text-muted">{conn.providerName}</p>
        </div>
        <StatusBadge tone={STATUS_TONE[conn.status]}>{t(`aiHub.status.${conn.status}`)}</StatusBadge>
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">{t("aiHub.connection.key")}</dt>
        <dd>
          <span dir="ltr" className="data" data-testid="ai-key-hint">
            {conn.keyHint ?? "••••"}
          </span>{" "}
          · {t("aiHub.connection.added", { when: t.relative(conn.createdAt) })}
        </dd>
        <dt className="text-muted">{t("aiHub.connection.verification")}</dt>
        <dd>{t(`aiHub.verification.${conn.verification}`)}</dd>
        <dt className="text-muted">{t("aiHub.connection.cost")}</dt>
        <dd>{t("aiHub.connection.costBody")}</dd>
        <dt className="text-muted">{t("aiHub.connection.models")}</dt>
        <dd data-testid="ai-model-counts">{t("aiHub.connection.modelCounts", { discovered: conn.models.discovered, confirmed: conn.models.accessConfirmed })}</dd>
        <dt className="text-muted">{t("aiHub.connection.lastTested")}</dt>
        <dd>{conn.lastTestedAt ? t.relative(conn.lastTestedAt) : t("common.never")}</dd>
      </dl>
      {conn.catalogStale && <p className="text-sm text-warning">{t("aiHub.connection.stale", { reason: conn.catalogError ?? "" })}</p>}
      {conn.lastError && <p className="text-sm text-danger">{errorLine(t, conn.lastError)}</p>}
      <fieldset className="flex flex-wrap items-center gap-3 text-sm" disabled={!overview.canManage}>
        <legend className="mb-1 text-muted">{t("aiHub.connection.useRoles")}</legend>
        {(["owner", "editor"] as const).map((r) => (
          <label key={r} className="flex items-center gap-1.5">
            <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles((s) => (e.target.checked ? [...s, r] : s.filter((x) => x !== r)))} />
            {t(`roles.${r}`)}
          </label>
        ))}
        <Button size="sm" loading={saveRoles.isPending} onClick={() => saveRoles.mutate()} disabledReason={manageReason ?? (!rolesDirty ? t("settings.noChanges") : roles.length === 0 ? t("aiHub.connection.rolesEmpty") : null)}>
          {t("aiHub.connection.saveRoles")}
        </Button>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={test.isPending} onClick={() => test.mutate()} disabledReason={manageReason}>
          {t("aiHub.connection.test")}
        </Button>
        <Button size="sm" loading={refreshModels.isPending} onClick={() => refreshModels.mutate()} disabledReason={manageReason}>
          {t("aiHub.connection.refresh")}
        </Button>
        <Button size="sm" onClick={() => setDialog("replace")} disabledReason={manageReason}>
          {t("aiHub.connection.replace")}
        </Button>
        <Button size="sm" onClick={() => setDialog("inference")} disabledReason={manageReason ?? (conn.models.discovered === 0 ? t("aiHub.connection.noModels") : null)}>
          {t("aiHub.connection.paidTest")}
        </Button>
        <Button size="sm" variant="danger-ghost" onClick={() => setDialog("disconnect")} disabledReason={manageReason}>
          {t("aiHub.connection.disconnect")}
        </Button>
      </div>
      {(dialog === "replace" || dialog === "disconnect") && <KeyChangeDialog conn={conn} mode={dialog} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === "inference" && <InferenceTestDialog conn={conn} onClose={() => setDialog(null)} onDone={refresh} />}
    </Card>
  );
}

function Modal({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label={t("aiHub.dialog.close")} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative max-h-[90vh] w-full max-w-md animate-fade-in overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-popover)]">
        {children}
      </div>
    </div>
  );
}

/**
 * The API key field is UNCONTROLLED: the key is read from the DOM only at submit time, sent once, and the field is
 * cleared immediately. It never enters React state, the TanStack Query/mutation cache (no `useMutation` variables),
 * retries, drafts, URLs or browser storage. Password managers are told not to capture it.
 */
function KeyInput({ id, inputRef }: { id: string; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <Input
      id={id}
      ref={inputRef}
      type="password"
      dir="ltr"
      name={`${id}-secret`}
      autoComplete="new-password"
      spellCheck={false}
      data-1p-ignore="true"
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      defaultValue=""
      required
    />
  );
}

function useKeySubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (inputRef: React.RefObject<HTMLInputElement | null>, send: (key: string) => Promise<unknown>, onError: (e: unknown) => string) => {
    const el = inputRef.current;
    const key = el?.value ?? "";
    if (el) el.value = ""; // cleared before the request, success or not
    setError(null);
    setPending(true);
    try {
      await send(key);
      return true;
    } catch (e) {
      setError(onError(e));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}

/** Add a connection: name + API key. */
function ConnectDialog({ provider, onClose }: { provider: AiProviderDto; onClose: () => void }) {
  const t = useT();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const keyRef = useRef<HTMLInputElement>(null);
  const submit = useKeySubmit();
  return (
    <Modal titleId="ai-connect-title" onClose={onClose}>
      <h2 id="ai-connect-title" className="text-lg font-semibold">
        {t("aiHub.dialog.connectTitle", { name: provider.name })}
      </h2>
      <p className="mt-1 text-sm text-med">{t("aiHub.dialog.connectBody")}</p>
      <form
        className="mt-4 flex flex-col gap-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit
            .run(
              keyRef,
              async (apiKey) => {
                const r = await api<{ connection: AiConnectionDto }>(`/api/workspaces/${workspace.id}/ai/connections`, { method: "POST", json: { provider: provider.id, label, apiKey } });
                toast(t("aiHub.dialog.connected", { count: r.connection.models.discovered }), "success");
              },
              (err) => apiErrorMessage(t, err, t("aiHub.dialog.connectError")),
            )
            .then((ok) => {
              if (!ok) return;
              void qc.invalidateQueries({ queryKey: ["ai", workspace.id] });
              void qc.invalidateQueries({ queryKey: ["ai-models", workspace.id] });
              onClose();
            });
        }}
      >
        <Field label={t("aiHub.dialog.name")} htmlFor="ai-conn-label">
          <Input id="ai-conn-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder={provider.name} />
        </Field>
        <Field label={t("aiHub.dialog.apiKey")} htmlFor="ai-conn-key" hint={t("aiHub.dialog.apiKeyHint")}>
          <KeyInput id="ai-conn-key" inputRef={keyRef} />
        </Field>
        {provider.requirements.length > 0 && <p className="text-sm text-muted">{t("aiHub.providers.needs", { what: requirementText(t, provider) })}</p>}
        {submit.error && (
          <p role="alert" className="text-sm text-danger">
            {submit.error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("aiHub.dialog.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={submit.pending}>
            {t("aiHub.dialog.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AffectedList({ conn }: { conn: AiConnectionDto }) {
  const t = useT();
  const { workspace } = useWorkspace();
  const q = useQuery({
    queryKey: ["ai-affected", conn.id],
    queryFn: () => api<{ isDefault: boolean; flows: { id: string; name: string; published: boolean; via: "pinned" | "default" }[]; agents: { id: string; name: string }[]; copilot: boolean }>(`/api/workspaces/${workspace.id}/ai/connections/${conn.id}/affected`),
  });
  if (q.isPending) return <Skeleton className="h-16" />;
  if (!q.data) return null;
  const a = q.data;
  const nothing = !a.isDefault && a.flows.length === 0;
  return (
    <div className="mt-3 rounded-md border border-line bg-card p-3 text-sm" data-testid="ai-affected">
      <p className="font-medium">{t("aiHub.affected.title")}</p>
      {nothing ? (
        <p className="mt-1 text-muted">{t("aiHub.affected.none")}</p>
      ) : (
        <ul className="mt-1 list-disc ps-5 text-med">
          {a.isDefault && <li>{t("aiHub.affected.default")}</li>}
          {a.flows.map((f) => (
            <li key={f.id}>
              {f.name} · {f.via === "pinned" ? t("aiHub.affected.pinned") : t("aiHub.affected.viaDefault")}
              {f.published ? ` · ${t("aiHub.affected.published")}` : ""}
            </li>
          ))}
          {a.agents.map((ag) => (
            <li key={ag.id}>{t("aiHub.affected.agent", { name: ag.name })}</li>
          ))}
          {a.copilot && <li>{t("aiHub.affected.copilot")}</li>}
        </ul>
      )}
    </div>
  );
}

function KeyChangeDialog({ conn, mode, onClose, onDone }: { conn: AiConnectionDto; mode: "replace" | "disconnect"; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { workspace } = useWorkspace();
  const toast = useToast();
  const keyRef = useRef<HTMLInputElement>(null);
  const submit = useKeySubmit();
  const base = `/api/workspaces/${workspace.id}/ai/connections/${conn.id}`;
  return (
    <Modal titleId="ai-key-title" onClose={onClose}>
      <h2 id="ai-key-title" className="text-lg font-semibold">
        {mode === "replace" ? t("aiHub.dialog.replaceTitle", { label: conn.label }) : t("aiHub.dialog.disconnectTitle", { label: conn.label })}
      </h2>
      <p className="mt-1 text-sm text-med">{mode === "replace" ? t("aiHub.dialog.replaceBody") : t("aiHub.dialog.disconnectBody")}</p>
      <AffectedList conn={conn} />
      <form
        className="mt-4 flex flex-col gap-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit
            .run(
              keyRef,
              (apiKey) => (mode === "replace" ? api(base, { method: "PATCH", json: { apiKey } }) : api(base, { method: "DELETE" })),
              (err) => apiErrorMessage(t, err),
            )
            .then((ok) => {
              if (!ok) return;
              toast(mode === "replace" ? t("aiHub.dialog.replaced") : t("aiHub.dialog.disconnected"), "success");
              onDone();
              onClose();
            });
        }}
      >
        {mode === "replace" && (
          <Field label={t("aiHub.dialog.newApiKey")} htmlFor="ai-new-key" hint={t("aiHub.dialog.apiKeyHint")}>
            <KeyInput id="ai-new-key" inputRef={keyRef} />
          </Field>
        )}
        {submit.error && (
          <p role="alert" className="text-sm text-danger">
            {submit.error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("aiHub.dialog.cancel")}
          </Button>
          <Button type="submit" variant={mode === "replace" ? "primary" : "danger"} loading={submit.pending}>
            {mode === "replace" ? t("aiHub.dialog.replaceConfirm") : t("aiHub.dialog.disconnectConfirm")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Explicit, disclosed, billable one-shot test. Never automatic. */
function InferenceTestDialog({ conn, onClose, onDone }: { conn: AiConnectionDto; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { workspace } = useWorkspace();
  const models = usePickerModels(workspace.id);
  const own = (models.data ?? []).filter((m) => m.connectionId === conn.id && m.lifecycle === "active");
  const [model, setModel] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => api<{ ok: boolean; code?: string; message?: string; usage?: { inputTokens: number; outputTokens: number } }>(`/api/workspaces/${workspace.id}/ai/connections/${conn.id}/test`, { method: "POST", json: { kind: "inference", modelId: model, confirm: true } }),
    onSuccess: (r) => {
      setResult(r.ok ? t("aiHub.paidTest.ok", { input: r.usage?.inputTokens ?? 0, output: r.usage?.outputTokens ?? 0 }) : errorLine(t, { code: r.code ?? "", message: r.message ?? "" }));
      onDone();
    },
    onError: (e) => setResult(apiErrorMessage(t, e)),
  });
  return (
    <Modal titleId="ai-paid-title" onClose={onClose}>
      <h2 id="ai-paid-title" className="text-lg font-semibold">
        {t("aiHub.paidTest.title")}
      </h2>
      <p className="mt-1 text-sm text-med">{t("aiHub.paidTest.body")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <Field label={t("aiHub.paidTest.model")} htmlFor="ai-paid-model">
          <select id="ai-paid-model" dir="ltr" value={model} onChange={(e) => setModel(e.target.value)} className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-hi">
            <option value="">—</option>
            {own.map((m) => (
              <option key={m.modelId} value={m.modelId}>
                {m.modelId}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          {t("aiHub.paidTest.confirm")}
        </label>
        {result && (
          <p role="status" className="text-sm text-med">
            {result}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("aiHub.dialog.close")}
          </Button>
          <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()} disabledReason={!model ? t("aiHub.paidTest.pickModel") : !confirm ? t("aiHub.paidTest.needConfirm") : null}>
            {t("aiHub.paidTest.send")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
