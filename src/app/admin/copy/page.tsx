import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { CopyEditor } from "./copy-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("platformAdmin.copyEditor.title"), robots: { index: false, follow: false } };
}

export default async function CopyPage() {
  return <CopyEditor />;
}
