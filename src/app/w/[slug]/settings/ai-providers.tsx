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
import { useAiOverview, usePickerModels, type AiConnectionDto, type AiOverviewDto, type AiPolicyMode, type AiProviderDto, type AiRouteRef, type PickerModelDto } from "@/lib/ai";
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
      <RoutingPolicy overview={d} />
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
        {(["core", "expansion"] as const).map((tier) => (
          <div key={tier} className="flex flex-col gap-2">
            <h4 className="text-sm font-medium text-med">{t(`aiHub.tier.${tier}`)}</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.providers
                .filter((p) => p.tier === tier && p.connectable)
                .map((p) => (
                  <ProviderCard key={p.id} p={p} count={active.filter((c) => c.provider === p.id).length} canManage={d.canManage} onConnect={() => setConnectTo(p)} />
                ))}
            </ul>
          </div>
        ))}
      </section>
      <NotOffered providers={d.providers.filter((p) => !p.connectable)} retired={d.retired ?? []} />
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

const MODES: AiPolicyMode[] = ["MANUAL", "FALLBACK", "FREE_ONLY", "LOW_COST"];
const toMicros = (v: string) => Math.round(Number(v) * 1_000_000);
const fromMicros = (m: number | undefined | null) => (m == null ? "" : String(m / 1_000_000));
const sameRef = (a: AiRouteRef, b: AiRouteRef) => a.connectionId === b.connectionId && a.modelId === b.modelId;

