import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { platformAdminOrNull } from "@/server/platform-access";
import { CopyEditor } from "./copy-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("platformAdmin.copyEditor.title"), robots: { index: false, follow: false } };
}

export default async function CopyPage() {
  let adminOrNull: PlatformAdminContext | null = null;
  try {
    adminOrNull = await platformAdminOrNull();
  } catch (e) {
    console.error("[admin/copy] platformAdminOrNull error:", e);
    throw e;
  }
  if (!adminOrNull) notFound();
  return <CopyEditor />;
}
