import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/access";
import { entryWorkspace } from "@/server/workspaces";

export const dynamic = "force-dynamic";

/**
 * Integrations without the workspace slug (a link in docs or support, or a check that cannot know the slug): the
 * signed-in user's entry workspace, picked as /app picks it for Flows.
 */
export default async function IntegrationsEntry() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const ws = await entryWorkspace(user);
  redirect(ws ? `/w/${ws.slug}/integrations` : "/onboarding");
}
