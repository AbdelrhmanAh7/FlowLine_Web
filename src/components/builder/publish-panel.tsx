"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";
import { api, ApiError } from "@/lib/api";
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
  const t = useT();
  const toast = useToast();
  const state = usePublishState(flowId);
  const [panel, setPanel] = useState(false);
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty && !(await saveNow())) throw new ApiError(0, "SAVE_FAILED", t("publish.saveFirst"));
      return api<PublishResult>(`/api/flows/${flowId}/publish`, { method: "POST" });
    },
    onSuccess: (r) => {
      toast(t("publish.published", { version: r.version }), "success");
      if (r.webhook?.secret) setSecret({ url: r.webhook.url, secret: r.webhook.secret });
      setPanel(true);
      void qc.invalidateQueries({ queryKey: ["publish", flowId] });
    },
    onError: (e) => {
      const err = e as ApiError;
      const details = Array.isArray(err.details) ? `: ${(err.details as { message: string }[]).slice(0, 2).map((d) => d.message).join("; ")}` : "";
      toast(`${apiErrorMessage(t, err)}${details}`, "danger");
    },
  });
  const published = Boolean(state.data?.publishedVersionId);
  const reason = !canEdit ? t("publish.viewer") : !online ? t("publish.offline") : issueCount > 0 ? t.plural("publish.issues", issueCount) : null;
  return (
    <>
      <span className="flex items-center gap-2 text-sm">
        {state.data?.pausedReason ? (
          <span className="text-warning">{t("publish.paused")}</span>
        ) : published ? (
          <button className="text-success hover:underline" onClick={() => setPanel(true)} data-testid="publish-state">
            {t("publish.publishedState")}
            {dirty ? t("publish.draftChanges") : ""}
          </button>
        ) : (
          <span className="text-muted" data-testid="publish-state">
            {t("publish.notPublished")}
          </span>
        )}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setPanel(true)} disabledReason={published ? null : t("publish.triggersReason")}>
        {t("publish.triggers")}
      </Button>
      <Button size="sm" onClick={() => publish.mutate()} loading={publish.isPending} disabledReason={reason}>
        {published ? t("publish.publishChanges") : t("publish.publish")}
      </Button>
      {panel && <TriggerPanel flowId={flowId} state={state.data} secret={secret} onSecret={setSecret} onClose={() => setPanel(false)} canEdit={canEdit} />}
    </>
  );
}

