"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Skeleton, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface SsoConfig {
  workspaceId: string;
  issuer: string;
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
  clientId: string;
  clientSecret: string;
  domains: string;
  defaultRole: "viewer" | "editor" | "owner";
  enabled: boolean;
}

const EMPTY: SsoForm = { issuer: "", clientId: "", clientSecret: "", domains: "", defaultRole: "viewer", enabled: false };

function fromConfig(c: SsoConfig): SsoForm {
  return { issuer: c.issuer, clientId: c.clientId, clientSecret: "", domains: c.domains.join(", "), defaultRole: c.defaultRole, enabled: c.enabled };
}

export function Sso() {
  const { workspace, role } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const isOwner = role === "owner";
  const query = useQuery({
    queryKey: ["sso", workspace.id],
    queryFn: () => api<{ config: SsoConfig | null; canManage: boolean }>(`/api/workspaces/${workspace.id}/sso`),
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
          clientId: f.clientId,
          ...(f.clientSecret.trim() ? { clientSecret: f.clientSecret.trim() } : {}),
          domains: f.domains.split(/[,\s]+/).filter(Boolean),
          defaultRole: f.defaultRole,
          enabled: f.enabled,
        },
      }),
    onSuccess: (d) => {
      toast("SSO settings saved", "success");
      setForm(fromConfig(d.config));
      qc.setQueryData(["sso", workspace.id], { config: d.config, canManage: query.data?.canManage ?? true });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save SSO settings", "danger"),
  });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState title="Couldn't load SSO settings" onRetry={() => query.refetch()} />;

  const ownerReason = isOwner ? null : "Only workspace owners can manage SSO";
  const verified = Boolean(config?.verifiedAt);
  const status = !config ? ("Not configured" as const) : config.enabled ? ("Enabled" as const) : verified ? ("Verified" as const) : ("Configured — not verified" as const);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Single sign-on (SSO)</h2>
          {status === "Enabled" ? (
            <StatusBadge tone="success" upper>Enabled</StatusBadge>
          ) : status === "Verified" ? (
            <StatusBadge tone="info" upper>{`Verified ${new Date(config!.verifiedAt!).toLocaleDateString()}`}</StatusBadge>
          ) : status === "Configured — not verified" ? (
            <StatusBadge tone="warning" upper>Configured — not verified</StatusBadge>
          ) : (
            <StatusBadge tone="muted" upper>Not configured</StatusBadge>
          )}
        </div>
        <p className="mt-1 text-base text-med">
          OpenID Connect sign-in for this workspace. SSO only becomes available to members after a successful test sign-in — nothing here is active
          until then.
        </p>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset disabled={!isOwner} className="flex flex-col gap-4">
            <Field label="Issuer URL" htmlFor="sso-issuer" hint="The IdP's issuer (https). Its /.well-known/openid-configuration is fetched and checked on save.">
              <Input id="sso-issuer" className="data" placeholder="https://idp.example.com/realms/acme" value={f.issuer} onChange={(e) => setForm({ ...f, issuer: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client ID" htmlFor="sso-client-id">
                <Input id="sso-client-id" className="data" value={f.clientId} onChange={(e) => setForm({ ...f, clientId: e.target.value })} maxLength={200} />
              </Field>
              <Field label="Client secret" htmlFor="sso-secret" hint={config?.hasSecret ? "Stored encrypted. Leave blank to keep the current secret." : "Stored encrypted; never shown again."}>
                <Input id="sso-secret" type="password" autoComplete="off" placeholder={config?.hasSecret ? "•••••••• (unchanged)" : ""} value={f.clientSecret} onChange={(e) => setForm({ ...f, clientSecret: e.target.value })} />
              </Field>
            </div>
            <Field label="Allowed email domains" htmlFor="sso-domains" hint="Comma-separated. Only IdP accounts with a verified email in these domains can sign in.">
              <Input id="sso-domains" className="data" placeholder="acme.com, acme.io" value={f.domains} onChange={(e) => setForm({ ...f, domains: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default role for new members" htmlFor="sso-role">
                <select
                  id="sso-role"
                  value={f.defaultRole}
                  onChange={(e) => setForm({ ...f, defaultRole: e.target.value as SsoForm["defaultRole"] })}
                  className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
              </Field>
              <Field label="Enable for everyone" htmlFor="sso-enabled" hint={verified ? "Members can sign in from the sign-in page." : "Available after a successful test sign-in."}>
                <label className="flex h-9 items-center gap-2 text-base text-hi">
                  <input
                    id="sso-enabled"
                    type="checkbox"
                    checked={f.enabled}
                    disabled={!verified}
                    onChange={(e) => setForm({ ...f, enabled: e.target.checked })}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  SSO enabled
                </label>
              </Field>
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={save.isPending} disabledReason={ownerReason}>
              Save SSO settings
            </Button>
            <Button
              disabledReason={ownerReason ?? (!config ? "Save the configuration first" : null)}
              onClick={() => {
                window.location.assign(new URL(`/api/sso/start?workspace=${encodeURIComponent(workspace.slug)}`, window.location.origin).href);
              }}
            >
              Test sign-in
            </Button>
          </div>
          {config && !config.enabled && verified && <p className="text-sm text-muted">Verified {new Date(config.verifiedAt!).toLocaleString()} — turn on “SSO enabled” to let members use it.</p>}
          {config && !verified && <p className="text-sm text-muted">Run “Test sign-in” as an owner to verify this configuration before it can be enabled. You’ll be signed in as the identity the provider returns: if its email is yours, your account is linked; SSO never takes over another existing account.</p>}
        </form>
      </Card>
    </div>
  );
}
