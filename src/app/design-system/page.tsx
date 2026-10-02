import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Guide } from "./guide";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("meta.designSystem"), robots: { index: false, follow: false } };
}

/**
 * Internal living style guide: every token, component, variant and motion primitive, in both themes
 * and both directions. Development and the test stack only — production returns 404 (like the other
 * test-only routes) unless FLOWLINE_ENV=test.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production" && process.env.FLOWLINE_ENV !== "test") notFound();
  return <Guide />;
}
