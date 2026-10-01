"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Input, Button, Card } from "@/components/ui";
import { intlLocale } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { api } from "@/lib/api";

export type HelpTopic = "question_reason" | "plan_cost" | "result_checks" | "advanced";

interface Metrics {
  timeToPlanPreviewS: number | null;
  questionsToPreview: number | null;
  editsBeforeFirstAcceptedResult: number | null;
  connectionsRequired: number | null;
  timeToFirstVerifiedResultS: number | null;
  activeUserTimeS: number;
  systemWaitingTimeS: number;
  externalOnboardingDelayMin: number;
  supportTimeMin: number;
  helpOpened: number;
  cost: { aiReportedUsd: number; platformCharges: number | null; supportEffortMin: number };
  results: { accepted: number; rejected: number; notJudged: number };
  reusedFollowingWeek: boolean | "pending" | null;
}

const TICK_MS = 30_000;
const IDLE_MS = 60_000;

/** No UI. While the person is actually active (visible tab + recent input) it reports bounded active-time slices. */
export function ExperimentTracker({ base, sessionId, enabled }: { base: string; sessionId: string; enabled: boolean }) {
  const last = useRef({ activity: 0, tick: 0 });
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    last.current = { activity: now, tick: now };
    const mark = () => {
      last.current.activity = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll"] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true });
    const id = window.setInterval(() => {
      const n = Date.now();
      const elapsed = Math.min(60, Math.round((n - last.current.tick) / 1000));
      last.current.tick = n;
      if (document.visibilityState !== "visible" || n - last.current.activity > IDLE_MS || elapsed < 1) return;
      api(`${base}/sessions/${sessionId}/experiment/events`, { method: "POST", json: { kind: "active_time", seconds: elapsed } }).catch(() => {});
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      for (const e of events) window.removeEventListener(e, mark);
    };
  }, [base, sessionId, enabled]);
  return null;
}

/** Fire-and-forget help-opened event (experiment mode only; the server ignores it otherwise). */
export function reportHelp(base: string, sessionId: string, topic: HelpTopic) {
  api(`${base}/sessions/${sessionId}/experiment/events`, { method: "POST", json: { kind: "help_opened", topic } }).catch(() => {});
}

export function ExperimentPanel({ base, sessionId, refreshKey }: { base: string; sessionId: string; refreshKey: string }) {
  const t = useT();
  const locale = useLocale();
  const qc = useQueryClient();
  const nf = new Intl.NumberFormat(intlLocale(locale));
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const q = useQuery({ queryKey: ["cb-experiment", sessionId, refreshKey], queryFn: () => api<{ metrics: Metrics }>(`${base}/sessions/${sessionId}/experiment`) });
  const m = q.data?.metrics;
  const notYet = t("companyBuilder.experiment.notYet");
  const dur = (s: number | null) => {
    if (s == null) return notYet;
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return t("companyBuilder.experiment.duration", { m: nf.format(mm), s: nf.format(ss) });
  };
  const mins = (n: number) => `${nf.format(n)} ${t("companyBuilder.experiment.minutes")}`;
  const num = (n: number | null) => (n == null ? notYet : nf.format(n));
  const reuse = m?.reusedFollowingWeek === true ? t("companyBuilder.trial.yes") : m?.reusedFollowingWeek === false ? t("companyBuilder.trial.no") : notYet;
  const rows: [string, string][] = m
    ? [
        [t("companyBuilder.experiment.toPreview"), dur(m.timeToPlanPreviewS)],
        [t("companyBuilder.experiment.questions"), num(m.questionsToPreview)],
        [t("companyBuilder.experiment.edits"), num(m.editsBeforeFirstAcceptedResult)],
        [t("companyBuilder.experiment.connections"), num(m.connectionsRequired)],
        [t("companyBuilder.experiment.toVerified"), dur(m.timeToFirstVerifiedResultS)],
        [t("companyBuilder.experiment.activeTime"), dur(m.activeUserTimeS)],
        [t("companyBuilder.experiment.waiting"), dur(m.systemWaitingTimeS)],
        [t("companyBuilder.experiment.external"), mins(m.externalOnboardingDelayMin)],
        [t("companyBuilder.experiment.support"), mins(m.supportTimeMin)],
        [t("companyBuilder.experiment.cost"), new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(m.cost.aiReportedUsd)],
        [t("companyBuilder.experiment.acceptance"), `${nf.format(m.results.accepted)} / ${nf.format(m.results.rejected)}`],
        [t("companyBuilder.experiment.reuse"), reuse],
      ]
    : [];
  const save = async () => {
    const n = Math.round(Number(minutes));
    if (!Number.isFinite(n) || n < 1 || n > 1440) return;
    setSaving(true);
    try {
      await api(`${base}/sessions/${sessionId}/experiment/effort`, { method: "POST", json: { kind: "support", minutes: n } });
      setMinutes("");
      await qc.invalidateQueries({ queryKey: ["cb-experiment", sessionId] });
    } catch {
      /* ignored: experiment-only tooling */
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="cb-experiment">
      <h2 className="text-base font-semibold text-hi">{t("companyBuilder.experiment.heading")}</h2>
      <p className="text-sm text-muted">{t("companyBuilder.experiment.note")}</p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-med">{t("companyBuilder.experiment.logSupport")}</span>
          <Input type="number" min={1} max={1440} step={1} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-28 rounded-md border border-line bg-app px-2 py-1" data-testid="cb-experiment-support-minutes" />
        </label>
        <span className="pb-1.5 text-sm text-muted">{t("companyBuilder.experiment.minutes")}</span>
        <Button size="sm" variant="secondary" onClick={save} loading={saving} disabled={minutes.trim() === ""} data-testid="cb-experiment-support-save">
          {t("companyBuilder.experiment.save")}
        </Button>
      </div>
    </Card>
  );
}
