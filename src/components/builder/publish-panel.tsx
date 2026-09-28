"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useWorkspace } from "../shell/workspace-context";
import { useToast } from "../toast";
import { Button, cx } from "../ui";

interface TriggerState {
  publishedVersionId: string | null;
  pausedReason: string | null;
  webhook: { url: string; active: boolean; rotatedAt: string | null; recentEvents: { eventId: string; status: string; receivedAt: string; runId: string | null; detail: string | null }[] } | null;
  schedule: { cron: string; timezone: string; missedPolicy: string; active: boolean; nextFireAt: string | null; lastFireAt: string | null } | null;
}

interface PublishResult {
  version: number;
  trigger: string;
  webhook: { url: string; secret?: string } | null;
  schedule: { cron: string; timezone: string; nextFireAt: string } | null;
}

export function usePublishState(flowId: string) {
  return useQuery({ queryKey: ["publish", flowId], queryFn: () => api<TriggerState>(`/api/flows/${flowId}/publish`), refetchInterval: 20_000 });
}

/** Header control: publish state + button, and the trigger panel. */
export function PublishControl({ flowId, canEdit, dirty, saveNow, issueCount, online }: { flowId: string; canEdit: boolean; dirty: boolean; saveNow: () => Promise<boolean>; issueCount: number; online: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const state = usePublishState(flowId);
  const [panel, setPanel] = useState(false);
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty && !(await saveNow())) throw new ApiError(0, "SAVE_FAILED", "Couldn't save your latest changes first");
      return api<PublishResult>(`/api/flows/${flowId}/publish`, { method: "POST" });
    },
    onSuccess: (r) => {
      toast(`Published v${r.version}`, "success");
      if (r.webhook?.secret) setSecret({ url: r.webhook.url, secret: r.webhook.secret });
      setPanel(true);
      void qc.invalidateQueries({ queryKey: ["publish", flowId] });
    },
    onError: (e) => {
      const err = e as ApiError;
      const details = Array.isArray(err.details) ? `: ${(err.details as { message: string }[]).slice(0, 2).map((d) => d.message).join("; ")}` : "";
      toast(`${err.message}${details}`, "danger");
    },
  });
  const published = Boolean(state.data?.publishedVersionId);
  const reason = !canEdit ? "Viewers can't publish" : !online ? "You're offline" : issueCount > 0 ? `Fix ${issueCount} issue${issueCount > 1 ? "s" : ""} before publishing` : null;
  return (
    <>
      <span className="flex items-center gap-2 text-sm">
        {state.data?.pausedReason ? (
          <span className="text-warning">● Paused</span>
        ) : published ? (
          <button className="text-success hover:underline" onClick={() => setPanel(true)} data-testid="publish-state">
            ● Published{dirty ? " · draft changes" : ""}
          </button>
        ) : (
          <span className="text-muted" data-testid="publish-state">
            Not published
          </span>
        )}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setPanel(true)} disabledReason={published ? null : "Publish to activate webhook/schedule triggers"}>
        Triggers
      </Button>
      <Button size="sm" onClick={() => publish.mutate()} loading={publish.isPending} disabledReason={reason}>
        {published ? "Publish changes" : "Publish"}
      </Button>
      {panel && <TriggerPanel flowId={flowId} state={state.data} secret={secret} onSecret={setSecret} onClose={() => setPanel(false)} canEdit={canEdit} />}
    </>
  );
}

