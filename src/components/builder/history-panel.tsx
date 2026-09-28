"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Skeleton, StatusBadge, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { can, denyReason, type Role } from "@/lib/permissions";

interface VersionRow {
  id: string;
  version: number;
  revision: number;
  reason: "save" | "run" | "overwrite" | "publish";
  createdAt: string;
}
interface VersionDetail extends VersionRow {
  name: string;
  graph: { nodes: { id: string; type: string; data: { label: string } }[]; edges: unknown[] };
}

/**
 * Version history: every save/run/publish snapshot is immutable. Restoring copies an old definition
 * into the draft as a NEW revision (optionally publishing it = rollback of the live version).
 */
export function HistoryPanel({ flowId, getRevision, onClose, beforeRestore }: { flowId: string; getRevision: () => number; onClose: () => void; beforeRestore: () => Promise<void> }) {
  const { role, workspaces, workspace } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const pub = useQuery({ queryKey: ["publish-state", flowId], queryFn: () => api<{ publishedVersionId: string | null }>(`/api/flows/${flowId}/publish`) });
  const publishedVersionId = pub.data?.publishedVersionId ?? null;
  const versions = useQuery({ queryKey: ["versions", flowId], queryFn: () => api<{ versions: VersionRow[] }>(`/api/flows/${flowId}/versions`), select: (d) => d.versions });
  const detail = useQuery({ queryKey: ["version", flowId, open], queryFn: () => api<{ version: VersionDetail }>(`/api/flows/${flowId}/versions/${open}`), select: (d) => d.version, enabled: Boolean(open) });
  const restore = useMutation({
    mutationFn: async (publish: boolean) => {
      await beforeRestore();
      return api<{ flow: { revision: number }; published: boolean }>(`/api/flows/${flowId}/versions/${open}/restore`, { method: "POST", json: { baseRevision: getRevision(), publish } });
    },
    onSuccess: (r) => {
      toast(r.published ? `Rolled back and published (revision ${r.flow.revision})` : `Restored as draft revision ${r.flow.revision} — history is kept`, "success");
      window.location.replace(window.location.pathname);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't restore", "danger"),
  });
  const [target, setTarget] = useState("");
  const share = useMutation({
    mutationFn: () => api<{ flow: { id: string; workspaceSlug: string }; clearedConnections: number }>(`/api/flows/${flowId}/share`, { method: "POST", json: { targetWorkspaceId: target } }),
    onSuccess: (r) => toast(`Copied to the other workspace${r.clearedConnections ? ` — ${r.clearedConnections} connection(s) were cleared; credentials are never shared` : ""}`, "success"),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't share", "danger"),
  });
  const editReason = can(role as Role, "flow.edit") ? null : denyReason(role as Role, "flow.edit");
  const publishReason = can(role as Role, "flow.publish") ? null : denyReason(role as Role, "flow.publish");
  const targets = workspaces.filter((w) => w.id !== workspace.id && (w.role === "owner" || w.role === "editor"));

  return (
    <aside role="dialog" aria-label="Version history" className="absolute top-0 end-0 z-40 flex h-full w-full max-w-md animate-fade-in flex-col gap-3 overflow-y-auto border-s border-line bg-surface p-4 shadow-[var(--shadow-popover)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <button onClick={onClose} aria-label="Close history" className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          ✕
        </button>
      </div>
      <p className="text-sm text-med">Every saved, run and published version is kept unchanged. Runs always show the version they used.</p>
      {versions.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ol className="flex flex-col gap-1" aria-label="Versions">
          {(versions.data ?? []).map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setOpen(v.id)}
                aria-current={open === v.id ? "true" : undefined}
                className={cx("flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-start text-sm", open === v.id ? "border-accent bg-card" : "border-line hover:bg-card")}
              >
                <span className="data text-hi">v{v.version}</span>
                <StatusBadge tone={v.reason === "publish" ? "success" : "muted"}>{v.reason}</StatusBadge>
                {v.id === publishedVersionId && <StatusBadge tone="accent">live</StatusBadge>}
                <span className="data ms-auto text-muted">{timeAgo(v.createdAt)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {open && (
        <section className="flex flex-col gap-2 border-t border-line pt-3" data-testid="version-detail">
          {detail.data ? (
            <>
              <p className="text-sm text-med">
                v{detail.data.version} · {detail.data.graph.nodes.length} steps
              </p>
              <ul className="flex flex-col gap-0.5 text-sm">
                {detail.data.graph.nodes.map((n) => (
                  <li key={n.id}>
                    {n.data.label} <span className="data text-muted">{n.type}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={restore.isPending && restore.variables === false} disabledReason={editReason} onClick={() => restore.mutate(false)}>
                  Restore as draft
                </Button>
                <Button size="sm" variant="primary" loading={restore.isPending && restore.variables === true} disabledReason={publishReason} onClick={() => restore.mutate(true)}>
                  Restore &amp; publish (rollback)
                </Button>
              </div>
            </>
          ) : (
            <Skeleton className="h-24" />
          )}
        </section>
      )}
      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="text-base font-semibold">Share a copy</h3>
        <p className="text-sm text-med">Copies this flow into another workspace you can edit. Connections are cleared — credentials are never shared.</p>
        {targets.length === 0 ? (
          <p className="text-sm text-muted">
            You don&apos;t edit any other workspace. <Link className="text-accent hover:underline" href="/onboarding">Create one</Link> first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <label htmlFor="share-target" className="sr-only">
              Target workspace
            </label>
            <select id="share-target" className="h-8 rounded-md border border-line-strong bg-app px-2 text-base text-hi" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a workspace</option>
              {targets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <Button size="sm" loading={share.isPending} disabledReason={can(role as Role, "flow.share") ? (target ? null : "Choose a workspace") : denyReason(role as Role, "flow.share")} onClick={() => share.mutate()}>
              Share copy
            </Button>
          </div>
        )}
      </section>
    </aside>
  );
}
