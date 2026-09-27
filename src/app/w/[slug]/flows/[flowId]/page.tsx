import { Builder } from "@/components/builder/builder";

export const metadata = { title: "Canvas" };

export default async function FlowPage({ params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  return <Builder flowId={flowId} />;
}
