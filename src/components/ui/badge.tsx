"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import type { NodeCategory } from "@/engine/nodes";
import { cn } from "./cn";

/* ───────── Tones: the semantic meaning of each hue ───────── */

export type Tone = "success" | "warning" | "danger" | "info" | "muted" | "accent";

const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  muted: "text-muted",
  accent: "text-accent",
};
const TONE_BG: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-muted",
  accent: "bg-accent",
};

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", TONE_BG[tone], className)} />;
}

export function StatusBadge({ tone, children, upper, className }: { tone: Tone; children: ReactNode; upper?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", upper ? "text-xs font-medium uppercase tracking-[0.4px]" : "text-sm", TONE_TEXT[tone], className)}>
      <Dot tone={tone} />
      {children}
    </span>
  );
}

/** Soft filled badge: tinted bg + hue fg + hue border (badge, filter chip, usage pill). */
const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      success: "border-success-border bg-success-bg text-success",
      warning: "border-warning-border bg-warning-bg text-warning",
      danger: "border-danger-border bg-danger-bg text-danger",
      info: "border-info-border bg-info-bg text-info",
      muted: "border-line bg-card text-med",
      accent: "border-accent-border bg-accent-bg text-accent",
    } satisfies Record<Tone, string>,
  },
  defaultVariants: { tone: "muted" },
});

export function Badge({ tone, className, children, ...rest }: VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...rest}>
      {children}
    </span>
  );
}

/** Run/step status → tone (labels are translated: `runLabel(t, status)` in src/i18n/engine-text.ts). */
export const RUN_TONE: Record<string, Tone> = {
  queued: "muted",
  running: "info",
  succeeded: "success",
  failed: "danger",
  cancelled: "muted",
  pending: "muted",
  skipped: "muted",
  reused: "success",
  waiting_approval: "warning",
  uncertain: "warning",
};

/* ───────── Node category chip (canvas palette, drawer, templates) ───────── */

/** Engine categories collapse onto the five semantic category hues. */
export const CATEGORY_HUE = {
  trigger: "trigger",
  logic: "logic",
  data: "logic",
  advanced: "logic",
  ai: "ai",
  integration: "app",
  output: "output",
} as const satisfies Record<NodeCategory, string>;

export type CategoryHue = (typeof CATEGORY_HUE)[NodeCategory];

const catVariants = cva("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium", {
  variants: {
    hue: {
      trigger: "border-cat-trigger-border bg-cat-trigger-bg text-cat-trigger",
      logic: "border-cat-logic-border bg-cat-logic-bg text-cat-logic",
      ai: "border-cat-ai-border bg-cat-ai-bg text-cat-ai",
      app: "border-cat-app-border bg-cat-app-bg text-cat-app",
      output: "border-cat-output-border bg-cat-output-bg text-cat-output",
    } satisfies Record<CategoryHue, string>,
  },
});

export function CategoryChip({ category, className, children }: { category: NodeCategory | CategoryHue; className?: string; children: ReactNode }) {
  const hue = (category in CATEGORY_HUE ? CATEGORY_HUE[category as NodeCategory] : category) as CategoryHue;
  return <span className={cn(catVariants({ hue }), className)}>{children}</span>;
}

/** Foreground class for a category hue (icon glyphs, node accents). */
export const CAT_TEXT: Record<CategoryHue, string> = {
  trigger: "text-cat-trigger",
  logic: "text-cat-logic",
  ai: "text-cat-ai",
  app: "text-cat-app",
  output: "text-cat-output",
};
/** Soft background class for a category hue (icon chips). */
export const CAT_BG: Record<CategoryHue, string> = {
  trigger: "bg-cat-trigger-bg",
  logic: "bg-cat-logic-bg",
  ai: "bg-cat-ai-bg",
  app: "bg-cat-app-bg",
  output: "bg-cat-output-bg",
};
