"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { can, denyReason, type Role } from "@/lib/permissions";

interface AuditRow {
  id: number;
  at: string;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown> | null;
}

export function AuditLog() {
  const { workspace, role } = useWorkspace();
  const allowed = can(role as Role, "audit.view");
  const q = useInfiniteQuery({
    queryKey: ["audit", workspace.id],
    queryFn: ({ pageParam }) => api<{ events: AuditRow[]; nextBefore: number | null }>(`/api/workspaces/${workspace.id}/audit${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: allowed,
  });
  if (!allowed) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="mt-2 text-base text-med">{denyReason(role as Role, "audit.view")}.</p>
      </Card>
    );
  }
  const rows = q.data?.pages.flatMap((p) => p.events) ?? [];
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">Audit log</h2>
      <p className="mt-1 text-base text-med">Member, role, API key, integration, publish, approval, billing and settings changes. Secrets are never recorded.</p>
      <div className="mt-4">
        {q.isPending ? (
          <Skeleton className="h-24" />
        ) : q.isError ? (
          <ErrorState title="Couldn't load the audit log" body={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon="☰" title="No audited changes yet" />
        ) : (
          <ul className="divide-y divide-line" aria-label="Audit events">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-base">
                <span className="data text-sm text-muted">{new Date(r.at).toLocaleString()}</span>
                <code className="data text-sm text-hi">{r.action}</code>
                <span className="text-med">{r.actorLabel}</span>
                {r.data && <span className="data min-w-0 truncate text-sm text-muted">{JSON.stringify(r.data)}</span>}
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <Button className="mt-3" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
            Load older
          </Button>
        )}
      </div>
    </Card>
  );
}