/** An ordered list of routes (fallback order / low-cost pool): add from the picker, reorder, remove. */
function RouteList({ id, label, routes, max, models, disabled, onChange }: { id: string; label: string; routes: AiRouteRef[]; max: number; models: PickerModelDto[]; disabled: boolean; onChange: (r: AiRouteRef[]) => void }) {
  const t = useT();
  const [pick, setPick] = useState<AiRouteRef | null>(null);
  const name = (r: AiRouteRef) => models.find((m) => sameRef(m, r))?.connectionLabel ?? t("aiHub.picker.selectedUnavailable");
  const move = (i: number, d: -1 | 1) => {
    const next = [...routes];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2" data-testid={id}>
      <p className="text-sm font-medium text-med">{label}</p>
      {routes.length === 0 ? (
        <p className="text-sm text-muted">{t("aiHub.policy.listEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {routes.map((r, i) => (
            <li key={`${r.connectionId}/${r.modelId}`} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-card px-2 py-1 text-sm">
              <span className="text-muted">{i + 1}.</span>
              <span dir="ltr" className="data text-hi">
                {r.modelId}
              </span>
              <span className="text-muted">· {name(r)}</span>
              <span className="ms-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabledReason={disabled ? t("aiHub.policy.readOnly") : i === 0 ? t("aiHub.policy.first") : null}>
                  {t("aiHub.policy.up")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabledReason={disabled ? t("aiHub.policy.readOnly") : i === routes.length - 1 ? t("aiHub.policy.last") : null}>
                  {t("aiHub.policy.down")}
                </Button>
                <Button size="sm" variant="danger-ghost" onClick={() => onChange(routes.filter((_, j) => j !== i))} disabledReason={disabled ? t("aiHub.policy.readOnly") : null}>
                  {t("aiHub.policy.remove")}
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {!disabled && routes.length < max && (
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">{t("aiHub.policy.addRoute")}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <ModelPicker id={`${id}-picker`} models={models} value={pick} onChange={setPick} />
            <div>
              <Button
                size="sm"
                onClick={() => {
                  if (pick && !routes.some((r) => sameRef(r, pick))) onChange([...routes, pick]);
                  setPick(null);
                }}
                disabledReason={!pick ? t("aiHub.policy.pickFirst") : routes.some((r) => sameRef(r, pick)) ? t("aiHub.policy.already") : null}
              >
                {t("aiHub.policy.addThis")}
              </Button>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Routing policy (owner, ai.manage): mode, ordered fallback routes, the low-cost pool + ceiling, the privacy rule,
 * the unknown-cost rule and Copilot's planning/repair routes. Everything is re-checked by the server at save and at
 * every call; nothing here claims a route is free or cheap unless its price is verified.
 */
function RoutingPolicy({ overview }: { overview: AiOverviewDto }) {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const models = usePickerModels(workspace.id, overview.canUse);
  const p = overview.policy;
  const initial = {
    mode: p?.mode ?? "MANUAL",
    allowUnknownCost: Boolean(p?.allowUnknownCost),
    fallbackRoutes: p?.fallbackRoutes ?? [],
    lowCostPool: p?.lowCostPool ?? [],
    ceilIn: fromMicros(p?.priceCeiling?.inputPerMTokMicros),
    ceilOut: fromMicros(p?.priceCeiling?.outputPerMTokMicros),
    requireNoTraining: Boolean(p?.requireNoTraining),
    planRoute: p?.copilot?.planRoute ?? null,
    repairRoute: p?.copilot?.repairRoute ?? null,
  };
  const [s, setS] = useState(initial);
  const set = (x: Partial<typeof s>) => setS((cur) => ({ ...cur, ...x }));
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const ro = !overview.canManage;
  const ceilingValid = s.ceilIn !== "" && s.ceilOut !== "" && Number(s.ceilIn) >= 0 && Number(s.ceilOut) >= 0;
  const save = useMutation({
    mutationFn: () =>
      api(`/api/workspaces/${workspace.id}/ai/policy`, {
        method: "PUT",
        json: {
          mode: s.mode,
          allowUnknownCost: s.allowUnknownCost,
          fallbackRoutes: s.fallbackRoutes,
          lowCostPool: s.lowCostPool,
          priceCeiling: ceilingValid ? { inputPerMTokMicros: toMicros(s.ceilIn), outputPerMTokMicros: toMicros(s.ceilOut) } : null,
          requireNoTraining: s.requireNoTraining,
          copilot: { planRoute: s.planRoute, repairRoute: s.repairRoute },
        },
      }),
    onSuccess: () => {
      toast(t("aiHub.policy.saved"), "success");
      void qc.invalidateQueries({ queryKey: ["ai", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.saveError")), "danger"),
  });
  const reason = ro
    ? denyReasonText(t, role as Role, "ai.manage")
    : !dirty
      ? t("settings.noChanges")
      : s.mode === "FALLBACK" && s.fallbackRoutes.length === 0
        ? t("aiHub.policy.needFallback")
        : s.mode === "LOW_COST" && !ceilingValid
          ? t("aiHub.policy.needCeiling")
          : null;
  const list = models.data ?? [];
  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="ai-policy">
      <div>
        <h3 className="text-base font-semibold">{t("aiHub.policy.routingTitle")}</h3>
        <p className="mt-1 text-sm text-med">{t("aiHub.policy.routingBody")}</p>
      </div>
      <fieldset className="flex flex-col gap-2" disabled={ro}>
        <legend className="mb-1 text-sm font-medium text-med">{t("aiHub.policy.mode")}</legend>
        {MODES.map((m) => (
          <label key={m} className="flex items-start gap-2 text-sm">
            <input type="radio" name="ai-policy-mode" className="mt-1" value={m} checked={s.mode === m} onChange={() => set({ mode: m })} />
            <span>
              <span className="font-medium text-hi">{t(`aiHub.policy.modes.${m}`)}</span>
              <span className="block text-muted">{t(`aiHub.policy.modeHelp.${m}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {(s.mode === "FALLBACK" || s.mode === "FREE_ONLY") && (
        <RouteList id="ai-policy-fallbacks" label={t("aiHub.policy.fallbacks")} routes={s.fallbackRoutes} max={5} models={list} disabled={ro} onChange={(r) => set({ fallbackRoutes: r })} />
      )}
      {s.mode === "LOW_COST" && (
        <>
          <RouteList id="ai-policy-pool" label={t("aiHub.policy.pool")} routes={s.lowCostPool} max={10} models={list} disabled={ro} onChange={(r) => set({ lowCostPool: r })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("aiHub.policy.ceilIn")} htmlFor="ai-ceil-in">
              <Input id="ai-ceil-in" type="number" min={0} step="0.01" dir="ltr" value={s.ceilIn} disabled={ro} onChange={(e) => set({ ceilIn: e.target.value })} />
            </Field>
            <Field label={t("aiHub.policy.ceilOut")} htmlFor="ai-ceil-out">
              <Input id="ai-ceil-out" type="number" min={0} step="0.01" dir="ltr" value={s.ceilOut} disabled={ro} onChange={(e) => set({ ceilOut: e.target.value })} />
            </Field>
          </div>
        </>
      )}
      <label className="flex items-start gap-2 text-sm text-med">
        <input type="checkbox" className="mt-1" checked={s.requireNoTraining} disabled={ro} onChange={(e) => set({ requireNoTraining: e.target.checked })} />
        <span>
          {t("aiHub.policy.noTraining")}
          <span className="block text-muted">{t("aiHub.policy.noTrainingHint")}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-med">
        <input type="checkbox" className="mt-1" checked={s.allowUnknownCost} disabled={ro} onChange={(e) => set({ allowUnknownCost: e.target.checked })} />
        <span>
          {t("aiHub.policy.allowUnknown")}
          <span className="block text-muted">{t("aiHub.policy.allowUnknownHint")}</span>
        </span>
      </label>
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <p className="text-sm font-medium text-med">{t("aiHub.policy.copilotTitle")}</p>
        <p className="text-sm text-muted">{t("aiHub.policy.copilotBody")}</p>
        <Field label={t("aiHub.policy.planRoute")} htmlFor="ai-copilot-plan">
          <ModelPicker id="ai-copilot-plan" models={list} value={s.planRoute} onChange={(v) => set({ planRoute: v })} allowDefault defaultLabel={t("aiHub.policy.useDefault")} disabled={ro} loading={overview.canUse && models.isPending} />
        </Field>
        <Field label={t("aiHub.policy.repairRoute")} htmlFor="ai-copilot-repair">
          <ModelPicker id="ai-copilot-repair" models={list} value={s.repairRoute} onChange={(v) => set({ repairRoute: v })} allowDefault defaultLabel={t("aiHub.policy.useDefault")} disabled={ro} loading={overview.canUse && models.isPending} />
        </Field>
      </div>
      <div>
        <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate()} disabledReason={reason}>
          {t("aiHub.policy.save")}
        </Button>
      </div>
    </Card>
  );
}

const VERDICT_TONE: Record<AiProviderDto["verdict"], Tone> = { SUITABLE: "success", SUITABLE_WITH_LIMITS: "info", UNSUITABLE: "muted", UNSUITABLE_PENDING_OWNER_REVIEW: "warning", DEFERRED: "muted" };

/** Providers that are documented but not offered (unsuitable terms, pending owner review, deferred) + retired services. */
function NotOffered({ providers, retired }: { providers: AiProviderDto[]; retired: AiOverviewDto["retired"] }) {
  const t = useT();
  if (!providers.length && !retired.length) return null;
  return (
    <section aria-labelledby="ai-not-offered" className="flex flex-col gap-2" data-testid="ai-not-offered">
      <h3 id="ai-not-offered" className="text-base font-semibold">
        {t("aiHub.notOffered.title")}
      </h3>
      <p className="text-sm text-med">{t("aiHub.notOffered.body")}</p>
      <ul className="flex flex-col gap-2">
        {providers.map((p) => (
          <li key={p.id} className="rounded-lg border border-line bg-surface p-3 text-sm" data-testid={`ai-provider-${p.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-hi">{p.name}</span>
              <StatusBadge tone={VERDICT_TONE[p.verdict]}>{t(`aiHub.verdict.${p.verdict}`)}</StatusBadge>
              <span className="text-muted">{t(`aiHub.tier.${p.tier}`)}</span>
            </div>
            <p className="mt-1 text-med">{p.verdictEvidence}</p>
            {p.notes && <p className="mt-1 text-muted">{p.notes}</p>}
            <p className="mt-1 flex flex-wrap gap-x-3">
              {p.sources.map((s) => (
                <a key={s.url} className="text-accent hover:underline" href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.label}
                </a>
              ))}
            </p>
            {p.verifiedAt && <p className="mt-1 text-xs text-muted">{t("aiHub.notOffered.checked", { date: p.verifiedAt })}</p>}
          </li>
        ))}
        {retired.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-surface p-3 text-sm" data-testid={`ai-retired-${r.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-hi">{r.name}</span>
              <StatusBadge tone="muted">{t("aiHub.verdict.RETIRED")}</StatusBadge>
            </div>
            <p className="mt-1 text-med">{r.evidence}</p>
            <p className="mt-1 flex flex-wrap gap-x-3">
              {r.sources.map((u) => (
                <a key={u} dir="ltr" className="text-accent hover:underline" href={u} target="_blank" rel="noreferrer noopener">
                  {new URL(u).hostname}
                </a>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Provider requirements in the UI language (registry text is the English fallback). */
function requirementText(t: ReturnType<typeof useT>, p: AiProviderDto) {
  const key = `aiHub.requirements.${p.id}`;
  return t.has(key) ? t(key as MessageKey) : p.requirements.join("; ");
}

/** Connection field label in the UI language (registry label is the English fallback). */
function fieldLabel(t: ReturnType<typeof useT>, providerId: string, f: { key: string; label: string }) {
  const specific = `aiHub.fields.${providerId}.${f.key}`;
  const generic = `aiHub.fields.${f.key}`;
  return t.has(specific) ? t(specific as MessageKey) : t.has(generic) ? t(generic as MessageKey) : f.label;
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
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs" data-testid="ai-provider-notes">
        <dt className="text-muted">{t("aiHub.providers.freeTier")}</dt>
        <dd className="text-med">
          {t(`aiHub.freeTier.${p.freeTier.type}`)} — {p.freeTier.note}
        </dd>
        <dt className="text-muted">{t("aiHub.providers.privacy")}</dt>
        <dd className="text-med">
          {t(`aiHub.training.${p.privacy.training}`)} — {p.privacy.note}
        </dd>
        {p.termsNotes && (
          <>
            <dt className="text-muted">{t("aiHub.providers.terms")}</dt>
            <dd className="text-med">{p.termsNotes}</dd>
          </>
        )}
      </dl>
      {p.verdict === "SUITABLE_WITH_LIMITS" && <p className="text-xs text-muted">{p.verdictEvidence}</p>}
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
      toast(r.ok ? t("aiHub.connection.testOk", { count: r.models ?? 0 }) : errorLine(t, { code: r.code ?? "", message: r.message ?? "" }), r.ok ? "success" : r.code === "AI_KEY_NOT_CHECKABLE" ? "warning" : "danger");
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
        {/* A saved key that nothing has proven yet is not shown as "Connected" (CXH-11). */}
        {conn.status === "CONNECTED" && !conn.keyVerified ? (
          <StatusBadge tone="warning">{t("aiHub.status.UNVERIFIED")}</StatusBadge>
        ) : (
          <StatusBadge tone={STATUS_TONE[conn.status]}>{t(`aiHub.status.${conn.status}`)}</StatusBadge>
        )}
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">{t("aiHub.connection.key")}</dt>
        <dd>
          <span dir={conn.keyHint ? "ltr" : undefined} className={conn.keyHint ? "data" : undefined} data-testid="ai-key-hint">
            {conn.keyHint ?? (conn.keySetAt ? t("aiHub.connection.keySet", { date: conn.keySetAt }) : "••••")}
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
      {(conn.keyCheck === "none" || conn.keyCheck === "public-listing") && !conn.keyVerified && (
        <p className="text-sm text-warning" data-testid="ai-key-unchecked">
          {t(conn.keyCheck === "public-listing" ? "aiHub.connection.keyUncheckedPublic" : "aiHub.connection.keyUnchecked")}
        </p>
      )}
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
  // Provider fields are NON-secret (region, workspace/account IDs, API choice); they may live in React state.
  const [settings, setSettings] = useState<Record<string, string>>(() => Object.fromEntries(provider.connectionFields.filter((f) => f.options?.length && f.required).map((f) => [f.key, f.options![0]!.value])));
  const [attest, setAttest] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);
  const submit = useKeySubmit();
  const missing = provider.connectionFields.find((f) => f.required && !settings[f.key]?.trim());
  const invalid = provider.connectionFields.find((f) => settings[f.key]?.trim() && !new RegExp(f.pattern).test(settings[f.key]!.trim()));
  const blocked = missing ? t("aiHub.dialog.fieldRequired", { field: fieldLabel(t, provider.id, missing) }) : invalid ? t("aiHub.dialog.fieldInvalid", { field: fieldLabel(t, provider.id, invalid) }) : provider.requiresPlanAttestation && !attest ? t("aiHub.dialog.attestFirst") : null;
  return (
    <Modal titleId="ai-connect-title" onClose={onClose}>
      <h2 id="ai-connect-title" className="text-lg font-semibold">
        {t("aiHub.dialog.connectTitle", { name: provider.name })}
      </h2>
      <p className="mt-1 text-sm text-med">{t(provider.keyCheck === "none" ? "aiHub.dialog.connectBodyNoCheck" : provider.keyCheck === "public-listing" ? "aiHub.dialog.connectBodyPublic" : provider.keyCheck === "key-endpoint" ? "aiHub.dialog.connectBodyKeyEndpoint" : "aiHub.dialog.connectBody")}</p>
      {provider.planWarning && (
        <p role="note" className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-med" data-testid="ai-plan-warning">
          {t.has(`aiHub.planWarning.${provider.id}` as MessageKey) ? t(`aiHub.planWarning.${provider.id}` as MessageKey) : provider.planWarning}
        </p>
      )}
      <form
        className="mt-4 flex flex-col gap-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit
            .run(
              keyRef,
              async (apiKey) => {
                const clean = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
                const r = await api<{ connection: AiConnectionDto }>(`/api/workspaces/${workspace.id}/ai/connections`, {
                  method: "POST",
                  json: { provider: provider.id, label, apiKey, settings: clean, ...(provider.requiresPlanAttestation ? { attestPayAsYouGo: attest } : {}) },
                });
                // Only a proven key is "connected"; an unverified one is saved, and says so (no fake success).
                if (r.connection.keyVerified) toast(t("aiHub.dialog.connected", { count: r.connection.models.discovered }), "success");
                else toast(t("aiHub.dialog.connectedUnverified", { count: r.connection.models.discovered }), "warning");
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
        {provider.connectionFields.map((f) => (
          <Field key={f.key} label={fieldLabel(t, provider.id, f)} htmlFor={`ai-field-${f.key}`} hint={f.help ? (t.has(`aiHub.fieldHelp.${provider.id}.${f.key}` as MessageKey) ? t(`aiHub.fieldHelp.${provider.id}.${f.key}` as MessageKey) : f.help) : undefined}>
            {f.options?.length ? (
              <select
                id={`ai-field-${f.key}`}
                className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none"
                value={settings[f.key] ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
              >
                {!f.required && <option value="">{t("aiHub.dialog.defaultOption")}</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input id={`ai-field-${f.key}`} dir="ltr" value={settings[f.key] ?? ""} maxLength={128} spellCheck={false} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))} />
            )}
          </Field>
        ))}
        {provider.requiresPlanAttestation && (
          <label className="flex items-start gap-2 text-sm" data-testid="ai-attest">
            <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} required />
            {t("aiHub.dialog.attest")}
          </label>
        )}
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
          <Button type="submit" variant="primary" loading={submit.pending} disabledReason={blocked}>
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
    queryFn: () => api<{ isDefault: boolean; flows: { id: string; name: string; published: boolean; via: "pinned" | "default" }[]; agents: { id: string; name: string; via?: "pinned" | "default" }[]; copilot: boolean; inPolicy?: boolean }>(`/api/workspaces/${workspace.id}/ai/connections/${conn.id}/affected`),
  });
  if (q.isPending) return <Skeleton className="h-16" />;
  if (!q.data) return null;
  const a = q.data;
  const nothing = !a.isDefault && a.flows.length === 0 && a.agents.length === 0 && !a.copilot && !a.inPolicy;
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
            <li key={ag.id}>{ag.via === "pinned" ? t("aiHub.affected.agentPinned", { name: ag.name }) : t("aiHub.affected.agent", { name: ag.name })}</li>
          ))}
          {a.copilot && <li>{t("aiHub.affected.copilot")}</li>}
          {a.inPolicy && <li>{t("aiHub.affected.policy")}</li>}
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
