"use client";

import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Checkbox, Button, StatusBadge, Textarea, cx, useSidePanel } from "@/components/ui";
import { useT } from "@/i18n/client";
import { issueMessage, notPreviewedReason, statusWord } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";
import { api } from "@/lib/api";

interface Proposal {
  id: string;
  flowId: string | null;
  status: "invalid" | "proposed" | "approved" | "rejected" | "stale";
  summary: string;
  diff: {
    added: { id: string; type: string; label: string }[];
    changed: { id: string; label: string; fields: string[] }[];
    removed: { id: string; type: string; label: string }[];
    edgesAdded: number;
    edgesRemoved: number;
    preview?: { ran: boolean; reason?: string; status?: string; output?: unknown; error?: { message: string } | null };
  } | null;
  issues: { code: string; message: string; severity: "error" | "warning"; nodeId?: string }[];
  savedRevision: number | null;
  model: string | null;
}

/**
 * Copilot: describe a change → a validated proposal with a diff → approve to save it as a DRAFT.
 * Nothing runs and nothing is published; removals need explicit confirmation.
 *
 * Closing the panel does not discard an unsaved proposal. The typed request, the proposal (with its diff view), the removals
 * confirmation and any request still in flight all live in this component, so the parent keeps it MOUNTED and toggles `open`:
 * a closed panel is `hidden` (out of the layout and the accessibility tree), and reopening shows the same proposal without
 * another request. Focus moves into the request field on every open and back to the launcher on every close (`useSidePanel`).
 */
/** Where proposals go: an existing flow, or a NEW flow that is created only when a proposal is approved. */
export type CopilotTarget = { kind: "flow"; flowId: string } | { kind: "new"; workspaceId: string };

