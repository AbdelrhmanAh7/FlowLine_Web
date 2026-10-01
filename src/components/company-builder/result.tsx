"use client";

import { useLocale, useT } from "@/i18n/client";
import { formatDue } from "@/company-builder/format";
import { cbt } from "./text";

interface ReplyDraft {
  to?: string;
  subject?: string;
  body?: string;
  suspicious?: boolean;
  asked_for?: string[];
  consequential?: string | null;
}
interface NeedsPerson {
  from?: string;
  subject?: string;
  suspicious?: boolean;
  reason?: string;
}
interface FollowUpRecord {
  next_follow_up_at?: string | null;
}

/** Human-readable result of the customer follow-up task: reply, what we ask for, hand-off, follow-up time. */
export function FollowUpResult({ taskId, output, timezone }: { taskId: string; output: Record<string, unknown>; timezone: string }) {
  const t = useT();
  const locale = useLocale();
  const sep = locale === "ar" ? "، " : ", ";
  const reply = (output.reply_draft as ReplyDraft | undefined) ?? null;
  const person = (output.needs_person as NeedsPerson | undefined) ?? null;
  const record = (output.follow_up_record as FollowUpRecord | undefined) ?? null;
  if (!reply && !person) return null;
  const suspicious = Boolean(reply?.suspicious || person?.suspicious);
  const due = record ? (record.next_follow_up_at ?? null) : undefined;
  const asked = reply?.asked_for ?? [];
  return (
    <div className="flex flex-col gap-2 rounded-md bg-elevated p-3 text-sm" data-testid={`cb-result-${taskId}`}>
      {reply && (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-hi">{t("companyBuilder.result.reply")}</p>
          {reply.to && (
            <p className="text-med">
              {t("companyBuilder.result.to")}: <bdi dir="ltr">{reply.to}</bdi>
            </p>
          )}
          <p dir="auto" className="whitespace-pre-wrap text-hi">
            {reply.body ?? ""}
          </p>
          {asked.length > 0 && <p className="text-med">{t("companyBuilder.result.asks", { list: asked.map((a) => cbt(t, `opt.detail_${a}`, undefined, a)).join(sep) })}</p>}
        </div>
      )}
      {person && <p className="text-med">{t("companyBuilder.result.handoff", { reason: person.reason ? cbt(t, `result.handoffReason.${person.reason}`, undefined, person.reason) : "—" })}</p>}
      {reply?.consequential === "refund_or_cancellation" && (
        <p className="text-warning" data-testid={`cb-result-consequential-${taskId}`}>
          {t("companyBuilder.result.consequential")}
        </p>
      )}
      {suspicious && <p className="text-warning">{t("companyBuilder.result.suspicious")}</p>}
      {due !== undefined && <p className="text-med">{due ? t("companyBuilder.result.followUpDue", { date: formatDue(due, locale, timezone) }) : t("companyBuilder.result.noTimestamp")}</p>}
    </div>
  );
}
