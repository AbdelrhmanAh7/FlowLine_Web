import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/access";
import { InviteAccept } from "./accept";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a workspace" };

/** Invitation landing page: sign in (or sign up) with the invited email, then accept. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`invite:${token}`)}`);
  return <InviteAccept token={token} email={user.email} />;
}
