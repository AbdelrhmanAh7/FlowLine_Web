"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";

interface AuditRow {
  id: number;
  at: string;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  data: Record<string, unknown> | null;
  source: "audit" | "guardrail";
}

export function AuditLog() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const allowed = can(role as Role, "audit.view");

  const auditQuery = useInfiniteQuery({
    queryKey: ["audit", workspace.id],
    queryFn: ({ pageParam }) =>
      api<{ events: AuditRow[]; nextBefore: number | null }>(
        `/api/workspaces/${workspace.id}/audit${pageParam ? `?before=${pageParam}` : ""}`
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: allowed,
  });

  const guardrailQuery = useInfiniteQuery({
    queryKey: ["audit", "guardrails", workspace.id],
    queryFn: ({ pageParam }) =>
      api<{ events: AuditRow[]; nextBefore: number | null }>(
        `/api/workspaces/${workspace.id}/audit/guardrails${pageParam ? `?before=${pageParam}` : ""}`
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: allowed,
  });

  const auditRows = useMemo(
    () =>
      auditQuery.data?.pages.flatMap((p) =>
        p.events.map((e) => ({ ...e, source: "audit" as const }))
      ) ?? [],
    [auditQuery.data]
  );
  const guardrailRows = useMemo(
    () =>
      guardrailQuery.data?.pages.flatMap((p) =>
        p.events.map((e) => ({ ...e, source: "guardrail" as const }))
      ) ?? [],
    [guardrailQuery.data]
  );

  const rows = useMemo(() => {
    const merged = [...auditRows, ...guardrailRows];
    merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return merged;
  }, [auditRows, guardrailRows]);

  const isPending = auditQuery.isPending || guardrailQuery.isPending;
  const isError = auditQuery.isError || guardrailQuery.isError;
  const hasNextPage = auditQuery.hasNextPage || guardrailQuery.hasNextPage;
  const isFetchingNextPage = auditQuery.isFetchingNextPage || guardrailQuery.isFetchingNextPage;

  if (!allowed) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{t("settings.audit.title")}</h2>
        <p className="mt-2 text-base text-med">{denyReasonText(t, role as Role, "audit.view")}.</p>
      </Card>
    );
  }

  const fetchNextPage = () => {
    if (auditQuery.hasNextPage) auditQuery.fetchNextPage();
    if (guardrailQuery.hasNextPage) guardrailQuery.fetchNextPage();
  };

  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">{t("settings.audit.title")}</h2>
      <p className="mt-1 text-base text-med">{t("settings.audit.body")}</p>
      <div className="mt-4">
        {isPending ? (
          <Skeleton className="h-24" />
        ) : isError ? (
          <ErrorState
            title={t("settings.audit.loadError")}
            body={(auditQuery.error as Error)?.message ?? (guardrailQuery.error as Error)?.message ?? t("settings.audit.loadError")}
            onRetry={() => {
              auditQuery.refetch();
              guardrailQuery.refetch();
            }}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon="☰" title={t("settings.audit.empty")} />
        ) : (
          <ul className="divide-y divide-line" aria-label={t("settings.audit.listAria")}>
            {rows.map((r) => (
              <li key={`${r.source}-${r.id}`} className="motion-list-in flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-base">
                <span className="data text-sm text-muted">{t.date(r.at)}</span>
                <code dir="ltr" className="data text-sm text-hi">
                  {r.action}
                </code>
                <span className="text-med">{r.actorLabel ?? (r.source === "guardrail" ? t("settings.audit.guardrailActor") : "")}</span>
                {r.data && (
                  <span dir="ltr" className="data min-w-0 truncate text-sm text-muted">
                    {JSON.stringify(r.data)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasNextPage && (
          <Button className="mt-3" onClick={fetchNextPage} loading={isFetchingNextPage}>
            {t("settings.audit.loadOlder")}
          </Button>
        )}
      </div>
    </Card>
  );
}