import { CompanyBuilderSession } from "@/components/company-builder/session";

export default async function CompanyBuilderSessionPage({ params }: { params: Promise<{ sid: string }> }) {
  const { sid } = await params;
  return <CompanyBuilderSession sessionId={sid} />;
}
