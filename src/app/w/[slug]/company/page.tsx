"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, Card, ErrorState, SectionLabel, Skeleton } from "@/components/ui";
import { useLocale, useT } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import { api } from "@/lib/api";
import { can, type Role } from "@/lib/permissions";

interface SessionRow {
  id: string;
  status: string;
  updatedAt: string;
  profileVersion: number;
}

export default function CompanyBuilderHome() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { workspace, role } = useWorkspace();
  const canEdit = can(role as Role, "flow.edit");
  const base = `/api/workspaces/${workspace.id}/company-builder`;
  const sessions = useQuery({ queryKey: ["cb-sessions", workspace.id], queryFn: () => api<{ sessions: SessionRow[] }>(`${base}/sessions`) });
  const start = useMutation({
    mutationFn: () => api<{ session: { id: string } }>(`${base}/sessions`, { method: "POST", json: {} }),
    onSuccess: (d) => router.push(`/w/${workspace.slug}/company/${d.session.id}`),
  });

  return (
    <div className="flex flex-col">
      <PageHeader title={t("companyBuilder.title")} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <Card className="flex flex-col gap-4 p-6">
          <h2 className="text-2xl font-semibold text-hi">{t("companyBuilder.promise")}</h2>
          <p className="text-base text-med">{t("companyBuilder.supporting")}</p>
          <p className="text-sm text-muted">{t("companyBuilder.limits")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" loading={start.isPending} disabledReason={canEdit ? null : t("companyBuilder.disabledViewer")} onClick={() => start.mutate()} data-testid="cb-start">
              {t("companyBuilder.start")}
            </Button>
            <Link href={`/w/${workspace.slug}/flows`} className="text-sm text-accent-text hover:underline">
              {t("companyBuilder.advanced")}
            </Link>
          </div>
          {start.isError && (
            <p role="alert" className="text-sm text-danger">
              {t("companyBuilder.errors.generic")}
            </p>
          )}
        </Card>

        <section aria-labelledby="cb-previous">
          <SectionLabel className="mb-2">
            <span id="cb-previous">{t("companyBuilder.previous")}</span>
          </SectionLabel>
          {sessions.isPending ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : sessions.isError ? (
            <ErrorState title={t("companyBuilder.loadError")} onRetry={() => sessions.refetch()} />
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.data.sessions
                .filter((s) => s.status !== "archived")
                .map((s) => (
                  <li key={s.id}>
                    <Link href={`/w/${workspace.slug}/company/${s.id}`} className="flex items-center justify-between rounded-lg border border-line bg-card px-4 py-3 text-base hover:bg-elevated">
                      <span>{t("companyBuilder.resume")}</span>
                      <span className="text-sm text-muted">{t("companyBuilder.updated", { date: formatDate(locale, s.updatedAt) })}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
