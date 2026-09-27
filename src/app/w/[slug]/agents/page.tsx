"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { ButtonLink, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { can, denyReason, type Role } from "@/lib/permissions";

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
  const { workspace, role } = useWorkspace();
  const canEdit = can(role as Role, "agent.edit");
  const q = useQuery({ queryKey: ["agents", workspace.id], queryFn: () => api<{ agents: AgentRow[] }>(`/api/workspaces/${workspace.id}/agents`), select: (d) => d.agents });
  return (
    <div className="flex flex-col">
      <PageHeader title="Agents" sub="AI agents that answer from your knowledge and run your published workflows — every tool call is allowed, asked or denied by policy.">
        {canEdit && (
          <ButtonLink href={`/w/${workspace.slug}/agents/new`} variant="primary">
            New agent
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
          <ErrorState title="Couldn't load agents" body={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon="✦"
            title="No agents yet"
            body={canEdit ? "Create an agent, give it knowledge and published workflows as tools, and chat with it." : denyReason(role as Role, "agent.edit")}
            action={
              canEdit ? (
                <ButtonLink href={`/w/${workspace.slug}/agents/new`} variant="primary">
                  New agent
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Agents">
            {q.data.map((a) => (
              <li key={a.id}>
                <Link href={`/w/${workspace.slug}/agents/${a.id}`} className="block h-full rounded-xl focus-visible:outline-none">
                  <Card className="flex h-full flex-col gap-2 p-4 hover:border-line-strong">
                    <p className="text-lg font-semibold">{a.name}</p>
                    <p className="line-clamp-2 flex-1 text-base text-med">{a.description || "No description"}</p>
                    <p className="data text-xs text-muted uppercase">
                      v{a.version ?? "—"} · {(a.tools ?? []).map((t) => `${t.tool.replace("_", " ")} (${t.permission})`).join(", ") || "no tools"} · updated {timeAgo(a.updatedAt)}
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
