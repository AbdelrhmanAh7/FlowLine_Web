"use client";

import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/types";
import type { IllustrationNode } from "./flow-illustration";
import { FlowStepVisual } from "./flow-step-visual";

export function FlowStepPreview({ node, step, testId = "landing-step-preview" }: { node: IllustrationNode; step: number; testId?: string }) {
  const t = useT();
  return (
    <div data-testid={testId} data-step={step} className="mt-5 grid items-center gap-5 rounded-xl border border-line bg-card p-5 sm:grid-cols-2 sm:p-6">
      <div>
        <p className="text-xs font-medium text-accent-text">{t("landing.flowExample")}</p>
        <h3 className="mt-2 text-xl font-semibold">{node.label}</h3>
        <p className="mt-2 text-base text-med">{t(`landing.flowDetails.${node.id}` as MessageKey)}</p>
        <p className="mt-4 text-xs text-muted">{t("landing.flowInteraction")}</p>
      </div>
      <FlowStepVisual step={step} label={`${node.label} — ${node.sub}`} />
    </div>
  );
}
