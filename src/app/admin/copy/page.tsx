import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { CopyEditor } from "./copy-editor";
import { platformAdminOrNull } from "@/server/platform-access";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("platformAdmin.copyEditor.title"), robots: { index: false, follow: false } };
}

export default async function CopyPage() {
  // Platform-admin gate (MUST 1–2): hide the panel from non-admins via notFound()
  if (!(await platformAdminOrNull())) {
    return notFound();
  }
  return <CopyEditor />;
}
