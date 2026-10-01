"use client";

import { Button, Card, StatusBadge, type Tone } from "@/components/ui";
import { useLocale, useT } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import { cbt } from "./text";
import type { Overview, ReviewItemDto } from "./types";

const TONE: Record<string, Tone> = { pending: "warning", approved: "info", rejected: "muted", invalidated: "danger", executed: "success", uncertain: "warning" };

/** Proposed content shown as data (LTR for addresses/JSON, escaped by React). */
function Proposed({ item }: { item: ReviewItemDto }) {
  const p = item.proposed;
  if (p.kind === "email_reply") {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p dir="ltr" className="text-start text-muted">
          {String(p.to ?? "")} · {String(p.subject ?? "")}
        </p>
        <p dir="auto" className="whitespace-pre-wrap text-hi">
          {String(p.body ?? "")}
        </p>
      </div>
    );
  }
  return (
    <pre dir="ltr" className="max-h-48 overflow-auto rounded-md bg-app p-2 text-xs whitespace-pre-wrap">
      {JSON.stringify(p, null, 2)}
    </pre>
  );
}

export function ReviewInbox({ data, canDecide, isOwner, busy, onDecide, onVerify }: { data: Overview; canDecide: boolean; isOwner: boolean; busy: string | null; onDecide: (id: string, decision: "approve" | "reject") => void; onVerify: (id: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const items = data.reviews;
  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="cb-inbox">
      <h2 className="text-lg font-semibold text-hi" id="cb-inbox-heading" tabIndex={-1}>
        {t("companyBuilder.review.inbox")}
      </h2>
      {items.length === 0 && <p className="text-sm text-muted">{t("companyBuilder.review.empty")}</p>}
      <ul className="flex flex-col gap-3">
        {items.map((it) => {
          const ownerOnly = it.reviewerRole === "owner" && !isOwner;
          const reason = !canDecide ? t("companyBuilder.errors.FORBIDDEN") : ownerOnly ? t("companyBuilder.review.ownerOnly") : null;
          return (
            <li key={it.id} className="flex flex-col gap-2 rounded-lg border border-line p-3" data-testid={`cb-review-${it.kind}-${it.taskId}`} data-status={it.status}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-hi">{cbt(t, `review.kind.${it.kind}`)}</span>
                <span className="text-sm text-med">— {cbt(t, `task.${it.taskId}.name`)}</span>
                <StatusBadge tone={TONE[it.status] ?? "muted"}>{cbt(t, `review.status.${it.status}`)}</StatusBadge>
                <span className="ms-auto text-xs text-muted">{formatDate(locale, it.createdAt)}</span>
              </div>
              {it.proposed.consequential === "refund_or_cancellation" && (
                <p className="rounded-md bg-elevated px-3 py-2 text-sm text-warning" data-testid={`cb-review-consequential-${it.taskId}`}>
                  {t("companyBuilder.review.consequential")}
                </p>
              )}
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                <dt className="text-muted">{t("companyBuilder.review.source")}</dt>
                <dd dir="ltr" className="text-start text-xs">
                  {Object.entries(it.source)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(" · ")}
                </dd>
                <dt className="text-muted">{t("companyBuilder.review.proposed")}</dt>
                <dd>
                  <Proposed item={it} />
                </dd>
                <dt className="text-muted">{t("companyBuilder.review.connection")}</dt>
                <dd>{it.connection?.mocked ? t("companyBuilder.review.sampleConnection") : "—"}</dd>
                <dt className="text-muted">{t("companyBuilder.review.recipient")}</dt>
                <dd dir="ltr" className="text-start">
                  {it.recipient ?? "—"}
                </dd>
                <dt className="text-muted">{t("companyBuilder.review.reviewer")}</dt>
                <dd>{cbt(t, `reviewerRole.${it.reviewerRole}`)}</dd>
                <dt className="text-muted">{t("companyBuilder.review.taskVersion")}</dt>
                <dd dir="ltr" className="text-start">
                  {it.taskVersion} · plan v{it.blueprintVersion}
                </dd>
              </dl>
              {it.status === "invalidated" && <p className="text-sm text-danger">{t("companyBuilder.review.invalidated")}</p>}
              {it.status === "uncertain" && (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="alert" className="text-sm text-warning">
                    {t("companyBuilder.review.uncertain")}
                  </p>
                  <Button size="sm" onClick={() => onVerify(it.id)} loading={busy === `verify:${it.id}`} disabledReason={reason} data-testid={`cb-verify-${it.taskId}`}>
                    {t("companyBuilder.review.verify")}
                  </Button>
                </div>
              )}
              {it.status === "executed" && it.note === "verified_after_uncertain" && <p className="text-sm text-success">{t("companyBuilder.review.verifiedApplied")}</p>}
              {it.status === "pending" && !it.expired && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => onDecide(it.id, "approve")} loading={busy === `decide:${it.id}`} disabledReason={reason} data-testid={`cb-approve-${it.kind}-${it.taskId}`}>
                    {t("companyBuilder.review.approve")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDecide(it.id, "reject")} disabled={busy === `decide:${it.id}`} disabledReason={reason}>
                    {t("companyBuilder.review.reject")}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="cb-outbox" className="flex flex-col gap-2">
        <h3 id="cb-outbox" className="text-base font-semibold text-hi">
          {t("companyBuilder.review.outbox")}
        </h3>
        <p className="text-xs text-muted" data-testid="cb-outbox-note">
          {t("companyBuilder.review.outboxNote")}
        </p>
        {data.outbox.length === 0 ? (
          <p className="text-sm text-muted">{t("companyBuilder.review.outboxEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm" data-testid="cb-outbox">
            {data.outbox.map((o) => (
              <li key={o.id} className="rounded-md bg-app px-2 py-1">
                <span className="text-muted">{formatDate(locale, o.createdAt)}</span> · {cbt(t, `trial.provenance.${o.provenance}`)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

export function EntitlementBox({ data, isOwner, busy, onGrant, onCancel }: { data: Overview; isOwner: boolean; busy: string | null; onGrant: () => void; onCancel: () => void }) {
  const t = useT();
  const locale = useLocale();
  const e = data.entitlement;
  const devActive = e.devTrial?.status === "active" && new Date(e.devTrial.expiresAt) > new Date();
  return (
    <Card className="flex flex-col gap-2 p-5" data-testid="cb-entitlement">
      <h2 className="text-base font-semibold text-hi">{t("companyBuilder.entitlement.heading")}</h2>
      <p className="text-sm text-med">{t("companyBuilder.entitlement.billing", { status: e.billing.status })}</p>
      {devActive ? <p className="text-sm text-hi">{t("companyBuilder.entitlement.devTrial", { date: formatDate(locale, e.devTrial!.expiresAt) })}</p> : !e.effective && <p className="text-sm text-muted">{t("companyBuilder.entitlement.none")}</p>}
      <p className="text-xs text-muted">{t("companyBuilder.entitlement.separate")}</p>
      <div className="flex flex-wrap gap-2">
        {!devActive ? (
          <Button size="sm" onClick={onGrant} loading={busy === "grant"} disabledReason={!e.devTrialAllowed ? t("companyBuilder.entitlement.notAllowed") : !isOwner ? t("companyBuilder.entitlement.ownerOnly") : null} data-testid="cb-grant-trial">
            {t("companyBuilder.entitlement.grant")}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onCancel} loading={busy === "cancelTrial"} disabledReason={!isOwner ? t("companyBuilder.entitlement.ownerOnly") : null} data-testid="cb-cancel-trial">
            {t("companyBuilder.entitlement.cancel")}
          </Button>
        )}
      </div>
    </Card>
  );
}
