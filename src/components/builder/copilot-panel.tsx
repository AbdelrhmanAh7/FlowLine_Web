"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button, StatusBadge, Textarea, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

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
 */
/** Where proposals go: an existing flow, or a NEW flow that is created only when a proposal is approved. */
export type CopilotTarget = { kind: "flow"; flowId: string } | { kind: "new"; workspaceId: string };

export function CopilotPanel({ target, onClose, beforePropose, onApplied }: { target: CopilotTarget; onClose: () => void; beforePropose?: () => Promise<void>; onApplied: (applied: { flowId: string; revision: number }) => void }) {
  const base = target.kind === "flow" ? `/api/flows/${target.flowId}/copilot` : `/api/workspaces/${target.workspaceId}/copilot`;
  const toast = useToast();
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
    onError: (e) => toast(e instanceof ApiError ? e.message : "Copilot couldn't make a proposal", "danger"),
  });
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") => api<{ proposal: Proposal }>(`${base}/${proposal!.id}`, { method: "POST", json: target.kind === "flow" ? { decision, confirmRemovals } : { decision } }),
    onSuccess: ({ proposal: p }) => {
      setProposal(p);
      if (p.status === "approved") {
        toast(target.kind === "new" ? "Flow created as a draft — nothing was run or published" : `Saved as draft revision ${p.savedRevision} — nothing was run or published`, "success");
        onApplied({ flowId: p.flowId!, revision: p.savedRevision! });
      } else toast(target.kind === "new" ? "Proposal rejected — no flow was created" : "Proposal rejected — nothing changed", "info");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't apply the proposal", "danger"),
  });
  const errors = proposal?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = proposal?.issues.filter((i) => i.severity === "warning") ?? [];
  const removed = proposal?.diff?.removed ?? [];
  return (
    <aside role="dialog" aria-label="Copilot" className="absolute top-0 right-0 z-40 flex h-full w-full max-w-md animate-fade-in flex-col gap-3 overflow-y-auto border-l border-line bg-surface p-4 shadow-[var(--shadow-popover)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">✦ Copilot</h2>
        <button onClick={onClose} aria-label="Close Copilot" className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
          ✕
        </button>
      </div>
      <p className="text-sm text-med">Describe the workflow or a change. Copilot proposes steps using only Flowline&apos;s real nodes, integrations and your existing connections — you review the diff before anything is saved. Nothing runs.</p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask.mutate();
        }}
      >
        <label htmlFor="copilot-request" className="sr-only">
          What should this workflow do?
        </label>
        <Textarea id="copilot-request" rows={4} maxLength={2000} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="e.g. Every Monday get the latest KPI data, summarize the important changes, and email leadership." />
        <Button type="submit" variant="primary" className="self-start" loading={ask.isPending} disabledReason={request.trim() ? null : "Describe what you want"}>
          Propose
        </Button>
      </form>

      {proposal && (
        <section className="flex flex-col gap-3 border-t border-line pt-3" data-testid="copilot-proposal" aria-live="polite">
          <p className="flex items-center gap-2 text-sm">
            <StatusBadge tone={proposal.status === "proposed" ? "info" : proposal.status === "approved" ? "success" : proposal.status === "invalid" ? "danger" : "muted"}>
              {proposal.status === "proposed" ? "Proposal — review" : proposal.status}
            </StatusBadge>
            {proposal.model && <span className="data text-muted">{proposal.model}</span>}
          </p>
          {proposal.summary && <p className="text-base">{proposal.summary}</p>}
          {errors.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 rounded-md border border-danger/40 bg-danger/5 p-2 text-sm text-danger" aria-label="Proposal errors">
              {errors.map((i, k) => (
                <li key={k}>✗ {i.message}</li>
              ))}
              <li className="text-med">This proposal can&apos;t be applied. Rephrase the request and try again.</li>
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 p-2 text-sm text-warning" aria-label="Setup needed">
              {warnings.map((i, k) => (
                <li key={k}>⚠ {i.message}</li>
              ))}
            </ul>
          )}
          {proposal.diff && (
            <div className="flex flex-col gap-1.5 text-sm" aria-label="Proposed changes">
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
                edges +{proposal.diff.edgesAdded} −{proposal.diff.edgesRemoved}
              </p>
            </div>
          )}
          {proposal.diff?.preview && (
            <div className="flex flex-col gap-1 text-sm" data-testid="copilot-preview">
              {proposal.diff.preview.ran ? (
                <>
                  <p className="text-med">
                    Preview on the sample input (local steps only): <span className="data">{proposal.diff.preview.status}</span>
                  </p>
                  <pre className="data max-h-40 overflow-auto rounded-md border border-line bg-app p-2 text-xs">{proposal.diff.preview.error ? proposal.diff.preview.error.message : JSON.stringify(proposal.diff.preview.output, null, 2)}</pre>
                </>
              ) : (
                <p className="text-muted">{proposal.diff.preview.reason}</p>
              )}
            </div>
          )}
          {proposal.status === "proposed" && (
            <>
              {removed.length > 0 && (
                <label className={cx("flex items-start gap-2 rounded-md border border-danger/40 p-2 text-sm")}>
                  <input type="checkbox" className="mt-0.5" checked={confirmRemovals} onChange={(e) => setConfirmRemovals(e.target.checked)} />
                  <span>
                    I understand this removes {removed.length} existing step{removed.length > 1 ? "s" : ""}: {removed.map((r) => r.label).join(", ")}
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="primary" loading={decide.isPending && decide.variables === "approve"} disabledReason={removed.length > 0 && !confirmRemovals ? "Confirm the removals first" : null} onClick={() => decide.mutate("approve")}>
                  {target.kind === "new" ? "Approve & create draft" : "Approve & save draft"}
                </Button>
                <Button variant="ghost" loading={decide.isPending && decide.variables === "reject"} onClick={() => decide.mutate("reject")}>
                  Reject
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </aside>
  );
}
