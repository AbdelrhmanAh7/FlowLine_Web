import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/access";
import { getUserSettings, listWorkspaces } from "@/server/workspaces";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=onboarding");
  const [settings, workspaces] = await Promise.all([getUserSettings(user.id), listWorkspaces(user)]);
  if ((settings?.onboardingCompletedAt || settings?.onboardingSkipped) && workspaces.length > 0) redirect("/app");
  return <OnboardingWizard user={user} existingWorkspace={workspaces[0] ?? null} />;
}
