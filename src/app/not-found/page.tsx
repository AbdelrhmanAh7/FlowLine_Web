import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import NotFound from "../not-found";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t("notFound.title")} · Flowline` };
}

export default async function NotFoundPage() {
  return <NotFound />;
}