export function CopilotPanel({
  target,
  open = true,
  onClose,
  beforePropose,
  onApplied,
  returnFocusTo,
}: {
  target: CopilotTarget;
  /** False while the parent keeps the panel mounted but closed (`hidden`, state kept). Mount it with `useKeepMounted`. */
  open?: boolean;
  onClose: () => void;
  beforePropose?: () => Promise<void>;
  onApplied: (applied: { flowId: string; revision: number }) => void;
  /** Where focus goes when the panel closes and its opener can't take it back (the launcher button). */
  returnFocusTo?: () => HTMLElement | null;
}) {
  const base = target.kind === "flow" ? `/api/flows/${target.flowId}/copilot` : `/api/workspaces/${target.workspaceId}/copilot`;
  const toast = useToast();
  const t = useT();
  const [request, setRequest] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirmRemovals, setConfirmRemovals] = useState(false);
  const ask = useMutation({
    mutationFn: async () => {
      await beforePropose?.(); // Copilot works on the saved flow — save pending edits first.
      return api<{ proposal: Proposal }>(base, { method: "POST", json: { request } });
    },
    onSuccess: ({ proposal }) => {
      setProposal(proposal);
      setConfirmRemovals(false);
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("copilot.proposeError")), "danger"),
  });
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") => api<{ proposal: Proposal }>(`${base}/${proposal!.id}`, { method: "POST", json: target.kind === "flow" ? { decision, confirmRemovals } : { decision } }),
    onSuccess: ({ proposal: p }) => {
      setProposal(p);
      if (p.status === "approved") {
        toast(target.kind === "new" ? t("copilot.createdDraft") : t("copilot.savedDraft", { revision: p.savedRevision ?? "" }), "success");
        onApplied({ flowId: p.flowId!, revision: p.savedRevision! });
      } else toast(target.kind === "new" ? t("copilot.rejectedNew") : t("copilot.rejected"), "info");
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("copilot.applyError")), "danger"),
  });
  // Non-modal, but a dialog for the keyboard (DV2-M02): focus moves to the request field on every open, Escape closes, focus returns
  // to the launcher (also when the panel is only hidden). Escape does not close while a proposal is being requested or applied.
  const { panelRef, onKeyDown } = useSidePanel<HTMLElement>({ open, onClose, busy: ask.isPending || decide.isPending, returnFocusTo });
  const errors = proposal?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = proposal?.issues.filter((i) => i.severity === "warning") ?? [];
  const removed = proposal?.diff?.removed ?? [];
  const preview = proposal?.diff?.preview;
  return (
    // A non-modal side panel on purpose (no scrim, no focus trap, no aria-modal): the toolbar and canvas stay usable next to a proposal, and
    // closing it must not be a stray outside-click that discards the proposal. It slides in from the inline end like the drawers. Closed
    // it is `hidden` (still mounted, so the proposal survives; Tailwind's preflight makes [hidden] win over the display classes below).
    <aside ref={panelRef} hidden={!open} onKeyDown={onKeyDown} role="dialog" aria-label={t("copilot.title")} className="motion-drawer absolute top-0 end-0 z-40 flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-s border-line bg-surface p-4 shadow-[var(--shadow-popover)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">✦ {t("copilot.title")}</h2>
          {/* Honest status: proposals are validated, but their quality is still being measured. */}
          <StatusBadge tone="warning" upper>
            {t("copilot.beta")}
          </StatusBadge>
        </div>
        <button onClick={onClose} aria-label={t("copilot.close")} className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="text-sm text-med">{t("copilot.intro")}</p>
      <p className="text-sm text-warning">{t("copilot.betaNote")}</p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask.mutate();
        }}
      >
        <label htmlFor="copilot-request" className="sr-only">
          {t("copilot.requestLabel")}
        </label>
        <Textarea id="copilot-request" data-initial-focus rows={4} maxLength={2000} value={request} onChange={(e) => setRequest(e.target.value)} placeholder={t("copilot.placeholder")} />
        <Button type="submit" variant="primary" className="self-start" loading={ask.isPending} disabledReason={request.trim() ? null : t("copilot.describeFirst")}>
          {t("copilot.propose")}
        </Button>
      </form>

      {proposal && (
        <section className="flex flex-col gap-3 border-t border-line pt-3" data-testid="copilot-proposal" aria-live="polite">
          <p className="flex items-center gap-2 text-sm">
            <StatusBadge tone={proposal.status === "proposed" ? "info" : proposal.status === "approved" ? "success" : proposal.status === "invalid" ? "danger" : "muted"}>
              {t.has(`copilot.status.${proposal.status}`) ? t(`copilot.status.${proposal.status}` as MessageKey) : proposal.status}
            </StatusBadge>
            {proposal.model && <span className="data text-muted">{proposal.model}</span>}
          </p>
          {proposal.summary && <p className="text-base">{proposal.summary}</p>}
          {errors.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 rounded-md border border-danger-border bg-danger-bg p-2 text-sm text-danger" aria-label={t("copilot.errorsAria")}>
              {errors.map((i, k) => (
                <li key={k}>✗ {issueMessage(t, i)}</li>
              ))}
              <li className="text-med">{t("copilot.cantApply")}</li>
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-warning-border bg-warning-bg p-2 text-sm text-warning" aria-label={t("copilot.setupAria")}>
              {warnings.map((i, k) => (
                <li key={k}>⚠ {issueMessage(t, i)}</li>
              ))}
            </ul>
          )}
          {proposal.diff && (
            <div className="flex flex-col gap-1.5 text-sm" aria-label={t("copilot.changesAria")}>
              {proposal.diff.added.map((a) => (
                <p key={`a-${a.id}`} className="text-success">
                  + {a.label} <span className="data text-muted">{a.type}</span>
                </p>
              ))}
              {proposal.diff.changed.map((c) => (
                <p key={`c-${c.id}`} className="text-info">
                  ~ {c.label} <span className="data text-muted">({c.fields.join(", ")})</span>
                </p>
              ))}
              {removed.map((r) => (
                <p key={`r-${r.id}`} className="text-danger">
                  − {r.label} <span className="data text-muted">{r.type}</span>
                </p>
              ))}
              <p className="data text-muted">
                {t("copilot.edges", { added: proposal.diff.edgesAdded, removed: proposal.diff.edgesRemoved })}
              </p>
            </div>
          )}
          {preview && (
            <div className="flex flex-col gap-1 text-sm" data-testid="copilot-preview">
              {preview.ran ? (
                <>
                  {/* CX3S-01: a clean dry run only means the steps executed — it says nothing about whether the output is right. */}
                  <p className="text-med">
                    {t("copilot.previewLabel")}{" "}
                    {preview.status === "succeeded" ? <span className="text-hi">{t("copilot.previewOk")}</span> : <span className="data">{statusWord(t, preview.status ?? "")}</span>}
                  </p>
                  <pre dir="ltr" className="data max-h-40 overflow-auto rounded-md border border-line bg-app p-2 text-xs">{preview.error ? preview.error.message : JSON.stringify(preview.output, null, 2)}</pre>
                </>
              ) : (
                <p className="text-muted">{preview.reason ? notPreviewedReason(t, preview.reason) : null}</p>
              )}
            </div>
          )}
          {proposal.status === "proposed" && (
            <>
              {removed.length > 0 && (
                <label className={cx("flex items-start gap-2 rounded-md border border-danger-border p-2 text-sm")}>
                  <Checkbox className="mt-0.5" checked={confirmRemovals} onChange={(e) => setConfirmRemovals(e.target.checked)} />
                  <span>
                    {t.plural("copilot.confirmRemovals", removed.length, { labels: removed.map((r) => r.label).join(t("perm.listSep")) })}
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="primary" loading={decide.isPending && decide.variables === "approve"} disabledReason={removed.length > 0 && !confirmRemovals ? t("copilot.confirmFirst") : null} onClick={() => decide.mutate("approve")}>
                  {target.kind === "new" ? t("copilot.approveNew") : t("copilot.approveSave")}
                </Button>
                <Button variant="ghost" loading={decide.isPending && decide.variables === "reject"} onClick={() => decide.mutate("reject")}>
                  {t("copilot.reject")}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </aside>
  );
}
