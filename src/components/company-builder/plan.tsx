"use client";

import Link from "next/link";
import { useState } from "react";
import type { MessageKey } from "@/i18n/types";
import type { CompanyBlueprint, TaskPlan } from "@/company-builder/model";
import { Badge, Button, Card, StatusBadge, type Tone } from "@/components/ui";
import { useLocale, useT } from "@/i18n/client";
import type { Translator } from "@/i18n/translate";
import { FollowUpResult } from "./result";
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

const SETUP_OUT = /not_supported|unverified|planned_only|needs_digital_copy/;
const isSetupBlocker = (b: CompanyBlueprint["blockers"][number]) => !SETUP_OUT.test(b.code);

const Section = ({ name, heading, children }: { name: string; heading: string; children: React.ReactNode }) => (
  <section aria-label={heading} className="flex flex-col gap-1" data-testid={`cb-plan-section-${name}`}>
    <h3 className="text-sm font-semibold text-hi">{heading}</h3>
    {children}
  </section>
);

function TechnicalDetails({ task, capabilities, onHelp }: { task: TaskPlan; capabilities: string[]; onHelp?: () => void }) {
  const t = useT();
  return (
    <details className="text-sm" onToggle={(e) => e.currentTarget.open && onHelp?.()} data-testid={`cb-technical-${task.id}`}>
      <summary className="cursor-pointer text-accent-text">{t("companyBuilder.trial.technical")}</summary>
      <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted">{t("companyBuilder.label.kind")}</dt>
        <dd>
          {task.kind === "agent" ? t("companyBuilder.label.agent") : t("companyBuilder.label.workflow")} — {cbt(t, `justification.${task.justification}`)}
        </dd>
        <dt className="text-muted">{t("companyBuilder.label.usage")}</dt>
        <dd>{cbt(t, `usage.${task.usage}`)}</dd>
        {capabilities.length > 0 && (
          <>
            <dt className="text-muted">{t("companyBuilder.label.capabilities")}</dt>
            <dd>{capabilities.map((c) => cbt(t, `capability.${c}`)).join(" · ")}</dd>
          </>
        )}
        {typeof task.params.modelNote === "string" && task.params.modelNote && (
          <>
            <dt className="text-muted">{t("companyBuilder.label.modelNote")}</dt>
            <dd dir="auto" className="text-med italic">
              {task.params.modelNote}
            </dd>
          </>
        )}
        <dt className="text-muted" />
        <dd className="text-muted">{t("companyBuilder.label.limits", { items: task.limits.maxItemsPerRun, runs: task.limits.maxRunsPerDay })}</dd>
      </dl>
    </details>
  );
}

function TaskDetails({ task, capabilities, onHelp }: { task: TaskPlan; capabilities: string[]; onHelp?: () => void }) {
  const t = useT();
  const taskName = cbt(t, `task.${task.id}.name`);
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted">{t("companyBuilder.label.does")}</dt>
        <dd>{cbt(t, `task.${task.id}.does`)}</dd>
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
                  {c.provider !== "ai" && <span className="block text-muted">{t("companyBuilder.connectionSampleOnly")}</span>}
                </span>
              ))}
        </dd>
        <dt className="text-muted">{t("companyBuilder.label.reviewer")}</dt>
        <dd>{cbt(t, `reviewerRole.${task.reviewer}`)}</dd>
        {task.unavailable.length > 0 && (
          <>
            <dt className="text-muted">{t("companyBuilder.label.unavailable")}</dt>
            <dd>{task.unavailable.map((c) => cbt(t, `unavailableCap.${c}`)).join(" · ")}</dd>
          </>
        )}
      </dl>
      <TechnicalDetails task={task} capabilities={capabilities} onHelp={onHelp} />
    </div>
  );
}

/** Business label for a work item: a step id first (`node.<pack>.<id>`), then the shared work-item copy. */
function workItem(t: Translator, packId: string | null, id: string) {
  for (const key of [packId ? `node.${packId}.${id}` : null, `work.item.${id}`, `capability.${id}`]) if (key && t.has(`companyBuilder.${key}`)) return cbt(t, key);
  return cbt(t, `work.item.${id}`); // unreachable when the copy contract holds (unit-tested)
}

