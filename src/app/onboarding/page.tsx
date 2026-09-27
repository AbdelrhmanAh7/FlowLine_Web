import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/access";
import { getUserSettings, listWorkspaces } from "@/server/workspaces";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get started" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=onboarding");
  // A new account created from an invitation joins that workspace instead of creating one.
  const invite = /^invite:([A-Za-z0-9_-]{20,100})$/.exec((await searchParams).next ?? "");
  if (invite) redirect(`/invite/${invite[1]}`);
  const [settings, workspaces] = await Promise.all([getUserSettings(user.id), listWorkspaces(user)]);
  if ((settings?.onboardingCompletedAt || settings?.onboardingSkipped) && workspaces.length > 0) redirect("/app");
  return <OnboardingWizard user={user} existingWorkspace={workspaces[0] ?? null} />;
}
