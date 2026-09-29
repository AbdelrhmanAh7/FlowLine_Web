import { notFound, redirect } from "next/navigation";
import { getCurrentUser, requireWorkspaceBySlug } from "@/server/access";
import { listWorkspaces } from "@/server/workspaces";
import { AppShell } from "@/components/shell/app-shell";
import { betaSupport } from "@/server/beta";

export const dynamic = "force-dynamic";

/** The shell (sidebar/header) renders on the server immediately — only data regions show skeletons. */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  const { slug } = await params;
  if (!user) redirect(`/sign-in`);
  const row = await requireWorkspaceBySlug(user, slug);
  if (!row) notFound();
  const workspaces = await listWorkspaces(user);
  return (
    <AppShell
      user={user}
      workspace={{ id: row.workspace.id, name: row.workspace.name, slug: row.workspace.slug, timezone: row.workspace.timezone, currency: row.workspace.currency ?? "USD" }}
      role={row.role}
      support={betaSupport()}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug, role: w.role }))}
    >
      {children}
    </AppShell>
  );
}
