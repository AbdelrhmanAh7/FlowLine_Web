"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button, Card, ErrorState, Skeleton } from "@/components/ui";
import { useT } from "@/i18n/client";
import { apiErrorMessage } from "@/i18n/errors";
import type { MessageKey } from "@/i18n/types";
import { api } from "@/lib/api";

interface Preview {
  workspaceName: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  emailMatches: boolean;
  invitedEmail: string;
}

export function InviteAccept({ token, email }: { token: string; email: string }) {
  const t = useT();
  const router = useRouter();
  const q = useQuery({ queryKey: ["invite", token], queryFn: () => api<Preview>(`/api/invites/${token}`), retry: false });
  const accept = useMutation({
    mutationFn: () => api<{ slug: string }>(`/api/invites/${token}`, { method: "POST" }),
    onSuccess: (r) => router.replace(`/w/${r.slug}/flows`),
  });
  const p = q.data;
  const roleName = (role: string) => (t.has(`roles.${role}`) ? t(`roles.${role}` as MessageKey) : role);
  // E-mail addresses stay left-to-right inside Arabic sentences (Unicode isolates, invisible otherwise).
  const ltr = (v: string) => (t.locale === "ar" ? `⁦${v}⁩` : v);
  const reason = !p
    ? t("common.loading")
    : p.status !== "pending"
      ? t("invite.statusReason", { status: t(`invite.status.${p.status}`) })
      : !p.emailMatches
        ? t("invite.emailMismatch", { invited: ltr(p.invitedEmail), email: ltr(email) })
        : null;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-app p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">{t("invite.title")}</h1>
          <LanguageSwitcher />
        </div>
        {q.isPending ? (
          <Skeleton className="mt-4 h-20" />
        ) : q.isError ? (
          <div className="mt-4">
            <ErrorState title={t("invite.notFound")} body={apiErrorMessage(t, q.error)} />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-base text-med">
              {t.rich("invite.invited", {
                workspace: <strong className="text-hi">{p!.workspaceName}</strong>,
                role: <strong className="text-hi">{roleName(p!.role)}</strong>,
              })}
            </p>
            {accept.isError && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                {apiErrorMessage(t, accept.error, t("invite.acceptError"))}
              </p>
            )}
            <Button variant="primary" loading={accept.isPending} disabledReason={reason} onClick={() => accept.mutate()}>
              {t("invite.accept")}
            </Button>
            {p && !p.emailMatches && <p className="text-sm text-muted">{t("invite.signOutHint", { invited: ltr(p.invitedEmail) })}</p>}
          </div>
        )}
      </Card>
    </main>
  );
}
