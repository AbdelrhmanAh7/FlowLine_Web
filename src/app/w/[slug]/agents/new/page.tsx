"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { can, denyReason, type Role } from "@/lib/permissions";
import { AgentForm, EMPTY_AGENT, type AgentConfig } from "../agent-form";

export default function NewAgentPage() {
  const { workspace, role } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (c: AgentConfig) => api<{ agent: { id: string } }>(`/api/workspaces/${workspace.id}/agents`, { method: "POST", json: c }),
    onSuccess: ({ agent }) => router.push(`/w/${workspace.slug}/agents/${agent.id}`),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't create the agent", "danger"),
  });
  return (
    <div className="flex flex-col">
      <PageHeader title="New agent" />
      <div className="max-w-3xl p-4 sm:p-6">
        <AgentForm initial={EMPTY_AGENT} saving={create.isPending} onSave={(c) => create.mutate(c)} readOnlyReason={can(role as Role, "agent.edit") ? null : denyReason(role as Role, "agent.edit")} submitLabel="Create agent" />
      </div>
    </div>
  );
}
