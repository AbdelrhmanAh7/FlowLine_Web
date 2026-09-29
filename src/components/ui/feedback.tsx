"use client";

import { useT } from "@/i18n/client";
import { Button } from "./button";
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="motion-enter flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && (
        <div className="mb-1 text-muted" aria-hidden>
          {icon}
        </div>
      )}
      <p className="text-lg font-semibold">{title}</p>
      {body && <p className="max-w-sm text-base text-med">{body}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, body, onRetry, retrying }: { title: string; body?: React.ReactNode; onRetry?: () => void; retrying?: boolean }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger-border bg-danger-bg p-4">
      <div>
        <p className="font-semibold text-danger">⚠ {title}</p>
        {body && <p className="mt-1 text-base text-med">{body}</p>}
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} loading={retrying}>
          {t("ui.retry")}
        </Button>
      )}
    </div>
  );
}

/** Usage meter: hue follows the ratio — emerald headroom, amber past 75%, rose past 90%. */
export function UsageBar({ ratio, className }: { ratio: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  const hue = ratio >= 0.9 ? "bg-danger" : ratio >= 0.75 ? "bg-warning" : "bg-success";
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-elevated", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-emphasized)]", hue)} style={{ width: `${pct}%` }} />
    </div>
  );
}
