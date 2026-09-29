import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { SetupFlow } from "./setup-flow";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("platformAdmin.setup.title"), robots: { index: false, follow: false } };
}

/**
 * First-admin setup / recovery. The page itself reveals nothing: without an operator-issued code (redeemed into an
 * httpOnly setup-session cookie) the API behind it answers 404.
 */
export default function SetupPage() {
  return <SetupFlow />;
}
