"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { SecretInput, takeSecret } from "@/components/secret-input";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Logo, Select, Skeleton, StatusBadge, Textarea, type Tone } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";
import { api } from "@/lib/api";

/** Write-only projection returned by /api/platform/credentials (never a value, a ciphertext or a provider error). */
interface CredentialView {
  purpose: string;
  kind: "oauth_signin" | "oauth_integration" | "email" | "billing_api" | "billing_webhook";
  provider: string;
  configured: boolean;
  status: "unconfigured" | "configured_unverified" | "verified" | "rejected" | "revoked";
  publicIdLabel: "clientId" | "sender" | "clientToken" | null;
  publicId: string | null;
  secretHint: string | null;
  revision: number;
  setAt: string | null;
  setBy: string | null;
  verifiedAt: string | null;
  verifiedVia: "connect" | "signin" | "probe" | "send" | null;
  verifiedCurrentRevision: boolean;
  hasPrevious: boolean;
  previousValidUntil: string | null;
  graceDays: number;
  lastProbeResult: string | null;
  envImport: { available: boolean; imported: boolean; envVars: string[] };
}

interface SettingView {
  key: "email.provider" | "email.allowed_recipients" | "billing.provider" | "billing.plans";
  value: unknown;
  revision: number;
  envImport: { available: boolean; imported: boolean };
}

interface Overview {
  credentials: CredentialView[];
  settings: SettingView[];
  redirectUris: { integrations: string | null; signin: { google: string | null; github: string | null }; warnings: string[] };
  legacyEnvStillSet: string[];
  billingSafety: { paddleEnv: "sandbox" | "live"; allowLive: boolean };
}

interface Me {
  email: string;
  stepUpUntil: string | null;
  csrfToken: string;
}

const STATUS_TONE: Record<CredentialView["status"], Tone> = { unconfigured: "muted", configured_unverified: "warning", verified: "success", rejected: "danger", revoked: "danger" };

const GROUPS: { id: "signin" | "integrations" | "email" | "billing"; kinds: CredentialView["kind"][] }[] = [
  { id: "signin", kinds: ["oauth_signin"] },
  { id: "integrations", kinds: ["oauth_integration"] },
  { id: "email", kinds: ["email"] },
  { id: "billing", kinds: ["billing_api", "billing_webhook"] },
];

const purposeKey = (p: string) => `platformAdmin.purposeName.${p.replaceAll(".", "_")}` as MessageKey;

/** Runs one action with local pending state — no TanStack mutation (its variables would keep the secret in memory). */
function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  return {
    pending,
    async run(id: string, fn: () => Promise<void>) {
      setPending(id);
      try {
        await fn();
      } finally {
        setPending(null);
      }
    },
  };
}