function TriggerPanel({ flowId, state, secret, onSecret, onClose, canEdit }: { flowId: string; state?: TriggerState; secret: { url: string; secret: string } | null; onSecret: (s: { url: string; secret: string } | null) => void; onClose: () => void; canEdit: boolean }) {
  const toast = useToast();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const rotate = useMutation({
    mutationFn: () => api<{ url: string; secret: string }>(`/api/flows/${flowId}/webhook/rotate`, { method: "POST" }),
    onSuccess: (r) => {
      onSecret(r);
      setConfirmRotate(false);
      toast("New signing secret issued — the old one no longer works", "info");
    },
  });
  const copy = (t: string) => void navigator.clipboard?.writeText(t).then(() => toast("Copied", "info"));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close triggers" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="trig-title" className="relative max-h-[90vh] w-full max-w-xl animate-fade-in overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-popover)]">
        <div className="flex items-center justify-between">
          <h2 id="trig-title" className="text-lg font-semibold">
            Triggers
          </h2>
          <button onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
            ✕
          </button>
        </div>
        {state?.pausedReason && (
          <p role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
            Paused: a connection this flow uses needs attention. Webhook events are recorded but not run, and scheduled times are skipped until it&apos;s reconnected. Nothing catches up automatically.
          </p>
        )}
        {!state?.webhook && !state?.schedule && <p className="mt-3 text-base text-med">This flow runs manually. Use a Webhook or Schedule trigger, then publish, to run it automatically.</p>}
        {state?.webhook && (
          <section className="mt-4 flex flex-col gap-3">
            <h3 className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Webhook {state.webhook.active ? "· active" : "· inactive"}</h3>
            <div className="flex items-center gap-2">
              <code className="data min-w-0 flex-1 truncate rounded-md border border-line bg-app px-2 py-1.5 text-sm" data-testid="webhook-url">
                {state.webhook.url}
              </code>
              <Button size="sm" onClick={() => copy(state.webhook!.url)}>
                Copy
              </Button>
            </div>
            {secret ? (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
                <p className="text-sm text-warning">Signing secret — shown once. Store it in the sending system now.</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="data min-w-0 flex-1 truncate text-sm" data-testid="webhook-secret">
                    {secret.secret}
                  </code>
                  <Button size="sm" onClick={() => copy(secret.secret)}>
                    Copy
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">The signing secret was shown when it was created. Lost it? Rotate to issue a new one.</p>
            )}
            <details className="text-sm text-med">
              <summary className="cursor-pointer hover:text-hi">How to sign requests</summary>
              <p className="mt-2">
                Send <code className="data">POST</code> with headers <code className="data">x-flowline-event-id: &lt;unique id&gt;</code> and <code className="data">x-flowline-signature: t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256(secret, t + &quot;.&quot; + event id + &quot;.&quot; + raw body)&gt;</code>. Requests older than 5 minutes or reusing an event id with a different body are rejected; a repeated event id returns the original run.
              </p>
            </details>
            {canEdit &&
              (confirmRotate ? (
                <Button size="sm" variant="danger" className="self-start" loading={rotate.isPending} onClick={() => rotate.mutate()}>
                  Confirm: rotate secret
                </Button>
              ) : (
                <Button size="sm" className="self-start" onClick={() => setConfirmRotate(true)}>
                  Rotate secret
                </Button>
              ))}
            {state.webhook.recentEvents.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium tracking-[0.4px] text-muted uppercase">Recent deliveries</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {state.webhook.recentEvents.slice(-8).reverse().map((e) => (
                    <li key={e.eventId} className="flex gap-2">
                      <span className="data truncate text-med">{e.eventId}</span>
                      <span className={cx(e.status === "accepted" ? "text-success" : "text-warning")}>{e.status}</span>
                      <span className="ms-auto text-muted">{timeAgo(e.receivedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {state?.schedule && (
          <section className="mt-5 flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-[0.4px] text-muted uppercase">Schedule {state.schedule.active ? "· active" : "· inactive"}</h3>
            <p className="text-base">
              <code className="data">{state.schedule.cron}</code> in <span className="data">{state.schedule.timezone}</span> · missed runs: {state.schedule.missedPolicy.replace("_", " ")}
            </p>
            {state.schedule.nextFireAt && (
              <p className="text-sm text-med" data-testid="next-fire">
                Next run: {new Intl.DateTimeFormat("en-GB", { timeZone: state.schedule.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(state.schedule.nextFireAt))} ({state.schedule.timezone})
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export function PausedBanner({ flowId }: { flowId: string }) {
  const { workspace } = useWorkspace();
  const state = usePublishState(flowId);
  if (!state.data?.pausedReason) return null;
  return (
    <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
      ⚠ This flow is paused because a connection it uses needs to be reconnected. Other flows keep running.
      <Link href={`/w/${workspace.slug}/integrations`} className="font-medium underline">
        Reconnect in Integrations <span aria-hidden className="flip-rtl">→</span>
      </Link>
    </div>
  );
}
