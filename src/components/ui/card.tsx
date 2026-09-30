"use client";

import { cn } from "./cn";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-line bg-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs font-medium uppercase tracking-[0.4px] text-muted", className)}>{children}</p>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="data inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-card px-1 text-xs text-med">{children}</kbd>;
}
