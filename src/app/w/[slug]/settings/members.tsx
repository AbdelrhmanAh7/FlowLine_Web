"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Skeleton, cx } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";

type Role = "owner" | "editor" | "viewer";
interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}
interface Invite {
  id: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
}

const selectCls = "h-8 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none disabled:text-muted";

export function Members() {
  const t = useT();
  const { workspace, user, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can(role as Role, "member.manage");
  const reason = manage ? null : denyReasonText(t, role as Role, "member.manage");
  const members = useQuery({
    queryKey: ["members", workspace.id],
    queryFn: () => api<{ members: Member[] }>(`/api/workspaces/${workspace.id}/members`),
    select: (d) => d.members,
  });
  const invites = useQuery({
    queryKey: ["invites", workspace.id],
    queryFn: () => api<{ invites: Invite[] }>(`/api/workspaces/${workspace.id}/invites`),
    select: (d) => d.invites.filter((i) => i.status === "pending"),
    enabled: manage,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["members", workspace.id] });
    void qc.invalidateQueries({ queryKey: ["invites", workspace.id] });
  };
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);
  const invite = useMutation({
    mutationFn: () => api<{ url: string; emailed: boolean }>(`/api/workspaces/${workspace.id}/invites`, { method: "POST", json: { email, role: inviteRole } }),
    onSuccess: (r) => {
      setLink({ url: r.url, emailed: r.emailed });
      setEmail("");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.members.inviteError")), "danger"),
  });
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: Role }) => api(`/api/workspaces/${workspace.id}/members/${v.userId}`, { method: "PATCH", json: { role: v.role } }),
    onSuccess: () => {
      toast(t("settings.members.roleUpdated"), "success");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.members.roleError")), "danger"),
  });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/api/workspaces/${workspace.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast(t("settings.members.removed"), "success");
      setConfirmRemove(null);
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.members.removeError")), "danger"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/workspaces/${workspace.id}/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast(t("settings.members.inviteRevoked"), "success");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("settings.revokeError")), "danger"),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("settings.members.title")}</h2>
        <p className="mt-1 text-base text-med">{t("settings.members.body", { name: workspace.name })}</p>
        <div className="mt-4">
          {members.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : members.isError ? (
            <ErrorState title={t("settings.members.loadError")} body={(members.error as Error).message} onRetry={() => members.refetch()} />
          ) : (
            <ul className="divide-y divide-line" aria-label={t("settings.members.listAria")}>
              {members.data.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2.5" data-testid={`member-${m.email}`}>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-sm text-muted">
                    ·{" "}
                    <span dir="ltr" className="data">
                      {m.email}
                    </span>
                  </span>
                  {m.userId === user.id && <span className="text-sm text-muted">{t("settings.members.you")}</span>}
                  <span className="ms-auto flex items-center gap-2">
                    <label htmlFor={`role-${m.userId}`} className="sr-only">
                      {t("settings.members.roleOf", { email: m.email })}
                    </label>
                    <select
                      id={`role-${m.userId}`}
                      className={selectCls}
                      value={m.role}
                      disabled={!manage || setRole.isPending}
                      title={reason ?? t(`settings.members.roleHint.${m.role}`)}
                      onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as Role })}
                    >
                      <option value="owner">{t("roles.owner")}</option>
                      <option value="editor">{t("roles.editor")}</option>
                      <option value="viewer">{t("roles.viewer")}</option>
                    </select>
                    {confirmRemove === m.userId ? (
                      <>
                        <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(m.userId)}>
                          {t("settings.members.confirmRemove")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                          {t("settings.keep")}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger-ghost" disabledReason={reason} onClick={() => setConfirmRemove(m.userId)}>
                        {t("settings.members.remove")}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("settings.members.inviteTitle")}</h2>
        <p className="mt-1 text-base text-med">{t("settings.members.inviteBody")}</p>
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <div className="min-w-56 flex-1">
            <Field label={t("settings.members.email")} htmlFor="invite-email">
              <Input id="invite-email" type="email" dir="ltr" required placeholder="teammate@company.com" value={email} disabled={!manage} onChange={(e) => setEmail(e.target.value)} className="h-8" />
            </Field>
          </div>
          <Field label={t("settings.members.role")} htmlFor="invite-role">
            <select id="invite-role" className={selectCls} value={inviteRole} disabled={!manage} onChange={(e) => setInviteRole(e.target.value as Role)}>
              <option value="editor">{t("roles.editor")}</option>
              <option value="viewer">{t("roles.viewer")}</option>
              <option value="owner">{t("roles.owner")}</option>
            </select>
          </Field>
          <Button type="submit" variant="primary" loading={invite.isPending} disabledReason={reason ?? (email.trim() ? null : t("settings.members.enterEmail"))}>
            {t("settings.members.createInvite")}
          </Button>
        </form>
        <p className="mt-2 text-sm text-muted">{t(`settings.members.roleHint.${inviteRole}`)}</p>
        {link && (
          <div role="status" className="mt-3 flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/5 p-3">
            <p className="text-sm text-hi">{t("settings.members.linkTitle")}</p>
            <p className={link.emailed ? "text-sm text-med" : "text-sm text-warning"} data-testid="invite-email-status">
              {t(link.emailed ? "settings.members.inviteEmailed" : "settings.members.inviteNotEmailed")}
            </p>
            <code dir="ltr" className="data break-all text-sm" data-testid="invite-link">
              {link.url}
            </code>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void navigator.clipboard?.writeText(link.url).then(() => toast(t("settings.members.linkCopied"), "success"))}>
                {t("settings.members.copyLink")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
                {t("settings.members.done")}
              </Button>
            </div>
          </div>
        )}
        {manage && (invites.data?.length ?? 0) > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("settings.members.pending")}</p>
            <ul className="mt-2 flex flex-col gap-1.5" aria-label={t("settings.members.pending")}>
              {invites.data!.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 text-base">
                  <span dir="ltr" className="data">
                    {i.email}
                  </span>
                  <span className={cx("rounded-md border border-line px-1.5 text-sm capitalize text-med")}>{t(`roles.${i.role}`)}</span>
                  <span className="text-sm text-muted">{t("settings.members.expires", { date: t.date(i.expiresAt, { dateStyle: "medium" }) })}</span>
                  <Button size="sm" variant="danger-ghost" className="ms-auto" loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>
                    {t("settings.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
