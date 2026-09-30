"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { SecretInput, takeSecret } from "@/components/secret-input";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Skeleton, StatusBadge, useConfirm } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import { api } from "@/lib/api";

type Family = "google" | "slack" | "github";
const FAMILIES: Family[] = ["google", "slack", "github"];

interface AppView {
  id: string;
  family: Family;
  clientId: string;
  configured: boolean;
  secretHint: string | null;
  revision: number;
  status: string;
  verifiedCurrentRevision: boolean;
  activeConnections: number;
}

interface Listing {
  apps: AppView[];
  platform: { family: Family; platformConfigured: boolean; platformClientId: string | null }[];
}

/**
 * Settings → OAuth apps (owner-only `oauthapp.manage`). The client secret is write-only: an uncontrolled field, read
 * and cleared on submit, never stored in React state or the query cache.
 */
export function OAuthApps() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const isOwner = role === "owner";
  const query = useQuery({ queryKey: ["oauth-apps", workspace.id], queryFn: () => api<Listing>(`/api/workspaces/${workspace.id}/oauth-apps`), enabled: isOwner });

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("oauthApps.title")}</h2>
        <p className="mt-1 text-base text-med">{t("oauthApps.body")}</p>
        {!isOwner && <p className="mt-2 text-sm text-muted">{t("oauthApps.ownerOnly")}</p>}
      </Card>
      {isOwner &&
        (query.isPending ? (
          <Skeleton className="h-48" />
        ) : query.isError ? (
          <ErrorState title={apiErrorMessage(t, query.error)} onRetry={() => query.refetch()} />
        ) : (
          FAMILIES.map((f) => <FamilyCard key={f} family={f} app={query.data.apps.find((a) => a.family === f) ?? null} platform={query.data.platform.find((p) => p.family === f)!} />)
        ))}
    </div>
  );
}

