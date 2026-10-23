import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Dashboard } from "../flows/dashboard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.flows") };
}

export default function WorkspaceDashboardPage() {
  return <Dashboard />;
}