function TriggerPanel({ flowId, state, secret, onSecret, onClose, canEdit }: { flowId: string; state?: TriggerState; secret: { url: string; secret: string } | null; onSecret: (s: { url: string; secret: string } | null) => void; onClose: () => void; canEdit: boolean }) {
  const toast = useToast();
  const t = useT();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const rotate = useMutation({
    mutationFn: () => api<{ url: string; secret: string }>(`/api/flows/${flowId}/webhook/rotate`, { method: "POST" }),
    onSuccess: (r) => {
      onSecret(r);
      setConfirmRotate(false);
      toast(t("publish.rotated"), "info");
    },
  });
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast(t("publish.copied"), "info"));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label={t("publish.closeTriggers")} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="trig-title" className="relative max-h-[90vh] w-full max-w-xl animate-fade-in overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-popover)]">
        <div className="flex items-center justify-between">
          <h2 id="trig-title" className="text-lg font-semibold">
            {t("publish.triggers")}
          </h2>
          <button onClick={onClose} aria-label={t("publish.close")} className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
            ✕
          </button>
        </div>
        {state?.pausedReason && (
          <p role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
            {t("publish.pausedAlert")}
          </p>
        )}
        {!state?.webhook && !state?.schedule && <p className="mt-3 text-base text-med">{t("publish.manualOnly")}</p>}
        {state?.webhook && (
          <section className="mt-4 flex flex-col gap-3">
            <h3 className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{state.webhook.active ? t("publish.webhookActive") : t("publish.webhookInactive")}</h3>
            <div className="flex items-center gap-2">
              <code className="data min-w-0 flex-1 truncate rounded-md border border-line bg-app px-2 py-1.5 text-sm" data-testid="webhook-url">
                {state.webhook.url}
              </code>
              <Button size="sm" onClick={() => copy(state.webhook!.url)}>
                {t("publish.copy")}
              </Button>
            </div>
            {secret ? (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
                <p className="text-sm text-warning">{t("publish.secretOnce")}</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="data min-w-0 flex-1 truncate text-sm" data-testid="webhook-secret">
                    {secret.secret}
                  </code>
                  <Button size="sm" onClick={() => copy(secret.secret)}>
                    {t("publish.copy")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("publish.secretLost")}</p>
            )}
            <details className="text-sm text-med">
              <summary className="cursor-pointer hover:text-hi">{t("publish.howToSign")}</summary>
              <p className="mt-2">
                {t.rich("publish.signBody", {
                  post: <code className="data">POST</code>,
                  eventHeader: (
                    <code className="data" dir="ltr">
                      x-flowline-event-id: &lt;unique id&gt;
                    </code>
                  ),
                  sigHeader: (
                    <code className="data" dir="ltr">
                      x-flowline-signature: t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256(secret, t + &quot;.&quot; + event id + &quot;.&quot; + raw body)&gt;
                    </code>
                  ),
                })}
              </p>
            </details>
            {canEdit &&
              (confirmRotate ? (
                <Button size="sm" variant="danger" className="self-start" loading={rotate.isPending} onClick={() => rotate.mutate()}>
                  {t("publish.confirmRotate")}
                </Button>
              ) : (
                <Button size="sm" className="self-start" onClick={() => setConfirmRotate(true)}>
                  {t("publish.rotate")}
                </Button>
              ))}
            {state.webhook.recentEvents.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium tracking-[0.4px] text-muted uppercase">{t("publish.recent")}</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {state.webhook.recentEvents.slice(-8).reverse().map((e) => (
                    <li key={e.eventId} className="flex gap-2">
                      <span className="data truncate text-med">{e.eventId}</span>
                      <span className={cx(e.status === "accepted" ? "text-success" : "text-warning")}>{t.has(`publish.eventStatus.${e.status}`) ? t(`publish.eventStatus.${e.status}` as MessageKey) : e.status}</span>
                      <span className="ms-auto text-muted">{t.relative(e.receivedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {state?.schedule && (
          <section className="mt-5 flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{state.schedule.active ? t("publish.scheduleActive") : t("publish.scheduleInactive")}</h3>
            <p className="text-base">
              {t.rich("publish.scheduleLine", {
                cron: (
                  <code className="data" dir="ltr">
                    {state.schedule.cron}
                  </code>
                ),
                tz: (
                  <span className="data" dir="ltr">
                    {state.schedule.timezone}
                  </span>
                ),
                policy: t.has(`publish.missedPolicy.${state.schedule.missedPolicy}`)
                  ? t(`publish.missedPolicy.${state.schedule.missedPolicy}` as MessageKey)
                  : state.schedule.missedPolicy.replace("_", " "),
              })}
            </p>
            {state.schedule.nextFireAt && (
              <p className="text-sm text-med" data-testid="next-fire">
                {t("publish.nextRun", {
                  // English keeps its day-month-year format; Arabic uses the app's Arabic locale with Western digits.
                  date: new Intl.DateTimeFormat(t.locale === "en" ? "en-GB" : intlLocale(t.locale), { timeZone: state.schedule.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(state.schedule.nextFireAt)),
                  tz: state.schedule.timezone,
                })}
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
  const t = useT();
  const state = usePublishState(flowId);
  if (!state.data?.pausedReason) return null;
  return (
    <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
      {t("publish.pausedBanner")}
      <Link href={`/w/${workspace.slug}/integrations`} className="font-medium underline">
        {t("publish.reconnect")} <span aria-hidden className="flip-rtl">→</span>
      </Link>
    </div>
  );
}