function FamilyCard({ family, app, platform }: { family: Family; app: AppView | null; platform: Listing["platform"][number] }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();
  const secretRef = useRef<HTMLInputElement>(null);
  // Holds a typed secret only while the owner confirms a switch (memory only; cleared on confirm/cancel).
  const pendingSecret = useRef<string | undefined>(undefined);
  const [clientId, setClientId] = useState(app?.clientId ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "remove" | "switch"; affected: number }>(null);
  const savedConfirm = useConfirm();
  const base = `/api/workspaces/${workspace.id}/oauth-apps/${family}`;
  const refresh = () => qc.invalidateQueries({ queryKey: ["oauth-apps", workspace.id] });
  const run = async (id: string, fn: () => Promise<void>) => {
    setPending(id);
    try {
      await fn();
    } catch (err) {
      toast(apiErrorMessage(t, err), "danger");
    } finally {
      setPending(null);
    }
  };
  const redirect = typeof window !== "undefined" ? `${window.location.origin}/api/oauth/callback` : "/api/oauth/callback";

  const save = (secret: string | undefined) =>
    run("save", async () => {
      await api(base, { method: "PUT", json: { clientId: clientId.trim(), ...(secret !== undefined ? { secret } : {}), expectedRevision: app?.revision ?? 0 } });
      toast(t("oauthApps.saved"), "success");
      savedConfirm.flash();
      setConfirm(null);
      await refresh();
    });

  const submit = () => {
    const secret = takeSecret(secretRef.current);
    // Switching to a different client id first shows exactly how many connections must reconnect.
    if (app && clientId.trim() !== app.clientId) {
      void run("preview", async () => {
        const r = await api<{ affectedConnections: number }>(`${base}/impact`);
        setConfirm({ kind: "switch", affected: r.affectedConnections });
        pendingSecret.current = secret;
      });
      return;
    }
    void save(secret);
  };
  const statusTone = !app ? "muted" : app.status === "rejected" ? "danger" : app.verifiedCurrentRevision ? "success" : "warning";

  return (
    <Card className="motion-list-in p-5" data-testid={`oauth-app-${family}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t(`oauthApps.family.${family}`)}</h3>
        <StatusBadge tone={statusTone} upper>
          {!app ? (platform.platformConfigured ? t("oauthApps.platformDefault", { clientId: platform.platformClientId ?? "" }) : t("oauthApps.platformNone")) : app.status === "rejected" ? t("oauthApps.rejected") : app.verifiedCurrentRevision ? t("oauthApps.verified") : t("oauthApps.unverified")}
        </StatusBadge>
      </div>
      {app && (
        <p className="mt-1 text-sm text-muted">
          {t("oauthApps.own")} · {t("oauthApps.impact", { count: app.activeConnections })}
          {app.secretHint ? ` · ${app.secretHint}` : ""}
        </p>
      )}
      <p className="mt-1 text-sm text-muted" dir="ltr">
        {t("oauthApps.redirect", { uri: redirect })}
      </p>
      <form
        className="mt-3 flex flex-col gap-3"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("oauthApps.clientId")} htmlFor={`oa-client-${family}`}>
            <Input id={`oa-client-${family}`} dir="ltr" className="data" autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} maxLength={300} />
          </Field>
          <Field label={t("oauthApps.secret")} htmlFor={`oa-secret-${family}`} hint={app ? t("oauthApps.secretKeep") : t("oauthApps.secretNew")}>
            <SecretInput ref={secretRef} id={`oa-secret-${family}`} maxLength={4096} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={pending === "save" || pending === "preview"} confirm={savedConfirm.confirmed} disabledReason={clientId.trim() ? null : t("oauthApps.clientId")}>
            {t("oauthApps.save")}
          </Button>
          {app && (
            <>
              <Button
                loading={pending === "probe"}
                onClick={() =>
                  void run("probe", async () => {
                    const r = await api<{ result: "rejected" | "client_accepted" | "accepted" | "unreachable" }>(`${base}/probe`, { method: "POST", json: {} });
                    toast(t(`oauthApps.probe.${r.result}`), r.result === "rejected" ? "danger" : "success");
                    await refresh();
                  })
                }
              >
                {t("oauthApps.test")}
              </Button>
              <Button
                variant="danger"
                loading={pending === "preview-remove"}
                onClick={() =>
                  void run("preview-remove", async () => {
                    const r = await api<{ affectedConnections: number }>(`${base}/impact`);
                    setConfirm({ kind: "remove", affected: r.affectedConnections });
                  })
                }
              >
                {t("oauthApps.remove")}
              </Button>
            </>
          )}
        </div>
      </form>
      {confirm && (
        <div role="alertdialog" aria-labelledby={`oa-confirm-${family}`} className="mt-3 rounded-md border border-danger bg-surface p-3">
          <p id={`oa-confirm-${family}`} className="text-base font-semibold">
            {confirm.kind === "remove" ? t("oauthApps.confirmRemove") : t("oauthApps.confirmSwitch")}
          </p>
          <p className="mt-1 text-sm text-med">{t("oauthApps.impact", { count: confirm.affected })}</p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              loading={pending === "confirm"}
              onClick={() =>
                void run("confirm", async () => {
                  if (confirm.kind === "switch") {
                    const s = pendingSecret.current;
                    pendingSecret.current = undefined;
                    await api(base, { method: "PUT", json: { clientId: clientId.trim(), ...(s !== undefined ? { secret: s } : {}), expectedRevision: app?.revision ?? 0 } });
                    toast(t("oauthApps.saved"), "success");
                  } else {
                    const r = await api<{ affectedConnections: number }>(base, { method: "DELETE", json: { expectedRevision: app!.revision } });
                    toast(t("oauthApps.removed", { count: r.affectedConnections }), "success");
                    setClientId("");
                  }
                  setConfirm(null);
                  await refresh();
                })
              }
            >
              {t("platformAdmin.action.confirm")}
            </Button>
            <Button
              onClick={() => {
                pendingSecret.current = undefined;
                setConfirm(null);
              }}
            >
              {t("platformAdmin.action.cancel")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
