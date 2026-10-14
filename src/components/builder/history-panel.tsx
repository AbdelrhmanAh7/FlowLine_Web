"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Select, Skeleton, StatusBadge, cx, useSidePanel } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";

interface VersionRow {
  id: string;
  /** null for a run snapshot: it is pinned for a run but has no public version number. */
  version: number | null;
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
export function HistoryPanel({
  flowId,
  getRevision,
  onClose,
  beforeRestore,
  returnFocusTo,
}: {
  flowId: string;
  getRevision: () => number;
  onClose: () => void;
  beforeRestore: () => Promise<void>;
  /** Where focus goes when the panel closes and its opener can't take it back (the toolbar's History button). */
  returnFocusTo?: () => HTMLElement | null;
}) {
  const { role, workspaces, workspace } = useWorkspace();
  const t = useT();
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
      toast(r.published ? t("history.rolledBack", { revision: r.flow.revision }) : t("history.restored", { revision: r.flow.revision }), "success");
      window.location.replace(window.location.pathname);
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("history.restoreError")), "danger"),
  });
  const [target, setTarget] = useState("");
  const share = useMutation({
    mutationFn: () => api<{ flow: { id: string; workspaceSlug: string }; clearedConnections: number }>(`/api/flows/${flowId}/share`, { method: "POST", json: { targetWorkspaceId: target } }),
    onSuccess: (r) => toast(r.clearedConnections ? t("history.copiedCleared", { count: t.number(r.clearedConnections) }) : t("history.copied"), "success"),
    onError: (e) => toast(apiErrorMessage(t, e, t("history.shareError")), "danger"),
  });
  const editReason = can(role as Role, "flow.edit") ? null : denyReasonText(t, role as Role, "flow.edit");
  const publishReason = can(role as Role, "flow.publish") ? null : denyReasonText(t, role as Role, "flow.publish");
  const targets = workspaces.filter((w) => w.id !== workspace.id && (w.role === "owner" || w.role === "editor"));
  // Non-modal, but a dialog for the keyboard (DV2-M02): focus moves to the heading on open, Escape closes, focus returns to the
  // History button. A restore in flight keeps the panel open (it is the only place showing its progress before the page reloads).
  const { panelRef, onKeyDown } = useSidePanel<HTMLElement>({ onClose, busy: restore.isPending, returnFocusTo });

  return (
    // Non-modal side panel (see the Copilot panel): the toolbar stays usable, it slides in from the inline end like the drawers.
    <aside ref={panelRef} onKeyDown={onKeyDown} role="dialog" aria-label={t("history.dialog")} className="motion-drawer absolute top-0 end-0 z-40 flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-s border-line bg-surface p-4 shadow-[var(--shadow-popover)]">
      <div className="flex items-center justify-between">
        {/* tabIndex -1: focus lands here when the panel opens (a heading names where the user is; no field to start in). */}
        <h2 tabIndex={-1} data-initial-focus className="text-lg font-semibold">
          {t("history.title")}
        </h2>
        <button onClick={onClose} aria-label={t("history.close")} className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="text-sm text-med">{t("history.intro")}</p>
      {versions.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ol className="flex flex-col gap-1" aria-label={t("history.versions")}>
          {(versions.data ?? []).map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setOpen(v.id)}
                aria-current={open === v.id ? "true" : undefined}
                className={cx("flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-start text-sm", open === v.id ? "border-accent bg-card" : "border-line hover:bg-card")}
              >
                <span className="data text-hi">{v.version === null ? t("history.reason.run") : t("common.version", { version: v.version })}</span>
                <StatusBadge tone={v.reason === "publish" ? "success" : "muted"}>{t.has(`history.reason.${v.reason}`) ? t(`history.reason.${v.reason}`) : v.reason}</StatusBadge>
                {v.id === publishedVersionId && <StatusBadge tone="accent">{t("history.live")}</StatusBadge>}
                <span className="data ms-auto text-muted">{t.relative(v.createdAt)}</span>
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
                {detail.data.version === null ? t("history.reason.run") : t("common.version", { version: detail.data.version })} · {t.plural("history.steps", detail.data.graph.nodes.length)}
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
                  {t("history.restoreDraft")}
                </Button>
                <Button size="sm" variant="primary" loading={restore.isPending && restore.variables === true} disabledReason={publishReason} onClick={() => restore.mutate(true)}>
                  {t("history.restorePublish")}
                </Button>
              </div>
            </>
          ) : (
            <Skeleton className="h-24" />
          )}
        </section>
      )}
      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="text-base font-semibold">{t("history.shareTitle")}</h3>
        <p className="text-sm text-med">{t("history.shareBody")}</p>
        {targets.length === 0 ? (
          <p className="text-sm text-muted">
            {t.rich("history.noTargets", {
              create: (
                <Link className="text-accent-text hover:underline" href="/onboarding">
                  {t("history.createOne")}
                </Link>
              ),
            })}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <label htmlFor="share-target" className="sr-only">
              {t("history.target")}
            </label>
            <Select size="sm" id="share-target" value={target} onChange={(e) => setTarget(e.target.value)} className="w-auto">
              <option value="">{t("history.chooseWorkspace")}</option>
              {targets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <Button size="sm" loading={share.isPending} disabledReason={can(role as Role, "flow.share") ? (target ? null : t("history.chooseWorkspace")) : denyReasonText(t, role as Role, "flow.share")} onClick={() => share.mutate()}>
              {t("history.share")}
            </Button>
          </div>
        )}
      </section>
    </aside>
  );
}
