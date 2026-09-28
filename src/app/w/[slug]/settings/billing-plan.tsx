"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Skeleton, StatusBadge, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { billingCopy, localeFromCookieHeader, pick, type Locale } from "./copy";

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
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

/** "Plan & billing" settings tab: plans from configuration, real subscription state, settled usage only. */
export function BillingPlan() {
  const { workspace, role } = useWorkspace();
  const toast = useToast();
  const isOwner = role === "owner";
  const canView = role === "owner" || role === "editor";
  const manageReason = (extra: string | null) => (!isOwner ? "Only workspace owners can manage billing" : extra);
  const [locale] = useState<Locale>(() => localeFromCookieHeader(typeof document === "undefined" ? null : document.cookie));

  const q = useQuery({
    queryKey: ["billing", workspace.id],
    queryFn: () => api<BillingState>(`/api/workspaces/${workspace.id}/billing`),
    enabled: canView,
  });

  const invalidate = () => q.refetch();
  const onError = (e: unknown) => toast(e instanceof ApiError ? e.message : "Billing request failed", "danger");

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
      toast("Plan change requested — it applies when the provider confirms", "success");
      void invalidate();
    },
    onError,
  });
  const cancelM = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}/billing/cancel`, { method: "POST", json: { atPeriodEnd: true } }),
    onSuccess: () => {
      toast("Cancellation requested — it applies when the provider confirms", "success");
      void invalidate();
    },
    onError,
  });

  if (!canView) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Plan &amp; billing</h2>
        <p className="mt-1 text-base text-med">Only workspace owners and editors can view billing.</p>
      </Card>
    );
  }

  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState title="Couldn't load billing" body={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data;

  if (!d.configured) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Plan &amp; billing</h2>
        <p className="mt-1 text-base text-med">Billing isn&apos;t configured on this installation. Plans come from environment configuration; no payment provider key is set.</p>
      </Card>
    );
  }

  const account = d.account;
  const subscribed = account?.subscriptionId != null && (account.status === "active" || account.status === "trialing" || account.status === "past_due");
  const currentPlan = d.plans.find((p) => p.id === d.planInForce);
  const planIndex = (id: string | null) => d.plans.findIndex((p) => p.id === id);
  const busy = checkout.isPending || change.isPending || cancelM.isPending;
  const providerName = d.provider ? d.provider[0]!.toUpperCase() + d.provider.slice(1) : null;
  const modeLabel = d.providerMode === "test" ? "Test mode" : d.providerMode === "sandbox" ? pick(billingCopy.sandboxBadge, locale) : d.providerMode;
  const modeTitle =
    d.providerMode === "test" ? "Payments run against a test-mode provider key; no real charges" : d.providerMode === "sandbox" ? pick(billingCopy.sandboxTitle, locale) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Plan &amp; billing</h2>
          {d.providerMode && (
            <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium tracking-[0.4px] text-warning uppercase" title={modeTitle}>
              {providerName ? `${providerName} · ${modeLabel}` : modeLabel}
            </span>
          )}
        </div>

        {account?.status === "past_due" && (
          <div role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-4">
            <p className="font-semibold text-danger">Payment failed</p>
            <p className="mt-1 text-base text-med">The last invoice couldn&apos;t be paid. The workspace is on free-plan limits until the provider confirms a payment.</p>
          </div>
        )}

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-base sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <dt className="text-muted">Current plan</dt>
            <dd className="font-medium">{currentPlan?.name ?? (d.planInForce ?? "—")}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted">Status</dt>
            <dd>
              <StatusBadge tone={STATUS_TONE[account?.status ?? "none"] ?? "muted"}>{(account?.status ?? "none").replace("_", " ")}</StatusBadge>
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted">{account?.cancelAtPeriodEnd ? "Ends" : "Renews"}</dt>
            <dd className="data">{fmtDate(account?.currentPeriodEnd ?? null)}</dd>
          </div>
          {account?.trialEnd && (
            <div className="flex items-center gap-2">
              <dt className="text-muted">Trial ends</dt>
              <dd className="data">{fmtDate(account.trialEnd)}</dd>
            </div>
          )}
        </dl>
        {account?.cancelAtPeriodEnd && <p className="mt-3 text-sm text-warning">Cancellation is scheduled — the plan stays active until {fmtDate(account.currentPeriodEnd)}.</p>}
        {subscribed && !account.cancelAtPeriodEnd && (
          <div className="mt-4 border-t border-line pt-4">
            <Button variant="danger-ghost" loading={cancelM.isPending} disabled={busy} disabledReason={manageReason(null)} onClick={() => cancelM.mutate()}>
              Cancel at period end
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold">Plans</h3>
        <p className="mt-1 text-sm text-muted">Plans and prices are installation configuration, shown as &quot;configured price&quot;.</p>
        <ul className="mt-4 flex flex-col gap-3">
          {d.plans.map((p) => {
            const isCurrent = p.id === d.planInForce;
            const direction = planIndex(p.id) > planIndex(d.planInForce) ? "Upgrade" : "Downgrade";
            const needsCheckout = !subscribed && p.id !== d.freePlanId;
            return (
              <li key={p.id} className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-4", isCurrent ? "border-accent/50" : "border-line")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {isCurrent && <span className="rounded-md border border-line px-1.5 py-0.5 text-xs text-accent">Current</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {p.displayPrice ? `${fmtMoney(p.displayPrice.amountMinor, p.displayPrice.currency)} / ${p.displayPrice.interval} (configured price)` : "No configured price"}
                    {p.trialDays ? ` · ${p.trialDays}-day trial` : ""}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {p.entitlements.maxMonthlyExecutions == null ? "Unlimited" : p.entitlements.maxMonthlyExecutions.toLocaleString()} executions/mo ·{" "}
                    {p.entitlements.monthlyUsageCapMicros == null ? "no usage cap" : `${fmtMicros(p.entitlements.monthlyUsageCapMicros)} cap`} · {p.entitlements.maxConcurrentRuns} concurrent runs
                  </p>
                </div>
                {!isCurrent && p.id !== d.freePlanId && (
                  <Button
                    variant={direction === "Upgrade" ? "primary" : "secondary"}
                    loading={(needsCheckout ? checkout : change).isPending}
                    disabled={busy}
                    disabledReason={manageReason(null)}
                    onClick={() => (needsCheckout ? checkout.mutate(p.id) : change.mutate(p.id))}
                  >
                    {needsCheckout ? "Choose" : direction}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold">Entitlements vs usage this period</h3>
        <p className="mt-1 text-sm text-muted">Usage is the actual settled ledger total since {fmtDate(d.usage.periodStart)} — never an estimate or a projected charge.</p>
        {d.entitlements ? (
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-base sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Executions</dt>
              <dd className="data mt-0.5">
                {d.usage.executions.toLocaleString()} / {d.entitlements.maxMonthlyExecutions == null ? "unlimited" : d.entitlements.maxMonthlyExecutions.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Settled cost</dt>
              <dd className="data mt-0.5">
                {fmtMicros(d.usage.costMicros)} / {d.entitlements.monthlyUsageCapMicros == null ? "no cap" : fmtMicros(d.entitlements.monthlyUsageCapMicros)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Concurrent runs</dt>
              <dd className="data mt-0.5">up to {d.entitlements.maxConcurrentRuns}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-base text-muted">No entitlements in force.</p>
        )}
      </Card>
    </div>
  );
}
