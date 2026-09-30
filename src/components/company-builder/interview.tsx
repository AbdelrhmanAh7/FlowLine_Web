"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Card, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { cbt, optionLabel } from "./text";
import type { QuestionDto } from "./types";

/**
 * One question at a time. The server decides which question comes next; this component only renders it. There is no
 * progress total (paths branch) — only how many questions the person has answered.
 */
export function InterviewCard({
  question,
  answered,
  backTo,
  pending,
  error,
  onAnswer,
  onBack,
}: {
  question: QuestionDto;
  answered: number;
  backTo: string | null;
  pending: boolean;
  error: string | null;
  onAnswer: (value: unknown, unknown: boolean) => void;
  onBack: (questionId: string) => void;
}) {
  const t = useT();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cur = question.current;
  const initial = cur && cur.status !== "unknown" ? cur.value : null;
  const [single, setSingle] = useState<string>(typeof initial === "string" && question.kind === "single" ? initial : "");
  const [multi, setMulti] = useState<string[]>(Array.isArray(initial) ? initial : []);
  const [text, setText] = useState<string>(typeof initial === "string" && question.kind === "text" ? initial : "");

  // A new question: move focus to its title so keyboard and screen-reader users follow the flow.
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.id]);

  const value = question.kind === "single" ? single : question.kind === "multi" ? multi : text;
  const empty = question.kind === "single" ? !single : question.kind === "multi" ? multi.length === 0 : !text.trim();

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="cb-question" data-question={question.id}>
      <p className="text-sm text-muted" aria-live="polite">
        {t.plural("companyBuilder.interview.answered", answered)}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!empty && !pending) onAnswer(value, false);
        }}
      >
        <fieldset className="flex flex-col gap-3" aria-labelledby={titleId}>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-hi outline-none">
            {cbt(t, `q.${question.id}.title`)}
          </h2>
          <details className="text-sm text-med">
            <summary className="cursor-pointer text-accent-text">{t("companyBuilder.interview.whyAsk")}</summary>
            <p className="mt-1">{cbt(t, `q.${question.id}.reason`)}</p>
          </details>
          {cur?.status === "inferred" && <p className="rounded-md bg-elevated px-3 py-2 text-sm text-hi">{t("companyBuilder.interview.suggested")}</p>}
          {cur?.status === "contradictory" && (
            <p role="alert" className="rounded-md border border-warning-border px-3 py-2 text-sm text-warning">
              {t("companyBuilder.interview.conflict")} {cur.conflict ? cbt(t, `facts.conflict.${cur.conflict}`) : ""}
            </p>
          )}
          {(question.sensitivity === "financial" || question.sensitivity === "personal") && <p className="text-sm text-muted">{t("companyBuilder.interview.sensitive")}</p>}

          {question.kind === "single" && (
            <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-2">
              {question.options!.map((o) => (
                <label key={o} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-line bg-card px-3 py-2 text-base has-[:checked]:border-accent has-[:checked]:bg-elevated">
                  <input type="radio" name={question.id} value={o} checked={single === o} onChange={() => setSingle(o)} className="size-4 accent-[var(--color-accent)]" />
                  {optionLabel(t, question.id, o)}
                </label>
              ))}
            </div>
          )}
          {question.kind === "multi" && (
            <div className="flex flex-col gap-2">
              {question.options!.map((o) => (
                <label key={o} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-line bg-card px-3 py-2 text-base has-[:checked]:border-accent has-[:checked]:bg-elevated">
                  <input type="checkbox" value={o} checked={multi.includes(o)} onChange={(e) => setMulti((m) => (e.target.checked ? [...m, o] : m.filter((x) => x !== o)))} className="size-4 accent-[var(--color-accent)]" />
                  {optionLabel(t, question.id, o)}
                </label>
              ))}
            </div>
          )}
          {question.kind === "text" && (
            <Textarea aria-labelledby={titleId} value={text} maxLength={question.maxLength ?? 200} rows={question.maxLength && question.maxLength > 200 ? 4 : 2} placeholder={t("companyBuilder.interview.textPlaceholder")} onChange={(e) => setText(e.target.value)} dir="auto" />
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={pending} disabled={empty} data-testid="cb-save">
            {t("companyBuilder.interview.save")}
          </Button>
          {question.allowUnknown && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onAnswer(null, true)} data-testid="cb-dont-know">
              {t("companyBuilder.interview.dontKnow")}
            </Button>
          )}
          {backTo && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onBack(backTo)} className="ms-auto" data-testid="cb-back">
              {t("companyBuilder.interview.back")}
            </Button>
          )}
        </div>
      </form>
      <p className="text-xs text-muted">{t("companyBuilder.interview.savedResume")}</p>
    </Card>
  );
}
