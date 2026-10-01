"use client";

import { useState } from "react";
import { ListChecks, Target, Workflow } from "lucide-react";
import { useT } from "@/i18n/client";
import { cx } from "@/components/ui";

const stepKeys = [0, 1, 2] as const;
const stepIcons = [Target, Workflow, ListChecks] as const;

/** A compact, user-controlled explanation of the product beside the auth form. */
export function AuthWalkthrough() {
  const t = useT();
  const [active, setActive] = useState(0);
  const step = stepKeys[active]!;

  return (
    <aside className="hidden min-h-dvh flex-col justify-center border-s border-line bg-card px-8 py-12 lg:flex xl:px-14" aria-labelledby="auth-walkthrough-title">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-sm font-semibold text-accent-text">{t("uxPages.auth.eyebrow")}</p>
        <h2 id="auth-walkthrough-title" className="mt-3 text-3xl font-semibold tracking-tight">{t("uxPages.auth.title")}</h2>
        <p className="mt-3 max-w-lg text-base leading-7 text-med">{t("uxPages.auth.intro")}</p>

        <div className="mt-8 grid grid-cols-3 gap-3" role="group" aria-label={t("uxPages.auth.title")}>
          {stepKeys.map((index) => (
            <button key={index} type="button" aria-pressed={active === index} onClick={() => setActive(index)} className={cx("flex min-h-24 flex-col items-start justify-between rounded-lg border p-3 text-start transition-colors duration-[var(--dur-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", active === index ? "border-accent bg-accent/10" : "border-line bg-surface hover:bg-elevated")}>
              <span aria-hidden="true" className="grid size-7 place-items-center rounded-full border border-line text-xs font-semibold">{index + 1}</span>
              <span className="mt-3 flex items-center gap-2 text-sm font-semibold"><StepIcon index={index} />{t(`uxPages.auth.steps.${index}.title`)}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-line bg-surface p-5" aria-live="polite" aria-atomic="true">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-hi">{t(`uxPages.auth.steps.${step}.label`)}</span>
            <span className="text-xs text-muted">{t("uxPages.auth.selected", { number: step + 1 })}</span>
          </div>
          <WalkthroughGraphic step={step} rtl={t.locale === "ar"} />
          <p className="mt-4 text-sm leading-6 text-med">{t(`uxPages.auth.steps.${step}.detail`)}</p>
        </div>
      </div>
    </aside>
  );
}

function StepIcon({ index }: { index: number }) {
  const Icon = stepIcons[index]!;
  return <Icon aria-hidden="true" className="size-4 shrink-0 text-accent-text" />;
}

function WalkthroughGraphic({ step, rtl }: { step: number; rtl: boolean }) {
  const labels = ["01", "02", "03"];
  return (
    <svg viewBox="0 0 480 106" className="mt-4 h-auto w-full" aria-hidden="true" focusable="false">
      <path d="M112 53h82m92 0h82" fill="none" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="5 5" />
      {(rtl ? [368, 194, 20] : [20, 194, 368]).map((x, index) => (
        <g key={x}>
          <rect x={x} y="17" width="92" height="72" rx="12" fill="var(--color-surface)" stroke={step === index ? "var(--color-accent)" : "var(--color-line)"} strokeWidth={step === index ? "2.5" : "1.5"} />
          <circle cx={x + 20} cy="40" r="6" fill={index === 0 ? "var(--color-cat-trigger)" : index === 1 ? "var(--color-cat-app)" : "var(--color-cat-output)"} />
          <path d={`M${x + 14} 59h${50 + (index * 4)}M${x + 14} 70h${38 + (index * 5)}`} stroke="var(--color-muted)" strokeWidth="4" strokeLinecap="round" />
          <text x={x + 76} y="34" textAnchor="middle" fill="var(--color-muted)" fontSize="9" fontFamily="var(--font-mono)">{labels[index]}</text>
        </g>
      ))}
    </svg>
  );
}
