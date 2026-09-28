"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Skeleton, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { can, denyReason } from "@/lib/permissions";

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

const ROLE_HINT: Record<Role, string> = {
  owner: "Everything, including members, API keys, billing and audit log",
  editor: "Build, run, publish, approve, manage integrations",
  viewer: "See flows, runs and approvals — can't change or approve anything",
};

const selectCls = "h-8 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none disabled:text-muted";

export function Members() {
  const { workspace, user, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can(role as Role, "member.manage");
  const reason = manage ? null : denyReason(role as Role, "member.manage");
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
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () => api<{ url: string }>(`/api/workspaces/${workspace.id}/invites`, { method: "POST", json: { email, role: inviteRole } }),
    onSuccess: (r) => {
      setLink(r.url);
      setEmail("");
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't create the invitation", "danger"),
  });
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: Role }) => api(`/api/workspaces/${workspace.id}/members/${v.userId}`, { method: "PATCH", json: { role: v.role } }),
    onSuccess: () => {
      toast("Role updated", "success");
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't change the role", "danger"),
  });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/api/workspaces/${workspace.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Member removed — their access ended", "success");
      setConfirmRemove(null);
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't remove the member", "danger"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/workspaces/${workspace.id}/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Invitation revoked", "success");
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't revoke", "danger"),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="mt-1 text-base text-med">People with access to {workspace.name}. Roles are enforced on the server for every request.</p>
        <div className="mt-4">
          {members.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : members.isError ? (
            <ErrorState title="Couldn't load members" body={(members.error as Error).message} onRetry={() => members.refetch()} />
          ) : (
            <ul className="divide-y divide-line" aria-label="Members">
              {members.data.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2.5" data-testid={`member-${m.email}`}>
                  <span className="font-medium">{m.name}</span>
                  <span className="data text-sm text-muted">· {m.email}</span>
                  {m.userId === user.id && <span className="text-sm text-muted">(you)</span>}
                  <span className="ms-auto flex items-center gap-2">
                    <label htmlFor={`role-${m.userId}`} className="sr-only">
                      Role of {m.email}
                    </label>
                    <select
                      id={`role-${m.userId}`}
                      className={selectCls}
                      value={m.role}
                      disabled={!manage || setRole.isPending}
                      title={reason ?? ROLE_HINT[m.role]}
                      onChange={(e) => setRole.mutate({ userId: m.userId, role: e.target.value as Role })}
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    {confirmRemove === m.userId ? (
                      <>
                        <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(m.userId)}>
                          Confirm remove
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                          Keep
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger-ghost" disabledReason={reason} onClick={() => setConfirmRemove(m.userId)}>
                        Remove
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
        <h2 className="text-lg font-semibold">Invite a teammate</h2>
        <p className="mt-1 text-base text-med">
          Email delivery isn&apos;t configured in this environment, so Flowline creates a secure, single-use link (valid 7 days, only for that email) for you to share.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <div className="min-w-56 flex-1">
          <Field label="Email" htmlFor="invite-email">
            <Input id="invite-email" type="email" required placeholder="teammate@company.com" value={email} disabled={!manage} onChange={(e) => setEmail(e.target.value)} className="h-8" />
          </Field>
          </div>
          <Field label="Role" htmlFor="invite-role">
            <select id="invite-role" className={selectCls} value={inviteRole} disabled={!manage} onChange={(e) => setInviteRole(e.target.value as Role)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
          </Field>
          <Button type="submit" variant="primary" loading={invite.isPending} disabledReason={reason ?? (email.trim() ? null : "Enter an email")}>
            Create invite link
          </Button>
        </form>
        <p className="mt-2 text-sm text-muted">{ROLE_HINT[inviteRole]}</p>
        {link && (
          <div role="status" className="mt-3 flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/5 p-3">
            <p className="text-sm text-hi">Invitation link — shown once. Send it to the invitee:</p>
            <code className="data break-all text-sm" data-testid="invite-link">
              {link}
            </code>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Link copied", "success"))}>
                Copy link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLink(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
        {manage && (invites.data?.length ?? 0) > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Pending invitations</p>
            <ul className="mt-2 flex flex-col gap-1.5" aria-label="Pending invitations">
              {invites.data!.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 text-base">
                  <span className="data">{i.email}</span>
                  <span className={cx("rounded-md border border-line px-1.5 text-sm capitalize text-med")}>{i.role}</span>
                  <span className="text-sm text-muted">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                  <Button size="sm" variant="danger-ghost" className="ms-auto" loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>
                    Revoke
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
