"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorState, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Preview {
  workspaceName: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  emailMatches: boolean;
  invitedEmail: string;
}

export function InviteAccept({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ["invite", token], queryFn: () => api<Preview>(`/api/invites/${token}`), retry: false });
  const accept = useMutation({
    mutationFn: () => api<{ slug: string }>(`/api/invites/${token}`, { method: "POST" }),
    onSuccess: (r) => router.replace(`/w/${r.slug}/flows`),
  });
  const p = q.data;
  const reason = !p
    ? "Loading…"
    : p.status !== "pending"
      ? `This invitation is ${p.status}`
      : !p.emailMatches
        ? `This invitation is for ${p.invitedEmail}; you're signed in as ${email}`
        : null;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-app p-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Join a workspace</h1>
        {q.isPending ? (
          <Skeleton className="mt-4 h-20" />
        ) : q.isError ? (
          <div className="mt-4">
            <ErrorState title="Invitation not found" body={(q.error as Error).message} />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-base text-med">
              You&apos;ve been invited to <strong className="text-hi">{p!.workspaceName}</strong> as <strong className="text-hi capitalize">{p!.role}</strong>.
            </p>
            {accept.isError && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                {accept.error instanceof ApiError ? accept.error.message : "Couldn't accept the invitation"}
              </p>
            )}
            <Button variant="primary" loading={accept.isPending} disabledReason={reason} onClick={() => accept.mutate()}>
              Accept invitation
            </Button>
            {p && !p.emailMatches && <p className="text-sm text-muted">Sign out and sign in (or create an account) with {p.invitedEmail} to accept.</p>}
          </div>
        )}
      </Card>
    </main>
  );
}
