"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { ButtonLink, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { agentToolSummary } from "@/i18n/workspace-text";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";

interface AgentRow {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  version: number | null;
  tools: { tool: string; permission: string }[] | null;
  provider: string | null;
  model: string | null;
}

export default function AgentsPage() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const canEdit = can(role as Role, "agent.edit");
  const q = useQuery({ queryKey: ["agents", workspace.id], queryFn: () => api<{ agents: AgentRow[] }>(`/api/workspaces/${workspace.id}/agents`), select: (d) => d.agents });
  return (
    <div className="flex flex-col">
      <PageHeader title={t("agents.title")} sub={t("agents.sub")}>
        {canEdit && (
          <ButtonLink href={`/w/${workspace.slug}/agents/new`} variant="primary">
            {t("agents.newAgent")}
          </ButtonLink>
        )}
      </PageHeader>
      <div className="p-4 sm:p-6">
        {q.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState title={t("agents.loadError")} body={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon="✦"
            title={t("agents.emptyTitle")}
            body={canEdit ? t("agents.emptyBody") : denyReasonText(t, role as Role, "agent.edit")}
            action={
              canEdit ? (
                <ButtonLink href={`/w/${workspace.slug}/agents/new`} variant="primary">
                  {t("agents.newAgent")}
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t("agents.listAria")}>
            {q.data.map((a) => (
              <li key={a.id}>
                <Link href={`/w/${workspace.slug}/agents/${a.id}`} className="block h-full rounded-xl focus-visible:outline-none">
                  <Card className="flex h-full flex-col gap-2 p-4 hover:border-line-strong">
                    <p className="text-lg font-semibold">{a.name}</p>
                    <p className="line-clamp-2 flex-1 text-base text-med">{a.description || t("agents.noDescription")}</p>
                    <p className="data text-xs text-muted uppercase">
                      {t("agents.cardMeta", { version: a.version ?? "—", tools: agentToolSummary(t, a.tools ?? []), ago: t.relative(a.updatedAt) })}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
