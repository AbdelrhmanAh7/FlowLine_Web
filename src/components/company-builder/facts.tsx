"use client";

import { useState } from "react";
import type { Fact } from "@/company-builder/model";
import { QUESTIONS } from "@/company-builder/questions";
import { Button, Card, StatusBadge, type Tone } from "@/components/ui";
import { useT } from "@/i18n/client";
import { InterviewCard } from "./interview";
import { cbt, factText, fieldLabel } from "./text";
import type { QuestionDto } from "./types";

const TONE: Record<Fact["status"], Tone> = { confirmed: "success", inferred: "info", contradictory: "warning", unknown: "muted" };

/** "راجع ما فهمناه عن مشروعك." — every fact with its status, provenance and version; corrections are new versions. */
export function FactsPanel({ facts, pending, error, onCorrect }: { facts: Record<string, Fact>; pending: boolean; error: string | null; onCorrect: (questionId: string, value: unknown, unknown: boolean) => void }) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const entries = Object.entries(facts);
  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="cb-facts">
      <h2 className="text-lg font-semibold text-hi" id="cb-facts-heading">
        {t("companyBuilder.facts.heading")}
      </h2>
      <p className="text-sm text-med">{t("companyBuilder.facts.sub")}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{t("companyBuilder.facts.empty")}</p>
      ) : (
        <dl className="flex flex-col divide-y divide-line">
          {entries.map(([key, fact]) => {
            const q = QUESTIONS.find((x) => x.target === key);
            return (
              <div key={key} className="flex flex-col gap-1 py-2" data-fact={key}>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="text-sm font-medium text-hi">{fieldLabel(t, key)}</dt>
                  <StatusBadge tone={TONE[fact.status]}>{cbt(t, `facts.status.${fact.status}`)}</StatusBadge>
                  <span className="text-xs text-muted">
                    {cbt(t, `facts.source.${fact.source}`)} · {t("companyBuilder.facts.version", { version: fact.version })}
                  </span>
                  {q && (
                    <Button size="sm" variant="ghost" className="ms-auto" aria-expanded={editing === q.id} onClick={() => setEditing(editing === q.id ? null : q.id)} data-testid={`cb-edit-${q.id}`}>
                      {editing === q.id ? t("companyBuilder.facts.cancelEdit") : t("companyBuilder.facts.edit")}
                    </Button>
                  )}
                </div>
                <dd className="text-base break-words text-med" dir="auto">
                  {factText(t, key, fact)}
                </dd>
                {fact.status === "contradictory" && fact.conflict && <p className="text-sm text-warning">{cbt(t, `facts.conflict.${fact.conflict}`)}</p>}
                {q && editing === q.id && (
                  <InterviewCard
                    key={`edit-${q.id}-${fact.version}`}
                    question={{ id: q.id, target: q.target, kind: q.kind, options: q.options ? [...q.options] : null, maxLength: q.maxLength ?? null, allowUnknown: q.allowUnknown, sensitivity: q.sensitivity, department: q.department, current: fact } satisfies QuestionDto}
                    answered={0}
                    backTo={null}
                    pending={pending}
                    error={error}
                    onAnswer={(v, u) => {
                      onCorrect(q.id, v, u);
                      setEditing(null);
                    }}
                    onBack={() => {}}
                  />
                )}
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}
