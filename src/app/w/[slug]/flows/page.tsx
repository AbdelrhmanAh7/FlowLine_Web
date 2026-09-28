import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { Dashboard } from "./dashboard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.flows") };
}

export default function FlowsPage() {
  return <Dashboard />;
}