export function PlatformPanel() {
  const t = useT();
  const me = useQuery({ queryKey: ["platform-me"], queryFn: () => api<Me>("/api/platform/me"), refetchInterval: 30_000 });
  const overview = useQuery({ queryKey: ["platform-overview"], queryFn: () => api<Overview>("/api/platform/credentials") });
  // The server only returns an unexpired elevation (and re-checks it on every write); refetched every 30 s.
  const unlocked = Boolean(me.data?.stepUpUntil);
  const lockReason = unlocked ? null : t("platformAdmin.stepUp.locked");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line bg-app/95 px-4 py-2.5 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo withName={false} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{t("platformAdmin.title")}</h1>
            {me.data && (
              <p className="truncate text-sm text-muted" dir="ltr">
                {me.data.email}
              </p>
            )}
          </div>
        </div>
        <LanguageSwitcher />
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <p className="text-base text-med">{t("platformAdmin.subtitle")}</p>
        {me.data && <StepUpCard me={me.data} unlocked={unlocked} onDone={() => me.refetch()} />}
        {overview.isPending ? (
          <Skeleton className="h-64" />
        ) : overview.isError ? (
          <ErrorState title={apiErrorMessage(t, overview.error)} onRetry={() => overview.refetch()} />
        ) : (
          <>
            {overview.data.legacyEnvStillSet.length > 0 && (
              <Card className="border-warning p-4" role="note">
                <h2 className="text-base font-semibold">{t("platformAdmin.env.legacyTitle")}</h2>
                <p className="mt-1 text-sm text-med" dir="ltr">
                  {t("platformAdmin.env.legacyBody", { vars: overview.data.legacyEnvStillSet.join(", ") })}
                </p>
              </Card>
            )}
            <RedirectUris uris={overview.data.redirectUris} />
            {GROUPS.map((g) => (
              <section key={g.id} aria-labelledby={`sec-${g.id}`} className="flex flex-col gap-3">
                <div>
                  <h2 id={`sec-${g.id}`} className="text-lg font-semibold">
                    {t(`platformAdmin.sections.${g.id}`)}
                  </h2>
                  <p className="text-sm text-med">{t(`platformAdmin.sectionHelp.${g.id}`)}</p>
                </div>
                {g.id === "billing" && (
                  <p className="text-sm text-muted">
                    {t("platformAdmin.settings.liveGate")} {t("platformAdmin.settings.paddleEnv", { env: overview.data.billingSafety.paddleEnv })}
                  </p>
                )}
                {overview.data.credentials
                  .filter((c) => g.kinds.includes(c.kind))
                  .map((c) => (
                    <CredentialCard key={c.purpose} cred={c} csrf={me.data?.csrfToken ?? ""} lockReason={lockReason} />
                  ))}
              </section>
            ))}
            <SettingsCard settings={overview.data.settings} credentials={overview.data.credentials} csrf={me.data?.csrfToken ?? ""} lockReason={lockReason} />
            <AdminsCard csrf={me.data?.csrfToken ?? ""} lockReason={lockReason} self={me.data?.email ?? ""} />
            <AuditCard />
          </>
        )}
      </main>
    </div>
  );
}

function StepUpCard({ me, unlocked, onDone }: { me: Me; unlocked: boolean; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const action = useAction();
  if (unlocked) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <StatusBadge tone="success">{t("platformAdmin.stepUp.active", { time: t.date(me.stepUpUntil!, { timeStyle: "short" }) })}</StatusBadge>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold">{t("platformAdmin.stepUp.title")}</h2>
      <p className="mt-1 text-sm text-med">{t("platformAdmin.stepUp.locked")}</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const code = (ref.current?.value ?? "").trim();
          if (ref.current) ref.current.value = "";
          void action.run("stepup", async () => {
            try {
              await api("/api/platform/step-up", { method: "POST", json: { code }, headers: { "x-flowline-csrf": me.csrfToken } });
              onDone();
            } catch (err) {
              toast(apiErrorMessage(t, err), "danger");
            }
          });
        }}
      >
        <Field label={t("platformAdmin.stepUp.code")} htmlFor="stepup-code">
          <Input
            ref={ref}
            id="stepup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            dir="ltr"
            className="h-9 w-32 font-mono tracking-widest"
          />
        </Field>
        <Button type="submit" variant="primary" loading={action.pending === "stepup"}>
          {t("platformAdmin.stepUp.submit")}
        </Button>
      </form>
    </Card>
  );
}

function CopyLine({ label, value }: { label: string; value: string | null }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.4px] text-med">{label}</span>
      <div className="flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm">
          {value}
        </code>
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? t("platformAdmin.redirect.copied") : t("platformAdmin.redirect.copy")}
        </Button>
      </div>
    </div>
  );
}

function RedirectUris({ uris }: { uris: Overview["redirectUris"] }) {
  const t = useT();
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-base font-semibold">{t("platformAdmin.redirect.title")}</h2>
        <p className="text-sm text-med">{t("platformAdmin.redirect.body")}</p>
      </div>
      {uris.warnings.map((w) => (
        <p key={w} role="alert" className="text-sm text-warning">
          {t(`platformAdmin.redirect.warn_${w}` as MessageKey)}
        </p>
      ))}
      <CopyLine label={t("platformAdmin.redirect.integrations")} value={uris.integrations} />
      <CopyLine label={t("platformAdmin.redirect.signinGoogle")} value={uris.signin.google} />
      <CopyLine label={t("platformAdmin.redirect.signinGithub")} value={uris.signin.github} />
    </Card>
  );
}

