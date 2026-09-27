"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorState, Field, Input, Skeleton, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Tab = "members" | "general" | "keys" | "billing";
const TABS: { id: Tab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "general", label: "General" },
  { id: "keys", label: "API keys" },
  { id: "billing", label: "Billing & credits" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("members");
  return (
    <div className="flex flex-col">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-5 p-4 sm:p-6 lg:flex-row">
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col">
          {TABS.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={cx("h-8 shrink-0 rounded-md px-3 text-left text-base transition-colors duration-[var(--dur-hover)]", tab === t.id ? "bg-card text-hi" : "text-med hover:bg-card hover:text-hi")}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl flex-1">
          {tab === "members" && <Members />}
          {tab === "general" && <General />}
          {tab === "keys" && <ApiKeys />}
          {tab === "billing" && <Billing />}
        </div>
      </div>
    </div>
  );
}

function Members() {
  const { workspace, user } = useWorkspace();
  const q = useQuery({
    queryKey: ["members", workspace.id],
    queryFn: () => api<{ members: { userId: string; name: string; email: string; role: string }[] }>(`/api/workspaces/${workspace.id}/members`),
    select: (d) => d.members,
  });
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Members</h2>
      <p className="mt-1 text-base text-med">People with access to {workspace.name}.</p>
      <div className="mt-4">
        {q.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState title="Couldn't load members" body={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                <span className="font-medium">{m.name}</span>
                <span className="data text-sm text-muted">· {m.email}</span>
                {m.userId === user.id && <span className="text-sm text-muted">(you)</span>}
                <span className="ml-auto rounded-md border border-line px-2 py-0.5 text-sm capitalize text-med">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <label htmlFor="invite" className="sr-only">
          Teammate email
        </label>
        <Input id="invite" placeholder="teammate@company.com" disabled className="h-8 max-w-xs flex-1" />
        <Button disabledReason="Invitations need email delivery and roles management, planned for Phase 3 (collaboration)." tooltipSide="top">
          Invite
        </Button>
      </div>
    </Card>
  );
}

function General() {
  const { workspace, role } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(workspace.name);
  const [tz, setTz] = useState(workspace.timezone);
  const zones = typeof Intl.supportedValuesOf === "function" ? ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")] : ["UTC"];
  const isOwner = role === "owner";
  const save = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}`, { method: "PATCH", json: { name, timezone: tz } }),
    onSuccess: () => {
      toast("Workspace settings saved", "success");
      router.refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save", "danger"),
  });
  const dirty = name !== workspace.name || tz !== workspace.timezone;
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">General</h2>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset disabled={!isOwner} className="flex flex-col gap-4">
          <Field label="Workspace name" htmlFor="ws-name">
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Schedule timezone" htmlFor="ws-tz" hint="Used by scheduled triggers once they ship in Phase 2.">
            <select id="ws-tz" value={tz} onChange={(e) => setTz(e.target.value)} className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-hi focus:border-accent focus:outline-none">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default LLM provider" htmlFor="llm" hint="LLM nodes and provider keys arrive in Phase 2/3. No provider is configured.">
            <select id="llm" disabled className="h-9 rounded-md border border-line-strong bg-app px-2 text-base text-muted">
              <option>None configured</option>
            </select>
          </Field>
        </fieldset>
        <div>
          <Button type="submit" variant="primary" loading={save.isPending} disabledReason={!isOwner ? "Only workspace owners can change settings" : !dirty ? "No changes to save" : null}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ApiKeys() {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">API keys</h2>
      <p className="mt-1 text-base text-med">No API keys exist. Programmatic access (live and test keys, revocation) is planned for a later phase; there is no public API yet.</p>
      <div className="mt-4">
        <Button disabledReason="The public API isn't available yet, so keys can't be created.">Create key</Button>
      </div>
    </Card>
  );
}

function Billing() {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Billing &amp; credits</h2>
      <p className="mt-1 text-base text-med">Billing isn&apos;t configured in this environment. Usage isn&apos;t metered, no plan is active, and nothing is charged.</p>
      <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-base">
        <dt className="text-muted">Plan</dt>
        <dd>None (preview)</dd>
        <dt className="text-muted">Credits used</dt>
        <dd className="text-muted">Not metered</dd>
      </dl>
      <div className="mt-4">
        <Button disabledReason="Plans and payments are planned for Phase 3.">Upgrade</Button>
      </div>
    </Card>
  );
}
