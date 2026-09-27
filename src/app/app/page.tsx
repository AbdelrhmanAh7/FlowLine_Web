import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/access";
import { getUserSettings, listWorkspaces } from "@/server/workspaces";

export const dynamic = "force-dynamic";

/** Entry point after sign-in: routes to onboarding or the last-used workspace. */
export default async function AppEntry({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const [settings, workspaces] = await Promise.all([getUserSettings(user.id), listWorkspaces(user)]);
  const onboarded = Boolean(settings?.onboardingCompletedAt || settings?.onboardingSkipped);
  if (!onboarded || workspaces.length === 0) redirect("/onboarding");
  const ws = workspaces.find((w) => w.id === settings?.lastWorkspaceId) ?? workspaces[0]!;
  const { next } = await searchParams;
  if (next === "canvas") {
    const [recent] = await db
      .select({ id: schema.flow.id })
      .from(schema.flow)
      .where(and(eq(schema.flow.workspaceId, ws.id), isNull(schema.flow.deletedAt)))
      .orderBy(desc(schema.flow.updatedAt))
      .limit(1);
    if (recent) redirect(`/w/${ws.slug}/flows/${recent.id}`);
  }
  redirect(`/w/${ws.slug}/flows`);
}
