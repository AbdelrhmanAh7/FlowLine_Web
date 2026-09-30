import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Logo } from "@/components/ui";
import { getT } from "@/i18n/server";
import { HttpError } from "@/server/http";
import { requirePlatformAdmin } from "@/server/platform-access";
import { PlatformPanel } from "./panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("platformAdmin.title"), robots: { index: false, follow: false } };
}

/**
 * Platform admin panel. Anyone who isn't an active platform admin gets the app's ordinary 404 (the panel's existence
 * isn't confirmed). Nothing secret is rendered on the server: the client loads write-only projections.
 */
export default async function AdminPage() {
  let blocked: "reauth" | "totp" | "email" | null = null;
  try {
    await requirePlatformAdmin();
  } catch (e) {
    if (!(e instanceof HttpError) || e.status === 404) notFound();
    blocked = e.code === "PLATFORM_REAUTH_REQUIRED" ? "reauth" : e.code === "PLATFORM_TOTP_REQUIRED" ? "totp" : e.code === "PLATFORM_EMAIL_UNVERIFIED" ? "email" : null;
    if (!blocked) notFound();
  }
  if (blocked) {
    const t = await getT();
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4">
        <Logo />
        <Card className="p-5">
          <h1 className="text-lg font-semibold">{t(`platformAdmin.blocked.${blocked}Title`)}</h1>
          <p className="mt-2 text-base text-med">{t(`platformAdmin.blocked.${blocked}`)}</p>
          <Link className="mt-4 inline-block text-accent-text hover:underline" href="/sign-in">
            {t("platformAdmin.blocked.signIn")}
          </Link>
        </Card>
      </main>
    );
  }
  return <PlatformPanel />;
}
