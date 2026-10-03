"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Skeleton, StatusBadge, UsageBar, cx } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import { dataText } from "@/i18n/workspace-text";
import { api } from "@/lib/api";

interface PlanEntitlements {
  maxMonthlyExecutions: number | null;
  monthlyUsageCapMicros: number | null;
  maxConcurrentRuns: number;
}
interface BillingPlanView {
  id: string;
  name: string;
  providerPriceId: string;
  displayPrice?: { amountMinor: number; currency: string; interval: string };
  trialDays?: number;
  entitlements: PlanEntitlements;
}
interface BillingState {
  configured: boolean;
  provider: string | null;
  providerMode: "test" | "sandbox" | "live" | null;
  plans: BillingPlanView[];
  freePlanId: string | null;
  account: {
    provider: string;
    customerId: string;
    subscriptionId: string | null;
    planId: string | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
  } | null;
  planInForce: string | null;
  entitlements: PlanEntitlements | null;
  usage: { periodStart: string; costMicros: number; executions: number };
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "info"> = {
  active: "success",
  trialing: "info",
  past_due: "danger",
  paused: "muted",
  canceled: "muted",
  incomplete: "warning",
  none: "muted",
};

function fmtMoney(amountMinor: number, currency: string) {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}
function fmtMicros(micros: number, currency = "USD") {
  return `${currency} ${(micros / 1_000_000).toFixed(4)}`;
}

/** "Plan & billing" settings tab: plans from configuration, real subscription state, settled usage only. */
export function BillingPlan() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const toast = useToast();
  const isOwner = role === "owner";
  const canView = role === "owner" || role === "editor";
  const manageReason = (extra: string | null) => (!isOwner ? t("settings.billing.ownerOnly") : extra);
  const fmtDate = (iso: string | null) => (iso ? t.date(iso, { year: "numeric", month: "short", day: "numeric" }) : "—");

  const q = useQuery({
    queryKey: ["billing", workspace.id],
    queryFn: () => api<BillingState>(`/api/workspaces/${workspace.id}/billing`),
    enabled: canView,
  });

  const invalidate = () => q.refetch();
  const onError = (e: unknown) => toast(apiErrorMessage(t, e, t("settings.billing.requestFailed")), "danger");

