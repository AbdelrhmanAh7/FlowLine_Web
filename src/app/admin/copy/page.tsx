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
  if (!(await platformAdminOrNull())) notFound();
  return <CopyEditor />;
}
