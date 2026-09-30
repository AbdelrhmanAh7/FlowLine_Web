import type { Metadata } from "next";
import { Builder } from "@/components/builder/builder";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.canvas") };
}

export default async function FlowPage({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  return <Builder flowId={flowId} />;
}
