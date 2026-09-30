"use client";

import Link from "next/link";
import type { CompanyBlueprint, TaskPlan } from "@/company-builder/model";
import { Badge, Button, Card, StatusBadge, type Tone } from "@/components/ui";
import { useLocale, useT } from "@/i18n/client";
import type { Translator } from "@/i18n/translate";
import { cbt, fieldLabel } from "./text";
import type { Overview, TaskView } from "./types";

const STATE_TONE: Record<string, Tone> = { plan_draft: "muted", requires_setup: "warning", sample_verified: "info", live_verified: "success", approval_required: "warning", active: "success", paused: "muted", failed: "danger" };

const SERVICE: Record<string, string> = { gmail: "Gmail", google_sheets: "Google Sheets", slack: "Slack", ai: "AI" };

export function blockerText(t: Translator, b: CompanyBlueprint["blockers"][number]) {
  const params: Record<string, string> = { ...b.params };
  if (params.fact) params.fact = fieldLabel(t, params.fact);
  if (params.output) params.output = cbt(t, `opt.${params.output}`, undefined, params.output);
  if (params.tool) params.tool = params.tool.slice(0, 80);
  return cbt(t, `blocker.${b.code}`, params);
}

function TaskDetails({ task, capabilities }: { task: TaskPlan; capabilities: string[] }) {
  const t = useT();
  const taskName = cbt(t, `task.${task.id}.name`);
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
      <dt className="text-muted">{t("companyBuilder.label.does")}</dt>
      <dd>{cbt(t, `task.${task.id}.does`)}</dd>
      <dt className="text-muted">{t("companyBuilder.label.kind")}</dt>
      <dd>
        {task.kind === "agent" ? t("companyBuilder.label.agent") : t("companyBuilder.label.workflow")} — {cbt(t, `justification.${task.justification}`)}
      </dd>
      <dt className="text-muted">{t("companyBuilder.label.trigger")}</dt>
      <dd>
        {cbt(t, `triggerKind.${task.trigger.kind}`)} · {cbt(t, `triggerStatus.${task.trigger.status}`)}
      </dd>
      <dt className="text-muted">{t("companyBuilder.label.access")}</dt>
      <dd>
        {task.connections.length === 0
          ? "—"
          : task.connections.map((c) => (
              <span key={c.provider} className="block">
                {c.status === "connected" ? t("companyBuilder.connectionConnected", { service: SERVICE[c.provider] ?? c.provider }) : t("companyBuilder.connectionNeeded", { service: SERVICE[c.provider] ?? c.provider, task: taskName })}
              </span>
            ))}
      </dd>
      <dt className="text-muted">{t("companyBuilder.label.reviewer")}</dt>
      <dd>{cbt(t, `reviewerRole.${task.reviewer}`)}</dd>
      <dt className="text-muted">{t("companyBuilder.label.usage")}</dt>
      <dd>{cbt(t, `usage.${task.usage}`)}</dd>
      {capabilities.length > 0 && (
        <>
          <dt className="text-muted">{t("companyBuilder.label.capabilities")}</dt>
          <dd>{capabilities.map((c) => cbt(t, `capability.${c}`)).join(" · ")}</dd>
        </>
      )}
      {task.unavailable.length > 0 && (
        <>
          <dt className="text-muted">{t("companyBuilder.label.unavailable")}</dt>
          <dd>{task.unavailable.map((c) => cbt(t, `unavailableCap.${c}`)).join(" · ")}</dd>
        </>
      )}
      <dt className="text-muted" />
      <dd className="text-muted">{t("companyBuilder.label.limits", { items: task.limits.maxItemsPerRun, runs: task.limits.maxRunsPerDay })}</dd>
    </dl>
  );
}

