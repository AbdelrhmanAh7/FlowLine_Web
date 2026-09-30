"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";
import { AgentForm, EMPTY_AGENT, type AgentConfig } from "../agent-form";

export default function NewAgentPage() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (c: AgentConfig) => api<{ agent: { id: string } }>(`/api/workspaces/${workspace.id}/agents`, { method: "POST", json: c }),
    onSuccess: ({ agent }) => router.push(`/w/${workspace.slug}/agents/${agent.id}`),
    onError: (e) => toast(apiErrorMessage(t, e, t("agents.createError")), "danger"),
  });
  return (
    <div className="flex flex-col">
      <PageHeader title={t("agents.newAgent")} />
      <div className="max-w-3xl p-4 sm:p-6">
        <AgentForm
          initial={EMPTY_AGENT}
          saving={create.isPending}
          onSave={(c) => create.mutate(c)}
          readOnlyReason={can(role as Role, "agent.edit") ? null : denyReasonText(t, role as Role, "agent.edit")}
          submitLabel={t("agents.create")}
        />
      </div>
    </div>
  );
}
