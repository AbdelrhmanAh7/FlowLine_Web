import type { ReactNode } from "react";

export function PageHeader({ title, children, sub }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-app/95 px-4 py-2.5 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