function PrimaryOutcome({ data, task, onHelp }: { data: Overview; task: TaskPlan; onHelp?: () => void }) {
  const t = useT();
  const body = data.blueprint!.body;
  const pack = task.packId;
  const services = (p: string) => SERVICE[p] ?? p;
  const missing = task.connections.filter((c) => c.status === "missing");
  const setupBlockers = body.blockers.filter(isSetupBlocker);
  const operational = task.availability === "operational";
  const replyType = /reply|draft/.test(task.outputContract) || task.id.startsWith("customer-");
  const cost = body.cost;
  const roles = body.roles.filter((r) => r.tasks.includes(task.id));
  const reqKey = pack ? `node.${pack}.request` : "";
  const list = (items: string[]) => (
    <ul className="list-disc ps-5 text-sm text-med">
      {items.map((x) => (
        <li key={x}>{workItem(t, pack, x)}</li>
      ))}
    </ul>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="cb-primary-outcome" data-primary-task={task.id}>
      <Section name="goal" heading={t("companyBuilder.planSection.goal")}>
        <p className="text-sm font-medium text-hi">{cbt(t, `task.${task.id}.name`)}</p>
        <p className="text-sm text-med">{cbt(t, `task.${task.id}.does`)}</p>
      </Section>
      <Section name="trigger" heading={t("companyBuilder.planSection.trigger")}>
        <p className="text-sm text-med">
          {cbt(t, `triggerKind.${task.trigger.kind}`)} · {cbt(t, `triggerStatus.${task.trigger.status}`)}
        </p>
      </Section>
      <Section name="inputData" heading={t("companyBuilder.planSection.inputData")}>
        <p className="text-sm text-med">{reqKey && t.has(`companyBuilder.${reqKey}`) ? cbt(t, reqKey) : "—"}</p>
      </Section>
      <Section name="steps" heading={t("companyBuilder.planSection.steps")}>
        {task.steps.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          <ol className="list-decimal ps-5 text-sm text-med">
            {task.steps.map((s) => (
              <li key={s}>{pack ? cbt(t, `node.${pack}.${s}`) : s}</li>
            ))}
          </ol>
        )}
      </Section>
      <Section name="integrations" heading={t("companyBuilder.planSection.integrations")}>
        {task.connections.length === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          <ul className="text-sm text-med">
            {task.connections.map((c) => (
              <li key={c.provider} data-connection={c.provider} data-status={c.status}>
                {c.status === "connected" ? t("companyBuilder.connectionConnected", { service: services(c.provider) }) : t("companyBuilder.planSection.needsConnection", { service: services(c.provider) })}
              </li>
            ))}
          </ul>
        )}
        {body.sampleData && <p className="text-sm text-med">{t("companyBuilder.planSection.sampleUntilConnected")}</p>}
        {task.connections.some((c) => c.provider !== "ai") && (
          <p className="text-sm text-warning" data-testid="cb-live-not-available">
            {t("companyBuilder.planSection.liveNotAvailable")}
          </p>
        )}
      </Section>
      <Section name="team" heading={t("companyBuilder.planSection.team")}>
        {roles.map((role) => (
          <div key={role.id} className="text-sm" data-role={role.id}>
            <p className="font-medium text-hi">{cbt(t, `role.${role.id}.name`)}</p>
            <ul className="text-med">
              {role.tasks.map((x) => (
                <li key={x} data-task={x}>
                  {cbt(t, `task.${x}.name`)}
                </li>
              ))}
            </ul>
            {role.doesNot.length > 0 && (
              <>
                <p className="mt-1 text-muted">{t("companyBuilder.planSection.doesNot")}</p>
                <ul className="list-disc ps-5 text-med">
                  {role.doesNot.map((d) => (
                    <li key={d}>{cbt(t, `doesNot.${d}`)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </Section>
      <Section name="reviewer" heading={t("companyBuilder.planSection.reviewer")}>
        <p className="text-sm text-med">{cbt(t, `reviewerRole.${task.reviewer}`)}</p>
      </Section>
      <Section name="expectedOutput" heading={t("companyBuilder.planSection.expectedOutput")}>
        <p className="text-sm text-med">{cbt(t, `task.${task.id}.output`, undefined, cbt(t, `task.${task.id}.does`))}</p>
      </Section>
      <Section name="automatic" heading={t("companyBuilder.planSection.automatic")}>
        {task.work.automated.length + task.work.assisted.length + task.work.human.length === 0 && <p className="text-sm text-muted">—</p>}
        {task.work.automated.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-hi">{t("companyBuilder.work.automated")}</h4>
            {list(task.work.automated)}
          </div>
        )}
        {task.work.assisted.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-hi">{t("companyBuilder.work.assisted")}</h4>
            {list(task.work.assisted)}
          </div>
        )}
        {task.work.human.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-hi">{t("companyBuilder.work.human")}</h4>
            {list(task.work.human)}
          </div>
        )}
      </Section>
      <Section name="setup" heading={t("companyBuilder.planSection.setup")}>
        {setupBlockers.length + missing.length === 0 ? (
          <p className="text-sm text-med">{operational ? t("companyBuilder.planSection.readyToConfigure") : t("companyBuilder.planSection.noSetup")}</p>
        ) : (
          <ul className="list-disc ps-5 text-sm text-med">
            {setupBlockers.map((b, i) => (
              <li key={`b${i}`}>{blockerText(t, b)}</li>
            ))}
            {missing.map((c) => (
              <li key={c.provider}>{t("companyBuilder.planSection.needsConnection", { service: services(c.provider) })}</li>
            ))}
          </ul>
        )}
      </Section>
      <Section name="approval" heading={t("companyBuilder.planSection.approval")}>
        {replyType && <p className="text-sm text-med">{t("companyBuilder.planSection.approvalBeforeSending")}</p>}
        <p className="text-sm text-med">
          {t("companyBuilder.planSection.reviewer")}: {cbt(t, `reviewerRole.${task.reviewer}`)}
        </p>
      </Section>
      <Section name="unsupported" heading={t("companyBuilder.planSection.unsupported")}>
        {body.blockers.length === 0 ? (
          <p className="text-sm text-med">{t("companyBuilder.planSection.nothingUnsupported")}</p>
        ) : (
          <ul className="list-disc space-y-1 ps-5 text-sm text-med" data-testid="cb-blockers">
            {body.blockers.map((b, i) => (
              <li key={i} data-blocker={b.code}>
                {blockerText(t, b)}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section name="cost" heading={t("companyBuilder.planSection.cost")}>
        <ul className="list-disc space-y-1 ps-5 text-sm text-med" data-testid="cb-cost">
          {cost.ai === "none" && <li>{t("companyBuilder.cost.aiNone")}</li>}
          {cost.externalServices.map((s) => (
            <li key={s}>{t("companyBuilder.cost.external", { service: services(s) })}</li>
          ))}
          <li>{cost.executionsPerMonth ? t("companyBuilder.cost.executions", { min: cost.executionsPerMonth[0], max: cost.executionsPerMonth[1] }) : t("companyBuilder.cost.unknownVolume")}</li>
          {cost.unknown.includes("external_service_plan") && <li>{t("companyBuilder.cost.unknownExternal")}</li>}
          <li>{t("companyBuilder.cost.price")}</li>
        </ul>
      </Section>
      <TechnicalDetails task={task} capabilities={data.tasks.find((x) => x.task.id === task.id)?.capabilities ?? []} onHelp={onHelp} />
    </div>
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
  onHelp,
}: {
  data: Overview;
  canEdit: boolean;
  busy: string | null;
  onGenerate: () => void;
  onApprove: () => void;
  onInstall: () => void;
  onCancelInstall: () => void;
  onHelp?: (topic: "question_reason" | "plan_cost" | "result_checks" | "advanced") => void;
}) {
  const t = useT();
  const sep = useLocale() === "ar" ? "، " : ", ";
  const bp = data.blueprint;
  // Installation state of THIS plan version (an older installed version keeps running and is shown in the task cards).
  const inst = data.planInstallation;
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
          {Object.keys(bp.diff.changedFields ?? {}).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-accent-text">{t("companyBuilder.trial.technical")}</summary>
              {Object.entries(bp.diff.changedFields ?? {}).map(([task, fields]) => (
                <p key={task} dir="ltr">
                  {task}: {fields.join(", ")}
                </p>
              ))}
            </details>
          )}
        </div>
      )}

      {(() => {
        const primary = operational.find((x) => x.department === body.goal.department) ?? operational[0] ?? body.tasks[0] ?? null;
        const others = body.tasks.filter((x) => x.id !== primary?.id);
        return (
          <>
            <section aria-label={t("companyBuilder.planSection.understood")} className="flex flex-col gap-1" data-testid="cb-plan-section-understood">
              <p className="text-sm text-hi">{t("companyBuilder.planSection.understood")}</p>
              <a href="#cb-facts-heading" className="text-sm text-accent-text hover:underline">
                {t("companyBuilder.facts.heading")}
              </a>
            </section>
            <section aria-label={t("companyBuilder.planSection.firstOutcome")} className="flex flex-col gap-3" data-testid="cb-plan-section-firstOutcome">
              <h3 className="text-base font-semibold text-hi" id="cb-roles">
                {t("companyBuilder.planSection.firstOutcome")}
              </h3>
              {body.goal.department && <p className="text-sm font-medium text-hi">{cbt(t, `opt.${body.goal.department}`)}</p>}
              {primary ? <PrimaryOutcome data={data} task={primary} onHelp={() => onHelp?.("advanced")} /> : <p className="text-sm text-muted">{t("companyBuilder.plan.noTasks")}</p>}
              {body.blockers.length > 0 && !primary && (
                <ul className="list-disc space-y-1 ps-5 text-sm text-med" data-testid="cb-blockers">
                  {body.blockers.map((b, i) => (
                    <li key={i} data-blocker={b.code}>
                      {blockerText(t, b)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {others.length > 0 && (
              <section aria-label={t("companyBuilder.plan.rolesHeading")} className="flex flex-col gap-2">
                <h3 className="text-base font-semibold text-hi">{t("companyBuilder.plan.rolesHeading")}</h3>
                <ul className="flex flex-col gap-3">
                  {others.map((task) => (
                    <li key={task.id} className="flex flex-col gap-2 rounded-lg border border-line p-3" data-task-other={task.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-hi">{cbt(t, `task.${task.id}.name`)}</span>
                        {task.availability !== "operational" && <StatusBadge tone="muted">{cbt(t, task.availability === "planned" ? "reason.planned_not_operational" : "reason.not_supported")}</StatusBadge>}
                      </div>
                      <TaskDetails task={task} capabilities={data.tasks.find((x) => x.task.id === task.id)?.capabilities ?? []} onHelp={() => onHelp?.("advanced")} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-label={t("companyBuilder.next.heading")} className="flex flex-col gap-1" data-testid="cb-next-improvements">
              <h3 className="text-base font-semibold text-hi">{t("companyBuilder.next.heading")}</h3>
              <p className="text-sm text-muted">{t("companyBuilder.next.note")}</p>
              {body.nextImprovements.length > 0 && (
                <ul className="list-disc ps-5 text-sm text-med">
                  {body.nextImprovements.map((n) => (
                    <li key={n.id} data-next={n.id}>
                      {n.id.endsWith("-outcome") ? t("companyBuilder.next.outcome", { area: cbt(t, `opt.${n.department ?? n.id.replace(/-outcome$/, "")}`) }) : cbt(t, `next.${n.id}`)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        );
      })()}

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

const REJECT_REASONS = ["wrong_details", "invented_content", "missing_info", "wrong_tone", "something_else"] as const;

function AcceptBox({ taskId, trial, busy, canRun, onVerdict }: { taskId: string; trial: NonNullable<TaskView["trial"]>; busy: boolean; canRun: boolean; onVerdict: (trialId: string, verdict: "accepted" | "rejected", reason?: string) => void }) {
  const t = useT();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string>("");
  const disabled = canRun ? null : t("companyBuilder.errors.FORBIDDEN");
  const uv = trial.userVerdict;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <p className="text-sm font-medium text-hi">{t("companyBuilder.trial.acceptQuestion")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={uv === "accepted" ? "primary" : "secondary"} aria-pressed={uv === "accepted"} onClick={() => { setRejecting(false); onVerdict(trial.id, "accepted"); }} loading={busy} disabledReason={disabled} data-testid={`cb-accept-yes-${taskId}`}>
          {t("companyBuilder.trial.acceptYes")}
        </Button>
        <Button size="sm" variant={uv === "rejected" || rejecting ? "primary" : "secondary"} aria-pressed={uv === "rejected"} aria-expanded={rejecting} onClick={() => setRejecting(true)} disabledReason={disabled} data-testid={`cb-accept-no-${taskId}`}>
          {t("companyBuilder.trial.acceptNo")}
        </Button>
      </div>
      {rejecting && (
        <fieldset className="flex flex-col gap-1 text-sm" data-testid={`cb-reject-reason-${taskId}`}>
          <legend className="font-medium text-hi">{t("companyBuilder.trial.rejectWhy")}</legend>
          {REJECT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name={`cb-reject-reason-${taskId}`} value={r} checked={reason === r} onChange={() => setReason(r)} />
              {t(`companyBuilder.trial.rejectReason.${r}` as MessageKey)}
            </label>
          ))}
          <div>
            <Button size="sm" variant="secondary" onClick={() => { onVerdict(trial.id, "rejected", reason); setRejecting(false); }} loading={busy} disabledReason={disabled ?? (reason ? null : t("companyBuilder.trial.rejectWhy"))} data-testid={`cb-reject-confirm-${taskId}`}>
              {t("companyBuilder.trial.rejectConfirm")}
            </Button>
          </div>
        </fieldset>
      )}
      <p aria-live="polite" className="text-sm" data-testid={`cb-user-verdict-${taskId}`} data-verdict={uv ?? ""}>
        {uv === "accepted" && <span className="text-success">{t("companyBuilder.trial.acceptedByYou")}</span>}
        {uv === "rejected" && <span className="text-warning">{t("companyBuilder.trial.rejectedByYou")}{trial.userVerdictReason ? ` (${cbt(t, `trial.rejectReason.${trial.userVerdictReason}`)})` : ""}</span>}
      </p>
      <p className="text-xs text-muted">{t("companyBuilder.trial.acceptNote")}</p>
    </div>
  );
}

export function TaskCard({ view, slug, canRun, canPublish, busy, timezone, onTry, onSendForReview, onVerdict, onActivate, onPause, onHelp }: { view: TaskView; slug: string; canRun: boolean; canPublish: boolean; busy: string | null; timezone: string; onTry: () => void; onSendForReview: (trialId: string) => void; onVerdict: (trialId: string, verdict: "accepted" | "rejected", reason?: string) => void; onActivate: () => void; onPause: () => void; onHelp?: (topic: "result_checks" | "advanced") => void }) {
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
            {t("companyBuilder.open.advanced")}
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
          {trial && !v && trial.status === "failed" && <p className="text-sm text-danger">{t("companyBuilder.trial.runFailed")}</p>}
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
              {output && trial.status === "completed" && task.packId === "customer-follow-up" && <FollowUpResult taskId={task.id} output={output} timezone={timezone} />}
              <details className="text-sm" onToggle={(e) => e.currentTarget.open && onHelp?.("result_checks")} data-testid={`cb-trial-technical-${task.id}`}>
                <summary className="cursor-pointer text-accent-text">{t("companyBuilder.trial.technical")}</summary>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-med">
                  {v.checks.map((c) => (
                    <li key={c.id}>
                      {c.passed ? "✓" : "✗"} {cbt(t, `trial.check.${c.id}`)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted">{cbt(t, `trial.provenance.${trial.provenance}`)}</p>
                {output && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-accent-text">{t("companyBuilder.trial.output")}</summary>
                    <pre dir="ltr" className="mt-1 max-h-64 overflow-auto rounded-md bg-app p-2 text-xs whitespace-pre-wrap">
                      {JSON.stringify(output, null, 2)}
                    </pre>
                  </details>
                )}
              </details>
              {trial.runId && (
                <Link href={`/w/${slug}/runs?run=${trial.runId}`} className="text-sm text-accent-text hover:underline">
                  {trial.runNumber != null ? t("companyBuilder.trial.run", { number: trial.runNumber }) : t("companyBuilder.trial.openRun")}
                </Link>
              )}
              {trial.status === "completed" && v.ranWithoutErrors && <AcceptBox taskId={task.id} trial={trial} busy={busy === `verdict:${task.id}`} canRun={canRun} onVerdict={onVerdict} />}
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
              <Button size="sm" variant="secondary" onClick={onActivate} loading={busy === `activate:${task.id}`} disabledReason={canPublish ? null : t("companyBuilder.errors.FORBIDDEN")} data-testid={`cb-activate-${task.id}`}>
                {t("companyBuilder.activation.request")}
              </Button>
            )}
            {status.state === "active" && (
              <Button size="sm" variant="ghost" onClick={onPause} loading={busy === `pause:${task.id}`} disabledReason={canPublish ? null : t("companyBuilder.errors.FORBIDDEN")} data-testid={`cb-pause-${task.id}`}>
                {t("companyBuilder.activation.pause")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">{t("companyBuilder.activation.note")}</p>
          {task.connections.some((c) => c.provider !== "ai") && (
            <p className="text-xs text-warning" data-testid={`cb-activation-sample-only-${task.id}`}>
              {t("companyBuilder.activation.sampleOnly")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