  const checkout = useMutation({
    mutationFn: (planId: string) => api<{ url: string }>(`/api/workspaces/${workspace.id}/billing/checkout`, { method: "POST", json: { planId } }),
    onSuccess: (d) => {
      window.location.href = d.url;
    },
    onError,
  });
  const change = useMutation({
    mutationFn: (planId: string) => api(`/api/workspaces/${workspace.id}/billing/change`, { method: "POST", json: { planId } }),
    onSuccess: () => {
      toast(t("settings.billing.changeRequested"), "success");
      void invalidate();
    },
    onError,
  });
  const cancelM = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}/billing/cancel`, { method: "POST", json: { atPeriodEnd: true } }),
    onSuccess: () => {
      toast(t("settings.billing.cancelRequested"), "success");
      void invalidate();
    },
    onError,
  });

  if (!canView) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("settings.billing.title")}</h2>
        <p className="mt-1 text-base text-med">{t("settings.billing.viewOnly")}</p>
      </Card>
    );
  }

  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState title={t("settings.billing.loadError")} body={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;

  if (!d.configured) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("settings.billing.title")}</h2>
        <p className="mt-1 text-base text-med">{t("settings.billing.notConfigured")}</p>
        <p className="mt-3 text-sm text-muted">{t("settings.billing.providerCharges")}</p>
      </Card>
    );
  }

  const account = d.account;
  const subscribed = account?.subscriptionId != null && (account.status === "active" || account.status === "trialing" || account.status === "past_due");
  const currentPlan = d.plans.find((p) => p.id === d.planInForce);
  const planIndex = (id: string | null) => d.plans.findIndex((p) => p.id === id);
  const busy = checkout.isPending || change.isPending || cancelM.isPending;
  const providerName = d.provider ? d.provider[0]!.toUpperCase() + d.provider.slice(1) : null;
  const modeLabel = d.providerMode ? t(`settings.billing.mode.${d.providerMode}`) : null;
  const modeTitle = d.providerMode === "test" || d.providerMode === "sandbox" ? t(`settings.billing.modeTitle.${d.providerMode}`) : undefined;
  const status = account?.status ?? "none";

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{t("settings.billing.title")}</h2>
          {d.providerMode && (
            <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium tracking-[0.4px] text-warning uppercase" title={modeTitle}>
              {providerName ? `${providerName} · ${modeLabel}` : modeLabel}
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-med">{t("settings.billing.providerCharges")}</p>

        {account?.status === "past_due" && (
          <div role="alert" className="mt-4 rounded-xl border border-danger-border bg-danger-bg p-4">
            <p className="font-semibold text-danger">{t("settings.billing.pastDueTitle")}</p>
            <p className="mt-1 text-base text-med">{t("settings.billing.pastDueBody")}</p>
          </div>
        )}

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-base sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <dt className="text-muted">{t("settings.billing.currentPlan")}</dt>
            <dd className="font-medium">{currentPlan?.name ?? (d.planInForce ?? "—")}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted">{t("settings.billing.statusLabel")}</dt>
            <dd>
              <StatusBadge tone={STATUS_TONE[status] ?? "muted"}>{dataText(t, "settings.billing.status", status, status.replace("_", " "))}</StatusBadge>
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted">{account?.cancelAtPeriodEnd ? t("settings.billing.ends") : t("settings.billing.renews")}</dt>
            <dd className="data">{fmtDate(account?.currentPeriodEnd ?? null)}</dd>
          </div>
          {account?.trialEnd && (
            <div className="flex items-center gap-2">
              <dt className="text-muted">{t("settings.billing.trialEnds")}</dt>
              <dd className="data">{fmtDate(account.trialEnd)}</dd>
            </div>
          )}
        </dl>
        {account?.cancelAtPeriodEnd && <p className="mt-3 text-sm text-warning">{t("settings.billing.cancelScheduled", { date: fmtDate(account.currentPeriodEnd) })}</p>}
        {subscribed && !account.cancelAtPeriodEnd && (
          <div className="mt-4 border-t border-line pt-4">
            <Button variant="danger-ghost" loading={cancelM.isPending} disabled={busy} disabledReason={manageReason(null)} onClick={() => cancelM.mutate()}>
              {t("settings.billing.cancelAtEnd")}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold">{t("settings.billing.plans")}</h3>
        <p className="mt-1 text-sm text-muted">{t("settings.billing.plansBody")}</p>
        <ul className="mt-4 flex flex-col gap-3">
          {d.plans.map((p) => {
            const isCurrent = p.id === d.planInForce;
            const direction = planIndex(p.id) > planIndex(d.planInForce) ? "upgrade" : "downgrade";
            const needsCheckout = !subscribed && p.id !== d.freePlanId;
            const e = p.entitlements;
            return (
              <li key={p.id} className={cx("motion-list-in flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-4", isCurrent ? "border-accent-border" : "border-line")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {isCurrent && <span className="rounded-md border border-line px-1.5 py-0.5 text-xs text-accent-text">{t("settings.billing.current")}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {p.displayPrice
                      ? t("settings.billing.price", {
                          price: fmtMoney(p.displayPrice.amountMinor, p.displayPrice.currency),
                          interval: dataText(t, "settings.billing.interval", p.displayPrice.interval),
                        })
                      : t("settings.billing.noPrice")}
                    {p.trialDays ? t("settings.billing.trial", { days: p.trialDays }) : ""}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {t("settings.billing.planLimits", {
                      executions: e.maxMonthlyExecutions == null ? t("settings.billing.unlimitedCap") : t.number(e.maxMonthlyExecutions),
                      cap: e.monthlyUsageCapMicros == null ? t("settings.billing.noUsageCap") : t("settings.billing.cap", { amount: fmtMicros(e.monthlyUsageCapMicros) }),
                      concurrent: e.maxConcurrentRuns,
                    })}
                  </p>
                </div>
                {!isCurrent && p.id !== d.freePlanId && (
                  <Button
                    variant={direction === "upgrade" ? "primary" : "secondary"}
                    loading={(needsCheckout ? checkout : change).isPending}
                    disabled={busy}
                    disabledReason={manageReason(null)}
                    onClick={() => (needsCheckout ? checkout.mutate(p.id) : change.mutate(p.id))}
                  >
                    {needsCheckout ? t("settings.billing.choose") : t(`settings.billing.${direction}`)}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold">{t("settings.billing.entitlementsTitle")}</h3>
        <p className="mt-1 text-sm text-muted">{t("settings.billing.entitlementsBody", { date: fmtDate(d.usage.periodStart) })}</p>
        <p className="mt-2 text-sm text-muted">{t("settings.billing.executionCounting")}</p>
        <p className="mt-2 text-sm text-muted">{t("settings.billing.ledgerLimitations")}</p>
        {d.entitlements ? (
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-base sm:grid-cols-3">
            <div>
              <dt id="billing-usage-executions" className="text-xs font-medium tracking-[0.4px] text-muted uppercase">
                {t("settings.billing.executions")}
              </dt>
              <dd className="data mt-0.5">
                {t.number(d.usage.executions)} / {d.entitlements.maxMonthlyExecutions == null ? t("settings.billing.unlimited") : t.number(d.entitlements.maxMonthlyExecutions)}
              </dd>
              {d.entitlements.maxMonthlyExecutions != null && <UsageBar ratio={d.usage.executions / d.entitlements.maxMonthlyExecutions} labelledBy="billing-usage-executions" className="mt-1.5" />}
            </div>
            <div>
              <dt id="billing-usage-cost" className="text-xs font-medium tracking-[0.4px] text-muted uppercase">
                {t("settings.billing.settledCost")}
              </dt>
              <dd className="data mt-0.5">
                {fmtMicros(d.usage.costMicros)} / {d.entitlements.monthlyUsageCapMicros == null ? t("settings.billing.noCap") : fmtMicros(d.entitlements.monthlyUsageCapMicros)}
              </dd>
              {d.entitlements.monthlyUsageCapMicros != null && <UsageBar ratio={d.usage.costMicros / d.entitlements.monthlyUsageCapMicros} labelledBy="billing-usage-cost" className="mt-1.5" />}
            </div>
            <div>
              <dt className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("settings.billing.concurrentRuns")}</dt>
              <dd className="data mt-0.5">{t("settings.billing.upTo", { count: d.entitlements.maxConcurrentRuns })}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-base text-muted">{t("settings.billing.noEntitlements")}</p>
        )}
      </Card>
    </div>
  );
}
