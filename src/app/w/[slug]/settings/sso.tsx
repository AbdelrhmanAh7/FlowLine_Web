"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Checkbox, Button, Card, ErrorState, Field, Input, Select, Skeleton, StatusBadge } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import { api } from "@/lib/api";

interface SsoConfig {
  workspaceId: string;
  issuer: string;
  provider: "oidc" | "zitadel";
  clientId: string;
  hasSecret: boolean;
  domains: string[];
  defaultRole: "viewer" | "editor" | "owner";
  enabled: boolean;
  verifiedAt: string | null;
  updatedAt: string;
}

interface SsoForm {
  issuer: string;
  provider: "oidc" | "zitadel";
  clientId: string;
  clientSecret: string;
  domains: string;
  defaultRole: "viewer" | "editor" | "owner";
  enabled: boolean;
}

const EMPTY: SsoForm = { issuer: "", provider: "oidc", clientId: "", clientSecret: "", domains: "", defaultRole: "viewer", enabled: false };

function fromConfig(c: SsoConfig): SsoForm {
  return { issuer: c.issuer, provider: c.provider, clientId: c.clientId, clientSecret: "", domains: c.domains.join(", "), defaultRole: c.defaultRole, enabled: c.enabled };
}

export function Sso() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const isOwner = role === "owner";
  const query = useQuery({
    queryKey: ["sso", workspace.id],
    queryFn: () => api<{ config: SsoConfig | null; canManage: boolean; callbackUri: string | null }>(`/api/workspaces/${workspace.id}/sso`),
  });
  const config = query.data?.config ?? null;
  const [form, setForm] = useState<SsoForm | null>(null);
  const f = form ?? (config ? fromConfig(config) : EMPTY);

  const save = useMutation({
    mutationFn: () =>
      api<{ config: SsoConfig }>(`/api/workspaces/${workspace.id}/sso`, {
        method: "PUT",
        json: {
          issuer: f.issuer,
          provider: f.provider,
          clientId: f.clientId,
          ...(f.clientSecret.trim() ? { clientSecret: f.clientSecret.trim() } : {}),
          domains: f.domains.split(/[,\s]+/).filter(Boolean),
          defaultRole: f.defaultRole,
          enabled: f.enabled,
        },
      }),
    onSuccess: (d) => {
      toast(t("settings.sso.saved"), "success");
      setForm(fromConfig(d.config));
      qc.setQueryData(["sso", workspace.id], { config: d.config, canManage: query.data?.canManage ?? true, callbackUri: query.data?.callbackUri ?? null });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.sso.saveError")), "danger"),
  });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState title={t("settings.sso.loadError")} onRetry={() => query.refetch()} />;

  const ownerReason = isOwner ? null : t("settings.sso.ownerOnly");
  const verified = Boolean(config?.verifiedAt);
  const status: "none" | "enabled" | "verified" | "configured" = !config ? "none" : config.enabled ? "enabled" : verified ? "verified" : "configured";

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("settings.sso.title")}</h2>
          {status === "enabled" ? (
            <StatusBadge tone="success" upper>
              {t("settings.sso.enabled")}
            </StatusBadge>
          ) : status === "verified" ? (
            <StatusBadge tone="info" upper>
              {t("settings.sso.verified", { date: t.date(config!.verifiedAt!, { dateStyle: "medium" }) })}
            </StatusBadge>
          ) : status === "configured" ? (
            <StatusBadge tone="warning" upper>
              {t("settings.sso.configured")}
            </StatusBadge>
          ) : (
            <StatusBadge tone="muted" upper>
              {t("settings.sso.notConfigured")}
            </StatusBadge>
          )}
        </div>
        <p className="mt-1 text-base text-med">{t("settings.sso.body")}</p>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset disabled={!isOwner} className="flex flex-col gap-4">
            <Field label={t("settings.sso.provider")} htmlFor="sso-provider">
              <Select id="sso-provider" value={f.provider} onChange={(e) => setForm({ ...f, provider: e.target.value as SsoForm["provider"], enabled: false })}>
                <option value="oidc">{t("settings.sso.providerGeneric")}</option>
                <option value="zitadel">{t("settings.sso.providerZitadel")}</option>
              </Select>
            </Field>
            {f.provider === "zitadel" && (
              <div className="rounded-lg border border-line p-4 text-sm text-med">
                <p>{t("settings.sso.zitadelSteps")}</p>
                <p className="mt-2">{t("settings.sso.callbackLabel")}</p>
                {query.data?.callbackUri ? <code dir="ltr" className="data block break-all text-hi">{query.data.callbackUri}</code> : <p>{t("settings.sso.callbackUnavailable")}</p>}
                <p className="mt-2">{t("settings.sso.zitadelAuth")}</p>
              </div>
            )}
            <Field label={t("settings.sso.issuer")} htmlFor="sso-issuer" hint={t("settings.sso.issuerHint")}>
              <Input id="sso-issuer" dir="ltr" className="data" placeholder={f.provider === "zitadel" ? "https://your-instance.zitadel.cloud" : "https://idp.example.com/realms/acme"} value={f.issuer} onChange={(e) => setForm({ ...f, issuer: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.sso.clientId")} htmlFor="sso-client-id">
                <Input id="sso-client-id" dir="ltr" className="data" value={f.clientId} onChange={(e) => setForm({ ...f, clientId: e.target.value })} maxLength={200} />
              </Field>
              <Field label={t("settings.sso.clientSecret")} htmlFor="sso-secret" hint={config?.hasSecret ? t("settings.sso.secretKeep") : t("settings.sso.secretNew")}>
                <Input
                  id="sso-secret"
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  placeholder={config?.hasSecret ? t("settings.sso.secretPlaceholder") : ""}
                  value={f.clientSecret}
                  onChange={(e) => setForm({ ...f, clientSecret: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t("settings.sso.domains")} htmlFor="sso-domains" hint={t("settings.sso.domainsHint")}>
              <Input id="sso-domains" dir="ltr" className="data" placeholder="acme.com, acme.io" value={f.domains} onChange={(e) => setForm({ ...f, domains: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.sso.defaultRole")} htmlFor="sso-role">
                <Select
                  id="sso-role"
                  value={f.defaultRole}
                  onChange={(e) => setForm({ ...f, defaultRole: e.target.value as SsoForm["defaultRole"] })}
                >
                  <option value="viewer">{t("roles.viewer")}</option>
                  <option value="editor">{t("roles.editor")}</option>
                  <option value="owner">{t("roles.owner")}</option>
                </Select>
              </Field>
              <Field label={t("settings.sso.enableLabel")} htmlFor="sso-enabled" hint={verified ? t("settings.sso.enableHintOn") : t("settings.sso.enableHintOff")}>
                <label className="flex h-9 items-center gap-2 text-base text-hi">
                  <Checkbox
                    id="sso-enabled"
                    checked={f.enabled}
                    disabled={!verified}
                    onChange={(e) => setForm({ ...f, enabled: e.target.checked })}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  {t("settings.sso.enabledCheckbox")}
                </label>
              </Field>
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={save.isPending} disabledReason={ownerReason}>
              {t("settings.sso.save")}
            </Button>
            <Button
              disabledReason={ownerReason ?? (!config ? t("settings.sso.saveFirst") : null)}
              onClick={() => {
                window.location.assign(new URL(`/api/sso/start?workspace=${encodeURIComponent(workspace.slug)}`, window.location.origin).href);
              }}
            >
              {t("settings.sso.test")}
            </Button>
          </div>
          {config && !config.enabled && verified && <p className="text-sm text-muted">{t("settings.sso.verifiedNote", { date: t.date(config.verifiedAt!) })}</p>}
          {config && !verified && <p className="text-sm text-muted">{t("settings.sso.testNote")}</p>}
        </form>
      </Card>
    </div>
  );
}
