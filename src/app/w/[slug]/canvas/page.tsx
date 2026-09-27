import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getCurrentUser, requireWorkspaceBySlug } from "@/server/access";

export const dynamic = "force-dynamic";

/** "Canvas" in the sidebar opens the most recently edited flow. */
export default async function CanvasEntry({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { slug } = await params;
  const row = await requireWorkspaceBySlug(user, slug);
  if (!row) notFound();
  const [recent] = await db
    .select({ id: schema.flow.id })
    .from(schema.flow)
    .where(and(eq(schema.flow.workspaceId, row.workspace.id), isNull(schema.flow.deletedAt)))
    .orderBy(desc(schema.flow.updatedAt))
    .limit(1);
  redirect(recent ? `/w/${slug}/flows/${recent.id}` : `/w/${slug}/flows?empty=canvas`);
}