export function PlanPanel({
  data,
  canEdit,
  busy,
  onGenerate,
  onApprove,
  onInstall,
  onCancelInstall,
}: {
  data: Overview;
  canEdit: boolean;
  busy: string | null;
  onGenerate: () => void;
  onApprove: () => void;
  onInstall: () => void;
  onCancelInstall: () => void;
}) {
  const t = useT();
  const sep = useLocale() === "ar" ? "، " : ", ";
  const bp = data.blueprint;
  const inst = data.installation;
  const viewOnly = canEdit ? null : t("companyBuilder.disabledViewer");
  if (!bp) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <Button variant="primary" onClick={onGenerate} loading={busy === "generate"} disabledReason={viewOnly} data-testid="cb-generate">
          {data.session.readiness.complete ? t("companyBuilder.interview.showPlan") : t("companyBuilder.interview.showPartialPlan")}
        </Button>
      </Card>
    );
  }
  const body = bp.body;
  const operational = body.tasks.filter((x) => x.availability === "operational");
  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="cb-plan" data-plan-version={bp.version}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-hi" id="cb-plan-heading" tabIndex={-1}>
          {body.complete ? t("companyBuilder.plan.ready") : t("companyBuilder.plan.partial")}
        </h2>
        <Badge tone="muted">{t("companyBuilder.plan.version", { version: bp.version })}</Badge>
        {bp.status === "approved" && <StatusBadge tone="success">{t("companyBuilder.plan.approved")}</StatusBadge>}
      </div>
      <p className="rounded-md bg-elevated px-3 py-2 text-sm text-hi" data-testid="cb-draft-notice">
        {t("companyBuilder.plan.draftNotice")}
      </p>
      <p className="text-sm text-muted">{cbt(t, `plan.generator.${bp.generator}`)}</p>
      {body.sampleData && <p className="text-sm text-med">{t("companyBuilder.plan.sampleData")}</p>}
      {bp.diff && (
        <div className="text-sm text-med" data-testid="cb-diff">
          <p className="font-medium text-hi">{t("companyBuilder.plan.diffHeading")}</p>
          {bp.diff.addedTasks.length + bp.diff.removedTasks.length + bp.diff.changedTasks.length === 0 && <p>{t("companyBuilder.plan.diffNone")}</p>}
          {bp.diff.addedTasks.length > 0 && <p>{t("companyBuilder.plan.diffAdded", { list: bp.diff.addedTasks.map((x) => cbt(t, `task.${x}.name`)).join(sep) })}</p>}
          {bp.diff.removedTasks.length > 0 && <p>{t("companyBuilder.plan.diffRemoved", { list: bp.diff.removedTasks.map((x) => cbt(t, `task.${x}.name`)).join(sep) })}</p>}
          {bp.diff.changedTasks.length > 0 && <p>{t("companyBuilder.plan.diffChanged", { list: bp.diff.changedTasks.map((x) => cbt(t, `task.${x}.name`)).join(sep) })}</p>}
        </div>
      )}

      {body.blockers.length > 0 && (
        <section aria-labelledby="cb-blockers">
          <h3 id="cb-blockers" className="text-base font-semibold text-hi">
            {t("companyBuilder.plan.blockersHeading")}
          </h3>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-med" data-testid="cb-blockers">
            {body.blockers.map((b, i) => (
              <li key={i} data-blocker={b.code}>
                {blockerText(t, b)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cb-roles" className="flex flex-col gap-3">
        <h3 id="cb-roles" className="text-base font-semibold text-hi">
          {t("companyBuilder.plan.rolesHeading")}
        </h3>
        {body.roles.length === 0 && <p className="text-sm text-muted">{t("companyBuilder.plan.noTasks")}</p>}
        {body.roles.map((role) => (
          <div key={role.id} className="rounded-lg border border-line p-3" data-role={role.id}>
            <p className="font-semibold">{cbt(t, `role.${role.id}.name`)}</p>
            <ul className="mt-2 flex flex-col gap-3">
              {role.tasks.map((tid) => {
                const task = body.tasks.find((x) => x.id === tid)!;
                return (
                  <li key={tid} className="flex flex-col gap-2" data-task={tid}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-hi">{cbt(t, `task.${tid}.name`)}</span>
                      {task.availability !== "operational" && <StatusBadge tone="muted">{cbt(t, task.availability === "planned" ? "reason.planned_not_operational" : "reason.not_supported")}</StatusBadge>}
                    </div>
                    <TaskDetails task={task} capabilities={data.tasks.find((x) => x.task.id === tid)?.capabilities ?? []} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onGenerate} loading={busy === "generate"} disabledReason={viewOnly} data-testid="cb-regenerate">
          {t("companyBuilder.plan.regenerate")}
        </Button>
        {bp.status === "review_required" && (
          <Button variant="primary" onClick={onApprove} loading={busy === "approve"} disabledReason={viewOnly ?? (operational.length === 0 ? t("companyBuilder.plan.noTasks") : null)} data-testid="cb-approve">
            {t("companyBuilder.plan.approve")}
          </Button>
        )}
        {bp.status === "approved" && inst?.status !== "installed" && (
          <Button variant="primary" onClick={onInstall} loading={busy === "install" || inst?.status === "installing"} disabledReason={viewOnly} data-testid="cb-install">
            {t("companyBuilder.plan.install")}
          </Button>
        )}
        {inst?.status === "installing" && (
          <Button variant="ghost" onClick={onCancelInstall} data-testid="cb-cancel-install">
            {t("companyBuilder.plan.cancelInstall")}
          </Button>
        )}
      </div>
      <div aria-live="polite" className="text-sm">
        {inst?.status === "installed" && <p className="text-success" data-testid="cb-installed">{t("companyBuilder.plan.installed")}</p>}
        {inst?.status === "failed" && <p className="text-danger">{t("companyBuilder.plan.installFailed")}</p>}
        {inst?.status === "cancelled" && <p className="text-warning">{t("companyBuilder.plan.installCancelled")}</p>}
      </div>
    </Card>
  );
}

export function TaskCard({ view, slug, canRun, busy, onTry, onSendForReview, onActivate, onPause }: { view: TaskView; slug: string; canRun: boolean; busy: string | null; onTry: () => void; onSendForReview: (trialId: string) => void; onActivate: () => void; onPause: () => void }) {
  const t = useT();
  const { task, status, trial } = view;
  const v = trial?.verdict ?? null;
  const running = trial?.status === "running";
  const output = trial?.output ?? null;
  const hasProposal = Boolean(output && ((output.reply_draft as object | undefined) || (output.ledger_draft as object | undefined) || ((output.discrepancy_review as { ledger_rows?: unknown[] } | undefined)?.ledger_rows?.length ?? 0) > 0 || (output.content_draft as object | undefined)));
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid={`cb-task-${task.id}`} data-state={status.state}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-hi">{cbt(t, `task.${task.id}.name`)}</h3>
        <StatusBadge tone={STATE_TONE[status.state] ?? "muted"}>{cbt(t, `state.${status.state}`)}</StatusBadge>
      </div>
      {status.reasons.length > 0 && <p className="text-sm text-med">{status.reasons.map((r) => cbt(t, `reason.${r}`)).join(" · ")}</p>}
      <div className="flex flex-wrap gap-3 text-sm">
        {view.flow && (
          <Link href={`/w/${slug}/flows/${view.flow.id}`} className="text-accent-text hover:underline" data-testid={`cb-open-flow-${task.id}`}>
            {t("companyBuilder.open.flow")}
          </Link>
        )}
        {view.agent && (
          <Link href={`/w/${slug}/agents/${view.agent.id}`} className="text-accent-text hover:underline" data-testid={`cb-open-agent-${task.id}`}>
            {t("companyBuilder.open.agent")}
          </Link>
        )}
        {view.flow?.edited && <span className="text-muted">{t("companyBuilder.open.edited")}</span>}
        {(view.flow?.origin === "reused" || view.agent?.origin === "reused") && <span className="text-muted">{t("companyBuilder.open.reused")}</span>}
      </div>

      {status.canTry && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={trial ? "secondary" : "primary"} onClick={onTry} loading={busy === `try:${task.id}` || running} disabledReason={canRun ? null : t("companyBuilder.errors.FORBIDDEN")} data-testid={`cb-try-${task.id}`}>
              {trial ? t("companyBuilder.trial.tryAgain") : t("companyBuilder.trial.try")}
            </Button>
            <span className="text-xs text-muted">{t("companyBuilder.trial.sampleNotice")}</span>
          </div>
          {running && (
            <p aria-live="polite" className="text-sm text-muted">
              {t("companyBuilder.trial.running")}
            </p>
          )}
          {trial && v && (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3" data-testid={`cb-trial-${task.id}`} data-matched={String(v.matchedOutcome)}>
              <p className="text-sm font-medium text-hi" aria-live="polite">
                {t("companyBuilder.trial.finished")}
              </p>
              <ul className="grid gap-1 text-sm sm:grid-cols-3">
                <li>
                  {t("companyBuilder.trial.structurallyValid")}: {v.structurallyValid ? t("companyBuilder.trial.yes") : t("companyBuilder.trial.no")}
                </li>
                <li>
                  {t("companyBuilder.trial.ranWithoutErrors")}: {v.ranWithoutErrors ? t("companyBuilder.trial.yes") : t("companyBuilder.trial.no")}
                </li>
                <li>
                  {t("companyBuilder.trial.matchedOutcome")}: {v.matchedOutcome ? t("companyBuilder.trial.yes") : t("companyBuilder.trial.no")}
                </li>
              </ul>
              {!v.matchedOutcome && <p className="text-sm text-danger">{t("companyBuilder.trial.notMatched")}</p>}
              <ul className="flex flex-col gap-0.5 text-xs text-med">
                {v.checks.map((c) => (
                  <li key={c.id}>
                    {c.passed ? "✓" : "✗"} {cbt(t, `trial.check.${c.id}`)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">{cbt(t, `trial.provenance.${trial.provenance}`)}</p>
              {output && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-accent-text">{t("companyBuilder.trial.output")}</summary>
                  <pre dir="ltr" className="mt-1 max-h-64 overflow-auto rounded-md bg-app p-2 text-xs whitespace-pre-wrap">
                    {JSON.stringify(output, null, 2)}
                  </pre>
                </details>
              )}
              {trial.runId && (
                <Link href={`/w/${slug}/runs?run=${trial.runId}`} className="text-sm text-accent-text hover:underline">
                  {trial.runNumber != null ? t("companyBuilder.trial.run", { number: trial.runNumber }) : t("companyBuilder.trial.openRun")}
                </Link>
              )}
              {v.ranWithoutErrors &&
                (hasProposal ? (
                  <Button size="sm" variant="secondary" onClick={() => onSendForReview(trial.id)} loading={busy === `review:${trial.id}`} disabledReason={canRun ? null : t("companyBuilder.errors.FORBIDDEN")} data-testid={`cb-send-review-${task.id}`}>
                    {t("companyBuilder.trial.sendForReview")}
                  </Button>
                ) : (
                  <p className="text-sm text-muted">{t("companyBuilder.trial.nothingToSend")}</p>
                ))}
            </div>
          )}
        </div>
      )}

      {(status.canRequestActivation || status.state === "active") && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            {status.canRequestActivation && (
              <Button size="sm" variant="secondary" onClick={onActivate} loading={busy === `activate:${task.id}`} disabledReason={canRun ? null : t("companyBuilder.errors.FORBIDDEN")} data-testid={`cb-activate-${task.id}`}>
                {t("companyBuilder.activation.request")}
              </Button>
            )}
            {status.state === "active" && (
              <Button size="sm" variant="ghost" onClick={onPause} loading={busy === `pause:${task.id}`} data-testid={`cb-pause-${task.id}`}>
                {t("companyBuilder.activation.pause")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">{t("companyBuilder.activation.note")}</p>
        </div>
      )}
    </Card>
  );
}
