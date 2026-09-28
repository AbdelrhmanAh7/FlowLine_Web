"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, ErrorState, Field, Input, Skeleton, cx } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import { dataText } from "@/i18n/workspace-text";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";

interface ApiKeyDto {
  id: string;
  name: string;
  mode: "test" | "live";
  prefix: string;
  scopes: string[];
  status: "active" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

const selectCls = "h-8 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none";

export function ApiKeys() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can(role as Role, "apikey.manage");
  const q = useQuery({
    queryKey: ["api-keys", workspace.id],
    queryFn: () => api<{ apiKeys: ApiKeyDto[]; scopes: Record<string, string> }>(`/api/workspaces/${workspace.id}/api-keys`),
    enabled: manage,
  });
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [scopes, setScopes] = useState<string[]>(["runs:write", "runs:read"]);
  const [expiry, setExpiry] = useState("90");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api<{ key: string }>(`/api/workspaces/${workspace.id}/api-keys`, {
        method: "POST",
        json: { name, mode, scopes, expiresInDays: expiry === "never" ? null : Number(expiry) },
      }),
    onSuccess: (r) => {
      setRevealed(r.key);
      setName("");
      void qc.invalidateQueries({ queryKey: ["api-keys", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.keys.createError")), "danger"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/workspaces/${workspace.id}/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast(t("settings.keys.revoked"), "success");
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ["api-keys", workspace.id] });
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.revokeError")), "danger"),
  });

  if (!manage) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("settings.keys.title")}</h2>
        <p className="mt-2 text-base text-med">{denyReasonText(t, role as Role, "apikey.manage")}.</p>
      </Card>
    );
  }
  const base = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("settings.keys.title")}</h2>
        <p className="mt-1 text-base text-med">{t.rich("settings.keys.body", { live: <strong>{t("settings.keys.liveWord")}</strong>, test: <strong>{t("settings.keys.testWord")}</strong> })}</p>
        <div className="mt-4">
          {q.isPending ? (
            <Skeleton className="h-16" />
          ) : q.isError ? (
            <ErrorState title={t("settings.keys.loadError")} body={(q.error as Error).message} onRetry={() => q.refetch()} />
          ) : q.data.apiKeys.length === 0 ? (
            <EmptyState icon="⚿" title={t("settings.keys.emptyTitle")} body={t("settings.keys.emptyBody")} />
          ) : (
            <ul className="divide-y divide-line" aria-label={t("settings.keys.listAria")}>
              {q.data.apiKeys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" data-testid={`apikey-${k.name}`}>
                  <span className="font-medium">{k.name}</span>
                  <code dir="ltr" className="data text-sm text-muted">
                    {k.prefix}_…
                  </code>
                  <span className={cx("rounded-md border px-1.5 text-sm", k.mode === "live" ? "border-warning/40 text-warning" : "border-line text-med")}>{t(`settings.keys.mode.${k.mode}`)}</span>
                  <span dir="ltr" className="data text-sm text-muted">
                    {k.scopes.join(", ")}
                  </span>
                  <span className={cx("text-sm", k.status === "active" ? "text-success" : "text-muted")}>{dataText(t, "settings.keys.status", k.status)}</span>
                  <span className="text-sm text-muted">{t("settings.keys.lastUsed", { when: k.lastUsedAt ? t.date(k.lastUsedAt) : t("common.never") })}</span>
                  {k.status === "active" &&
                    (confirm === k.id ? (
                      <span className="ms-auto flex gap-2">
                        <Button size="sm" variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate(k.id)}>
                          {t("settings.keys.confirmRevoke")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                          {t("settings.keep")}
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="danger-ghost" className="ms-auto" onClick={() => setConfirm(k.id)}>
                        {t("settings.revoke")}
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold">{t("settings.keys.createTitle")}</h3>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("settings.keys.name")} htmlFor="key-name">
              <Input id="key-name" value={name} maxLength={60} placeholder={t("settings.keys.namePlaceholder")} onChange={(e) => setName(e.target.value)} className="h-8" />
            </Field>
            <Field label={t("settings.keys.modeLabel")} htmlFor="key-mode">
              <select id="key-mode" className={selectCls} value={mode} onChange={(e) => setMode(e.target.value as "test" | "live")}>
                <option value="test">{t("settings.keys.modeTest")}</option>
                <option value="live">{t("settings.keys.modeLive")}</option>
              </select>
            </Field>
            <Field label={t("settings.keys.expires")} htmlFor="key-exp">
              <select id="key-exp" className={selectCls} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                <option value="30">{t("settings.keys.in30")}</option>
                <option value="90">{t("settings.keys.in90")}</option>
                <option value="365">{t("settings.keys.in365")}</option>
                <option value="never">{t("settings.keys.never")}</option>
              </select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-med">{t("settings.keys.scopes")}</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(q.data?.scopes ?? {}).map(([s, desc]) => (
                <label key={s} className="flex items-center gap-2 text-base" title={desc}>
                  <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((v) => (e.target.checked ? [...v, s] : v.filter((x) => x !== s)))} />
                  <code dir="ltr" className="data text-sm">
                    {s}
                  </code>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Button type="submit" variant="primary" loading={create.isPending} disabledReason={!name.trim() ? t("settings.keys.nameFirst") : scopes.length === 0 ? t("settings.keys.scopeFirst") : null}>
              {t("settings.keys.create")}
            </Button>
          </div>
        </form>
        {revealed && (
          <div role="status" className="mt-4 flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-sm text-hi">{t("settings.keys.revealWarning")}</p>
            <code dir="ltr" className="data break-all text-sm" data-testid="revealed-key">
              {revealed}
            </code>
            <pre dir="ltr" className="data overflow-x-auto rounded-md border border-line bg-app p-2 text-xs text-med">{`curl -X POST ${base}/api/v1/flows/<flow-id>/runs \\\n  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\\n  -d '{"input": {}}'`}</pre>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void navigator.clipboard?.writeText(revealed).then(() => toast(t("settings.keys.copied"), "success"))}>
                {t("settings.keys.copy")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
                {t("settings.keys.stored")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
