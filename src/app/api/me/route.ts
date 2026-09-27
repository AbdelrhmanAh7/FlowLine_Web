import { requireUser } from "@/server/access";
import { json, route } from "@/server/http";
import { getUserSettings, listWorkspaces } from "@/server/workspaces";

export const GET = route(async () => {
  const user = await requireUser();
  const [workspaces, settings] = await Promise.all([listWorkspaces(user), getUserSettings(user.id)]);
  return json({
    user,
    workspaces,
    onboarding: {
      completed: Boolean(settings?.onboardingCompletedAt) || Boolean(settings?.onboardingSkipped),
      skipped: settings?.onboardingSkipped ?? false,
      goal: settings?.onboardingGoal ?? null,
    },
    lastWorkspaceId: settings?.lastWorkspaceId ?? null,
  });
});