function CredentialCard({ cred, csrf, lockReason }: { cred: CredentialView; csrf: string; lockReason: string | null }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const secretRef = useRef<HTMLInputElement>(null);
  const [publicId, setPublicId] = useState(cred.publicId ?? "");
  const [confirm, setConfirm] = useState<null | { kind: "revoke" | "clear"; impact: number | null }>(null);
  const action = useAction();
  const oauth = cred.kind === "oauth_signin" || cred.kind === "oauth_integration";
  const name = t(purposeKey(cred.purpose));
  const headers = { "x-flowline-csrf": csrf };
  const refresh = () => qc.invalidateQueries({ queryKey: ["platform-overview"] });
  const fail = (err: unknown) => toast(apiErrorMessage(t, err), "danger");
  const base = `/api/platform/credentials/${encodeURIComponent(cred.purpose)}`;

  const save = () => {
    const secret = takeSecret(secretRef.current);
    const changedPublic = cred.publicIdLabel && publicId.trim() && publicId.trim() !== cred.publicId ? publicId.trim() : undefined;
    void action.run("save", async () => {
      try {
        await api(base, { method: "PUT", headers, json: { ...(changedPublic ? { publicId: changedPublic } : {}), ...(secret !== undefined ? { secret } : {}), expectedRevision: cred.revision } });
        toast(t("platformAdmin.saved"), "success");
        await refresh();
      } catch (err) {
        fail(err);
      }
    });
  };

  const askConfirm = (kind: "revoke" | "clear") => {
    void action.run(`ask-${kind}`, async () => {
      let impact: number | null = null;
      if (cred.kind === "oauth_integration") {
        try {
          impact = (await api<{ affectedConnections: number }>(`${base}/impact`)).affectedConnections;
        } catch {
          impact = null;
        }
      }
      setConfirm({ kind, impact });
    });
  };

  const doConfirmed = () => {
    const kind = confirm!.kind;
    void action.run(kind, async () => {
      try {
        await api(`${base}/${kind}`, { method: "POST", headers, json: { expectedRevision: cred.revision } });
        toast(t(kind === "revoke" ? "platformAdmin.revoked" : "platformAdmin.cleared"), "success");
        setConfirm(null);
        await refresh();
      } catch (err) {
        fail(err);
      }
    });
  };

  const probe = () =>
    void action.run("probe", async () => {
      try {
        const r = await api<{ result: "rejected" | "client_accepted" | "accepted" | "unreachable" }>(`${base}/probe`, { method: "POST", headers, json: {} });
        toast(t(`platformAdmin.probe.${r.result}`), r.result === "rejected" ? "danger" : r.result === "unreachable" ? "warning" : "success");
        await refresh();
      } catch (err) {
        fail(err);
      }
    });

  const importEnv = () =>
    void action.run("import", async () => {
      try {
        await api(`${base}/import`, { method: "POST", headers, json: {} });
        toast(t("platformAdmin.imported"), "success");
        await refresh();
      } catch (err) {
        fail(err);
      }
    });

  const statusLine: ReactNode[] = [];
  if (cred.setAt && cred.setBy) statusLine.push(t("platformAdmin.field.setBy", { date: t.date(cred.setAt), who: cred.setBy }));
  if (cred.revision) statusLine.push(t("platformAdmin.field.revision", { n: cred.revision }));
  if (cred.secretHint) statusLine.push(t("platformAdmin.field.hint", { hint: cred.secretHint }));

  return (
    <Card className="p-4" data-testid={`credential-${cred.purpose}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{name}</h3>
        <StatusBadge tone={STATUS_TONE[cred.status]} upper>
          {t(`platformAdmin.status.${cred.status}`)}
        </StatusBadge>
      </div>
      {statusLine.length > 0 && <p className="mt-1 text-sm text-muted">{statusLine.join(" · ")}</p>}
      {cred.status === "verified" && cred.verifiedAt && cred.verifiedVia && (
        <p className="mt-1 text-sm text-success">{t("platformAdmin.field.verifiedVia", { date: t.date(cred.verifiedAt), via: t(`platformAdmin.via.${cred.verifiedVia}`) })}</p>
      )}
      {cred.status === "configured_unverified" && <p className="mt-1 text-sm text-muted">{t(oauth ? "platformAdmin.field.notVerifiedOauth" : "platformAdmin.field.notVerifiedKey")}</p>}
      {cred.hasPrevious && cred.previousValidUntil && <p className="mt-1 text-sm text-muted">{t("platformAdmin.field.previous", { date: t.date(cred.previousValidUntil) })}</p>}
      {oauth && <p className="mt-1 text-sm text-muted">{cred.graceDays > 0 ? t("platformAdmin.rotation.overlap", { days: cred.graceDays }) : t("platformAdmin.rotation.immediate")}</p>}

      <form
        className="mt-3 flex flex-col gap-3"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {cred.publicIdLabel && (
            <Field label={t(`platformAdmin.field.${cred.publicIdLabel}`)} htmlFor={`pub-${cred.purpose}`}>
              <Input id={`pub-${cred.purpose}`} dir="ltr" className="data" autoComplete="off" spellCheck={false} value={publicId} onChange={(e) => setPublicId(e.target.value)} maxLength={300} />
            </Field>
          )}
          <Field label={t("platformAdmin.field.secret")} htmlFor={`sec-${cred.purpose}`} hint={cred.configured ? t("platformAdmin.field.secretKeep") : t("platformAdmin.field.secretNew")}>
            <SecretInput ref={secretRef} id={`sec-${cred.purpose}`} placeholder={cred.configured ? "••••••••" : ""} maxLength={4096} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={action.pending === "save"} disabledReason={lockReason}>
            {t("platformAdmin.action.save")}
          </Button>
          <Button onClick={probe} loading={action.pending === "probe"} disabledReason={lockReason ?? (cred.configured ? null : t("platformAdmin.status.unconfigured"))}>
            {t("platformAdmin.action.test")}
          </Button>
          {cred.configured && (
            <Button variant="danger" onClick={() => askConfirm("revoke")} loading={action.pending === "ask-revoke"} disabledReason={lockReason}>
              {t("platformAdmin.action.revoke")}
            </Button>
          )}
          {cred.status === "revoked" && (
            <Button variant="danger" onClick={() => askConfirm("clear")} loading={action.pending === "ask-clear"} disabledReason={lockReason}>
              {t("platformAdmin.action.clear")}
            </Button>
          )}
          {cred.envImport.available && (
            <Button onClick={importEnv} loading={action.pending === "import"} disabledReason={lockReason}>
              {t("platformAdmin.action.import")}
            </Button>
          )}
        </div>
        {cred.envImport.available && (
          <p className="text-sm text-muted">
            <span dir="ltr">{t("platformAdmin.env.available", { vars: cred.envImport.envVars.join(", ") })}</span> {t("platformAdmin.env.importNote")}
          </p>
        )}
      </form>

      {confirm && (
        <div role="alertdialog" aria-labelledby={`confirm-${cred.purpose}`} className="mt-3 rounded-md border border-danger bg-surface p-3">
          <p id={`confirm-${cred.purpose}`} className="text-base font-semibold">
            {t(confirm.kind === "revoke" ? "platformAdmin.confirmRevoke" : "platformAdmin.confirmClear", { name })}
          </p>
          {confirm.kind === "revoke" && <p className="mt-1 text-sm text-med">{t("platformAdmin.revokeNote")}</p>}
          {confirm.impact !== null && <p className="mt-1 text-sm text-med">{confirm.impact > 0 ? t("platformAdmin.impact", { count: confirm.impact }) : t("platformAdmin.impactNone")}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={doConfirmed} loading={action.pending === confirm.kind}>
              {t("platformAdmin.action.confirm")}
            </Button>
            <Button onClick={() => setConfirm(null)}>{t("platformAdmin.action.cancel")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SettingsCard({ settings, credentials, csrf, lockReason }: { settings: SettingView[]; credentials: CredentialView[]; csrf: string; lockReason: string | null }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const action = useAction();
  const get = (k: SettingView["key"]) => settings.find((s) => s.key === k)!;
  const [emailProvider, setEmailProvider] = useState(String(get("email.provider").value ?? ""));
  const [billingProvider, setBillingProvider] = useState(String(get("billing.provider").value ?? ""));
  const [allowlist, setAllowlist] = useState(((get("email.allowed_recipients").value as string[] | null) ?? []).join("\n"));
  const [plans, setPlans] = useState(get("billing.plans").value ? JSON.stringify(get("billing.plans").value, null, 2) : "");
  const configured = (p: string) => credentials.find((c) => c.purpose === p)?.configured ?? false;

  const put = (key: SettingView["key"], value: unknown) =>
    void action.run(key, async () => {
      try {
        await api(`/api/platform/settings/${encodeURIComponent(key)}`, { method: "PUT", headers: { "x-flowline-csrf": csrf }, json: { value, expectedRevision: get(key).revision } });
        toast(t("platformAdmin.settings.saved"), "success");
        await qc.invalidateQueries({ queryKey: ["platform-overview"] });
      } catch (err) {
        toast(apiErrorMessage(t, err), "danger");
      }
    });
  const importSetting = (key: SettingView["key"]) =>
    void action.run(`import-${key}`, async () => {
      try {
        await api(`/api/platform/settings/${encodeURIComponent(key)}/import`, { method: "POST", headers: { "x-flowline-csrf": csrf }, json: {} });
        toast(t("platformAdmin.imported"), "success");
        await qc.invalidateQueries({ queryKey: ["platform-overview"] });
      } catch (err) {
        toast(apiErrorMessage(t, err), "danger");
      }
    });
  const importButton = (k: SettingView["key"]) =>
    get(k).envImport.available ? (
      <Button onClick={() => importSetting(k)} loading={action.pending === `import-${k}`} disabledReason={lockReason}>
        {t("platformAdmin.action.import")}
      </Button>
    ) : null;

  return (
    <Card className="flex flex-col gap-5 p-4">
      <h2 className="text-lg font-semibold">{t("platformAdmin.sections.settings")}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("platformAdmin.settings.emailProvider")} htmlFor="set-email-provider" hint={t("platformAdmin.settings.emailNeedsKey")}>
          <Select id="set-email-provider" className="w-auto" value={emailProvider} onChange={(e) => setEmailProvider(e.target.value)}>
            <option value="">{t("platformAdmin.settings.none")}</option>
            <option value="resend" disabled={!configured("email.resend")}>
              Resend
            </option>
            <option value="postmark" disabled={!configured("email.postmark")}>
              Postmark
            </option>
          </Select>
        </Field>
        <Button onClick={() => put("email.provider", emailProvider || null)} loading={action.pending === "email.provider"} disabledReason={lockReason}>
          {t("platformAdmin.settings.save")}
        </Button>
        {importButton("email.provider")}
      </div>
      <div className="flex flex-col gap-2">
        <Field label={t("platformAdmin.settings.allowlist")} htmlFor="set-allowlist" hint={t("platformAdmin.settings.allowlistHelp")}>
          <Textarea id="set-allowlist" dir="ltr" mono rows={4} value={allowlist} onChange={(e) => setAllowlist(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              put(
                "email.allowed_recipients",
                allowlist
                  .split(/[\n,]+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            loading={action.pending === "email.allowed_recipients"}
            disabledReason={lockReason}
          >
            {t("platformAdmin.settings.save")}
          </Button>
          {importButton("email.allowed_recipients")}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("platformAdmin.settings.billingProvider")} htmlFor="set-billing-provider">
          <Select id="set-billing-provider" className="w-auto" value={billingProvider} onChange={(e) => setBillingProvider(e.target.value)}>
            <option value="">{t("platformAdmin.settings.none")}</option>
            <option value="stripe" disabled={!configured("billing.stripe.test")}>
              Stripe (test mode)
            </option>
            <option value="paddle" disabled={!configured("billing.paddle.sandbox")}>
              Paddle (sandbox)
            </option>
          </Select>
        </Field>
        <Button onClick={() => put("billing.provider", billingProvider || null)} loading={action.pending === "billing.provider"} disabledReason={lockReason}>
          {t("platformAdmin.settings.save")}
        </Button>
        {importButton("billing.provider")}
      </div>
      <div className="flex flex-col gap-2">
        <Field label={t("platformAdmin.settings.plans")} htmlFor="set-plans" hint={t("platformAdmin.settings.plansHelp")}>
          <Textarea id="set-plans" dir="ltr" mono rows={8} value={plans} onChange={(e) => setPlans(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (!plans.trim()) return put("billing.plans", null);
              let value: unknown;
              try {
                value = JSON.parse(plans);
              } catch {
                return toast(t("platformAdmin.settings.invalidJson"), "danger");
              }
              put("billing.plans", value);
            }}
            loading={action.pending === "billing.plans"}
            disabledReason={lockReason}
          >
            {t("platformAdmin.settings.save")}
          </Button>
          {importButton("billing.plans")}
        </div>
      </div>
    </Card>
  );
}

function AdminsCard({ csrf, lockReason, self }: { csrf: string; lockReason: string | null; self: string }) {
  const t = useT();
  const toast = useToast();
  const admins = useQuery({ queryKey: ["platform-admins"], queryFn: () => api<{ admins: { userId: string; email: string; status: string; grantedAt: string }[] }>("/api/platform/admins") });
  const action = useAction();
  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold">{t("platformAdmin.admins.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("platformAdmin.admins.grantNote")}</p>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {(admins.data?.admins ?? []).map((a) => (
          <li key={a.userId} className="motion-list-in flex flex-wrap items-center justify-between gap-2 py-2">
            <span dir="ltr" className="data">
              {a.email}
              {a.email === self ? ` (${t("platformAdmin.admins.you")})` : ""}
            </span>
            <span className="flex items-center gap-2">
              <StatusBadge tone={a.status === "active" ? "success" : "muted"}>{a.status}</StatusBadge>
              {a.status === "active" && (
                <Button
                  size="sm"
                  variant="danger"
                  disabledReason={lockReason}
                  loading={action.pending === a.userId}
                  onClick={() => {
                    if (!window.confirm(t("platformAdmin.admins.confirmRevoke", { email: a.email }))) return;
                    void action.run(a.userId, async () => {
                      try {
                        await api(`/api/platform/admins/${encodeURIComponent(a.userId)}/revoke`, { method: "POST", headers: { "x-flowline-csrf": csrf }, json: {} });
                        if (a.email === self) {
                          // This principal can no longer refetch admin data. Drop the cached panel and let the
                          // server enforce the ordinary 404 instead of retaining the stale active-admin view.
                          window.location.replace("/admin");
                          return;
                        }
                        await admins.refetch();
                      } catch (err) {
                        toast(apiErrorMessage(t, err), "danger");
                      }
                    });
                  }}
                >
                  {t("platformAdmin.admins.revoke")}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AuditCard() {
  const t = useT();
  const audit = useQuery({
    queryKey: ["platform-audit"],
    queryFn: () => api<{ events: { id: number; at: string; actor: string; action: string; result: string; purpose: string | null; oldRevision: number | null; newRevision: number | null }[] }>("/api/platform/audit"),
  });
  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold">{t("platformAdmin.audit.title")}</h2>
      {audit.data && audit.data.events.length === 0 && <p className="mt-2 text-sm text-muted">{t("platformAdmin.audit.empty")}</p>}
      {audit.data && audit.data.events.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs uppercase tracking-[0.4px] text-med">
                <th className="py-1 pe-3 text-start">{t("platformAdmin.audit.at")}</th>
                <th className="py-1 pe-3 text-start">{t("platformAdmin.audit.action")}</th>
                <th className="py-1 pe-3 text-start">{t("platformAdmin.audit.purpose")}</th>
                <th className="py-1 pe-3 text-start">{t("platformAdmin.audit.actor")}</th>
                <th className="py-1 text-start">{t("platformAdmin.audit.result")}</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.events.map((e) => (
                <tr key={e.id} className="motion-list-in border-t border-line">
                  <td className="py-1 pe-3 whitespace-nowrap">{t.date(e.at, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="py-1 pe-3 font-mono" dir="ltr">
                    {e.action}
                  </td>
                  <td className="py-1 pe-3 font-mono" dir="ltr">
                    {e.purpose ?? "—"}
                    {e.newRevision != null ? ` r${e.newRevision}` : ""}
                  </td>
                  <td className="py-1 pe-3" dir="ltr">
                    {e.actor}
                  </td>
                  <td className="py-1">{e.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
