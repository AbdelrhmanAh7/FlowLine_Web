import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Card, StatusBadge } from "@/components/ui";
import { getT } from "@/i18n/server";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/access";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.accountSecurity") };
}

/** Account security: read-only two-step verification status (enable/disable follow in later parts). */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const [row] = await db.select({ on: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, user.id));
  const t = await getT();
  const on = Boolean(row?.on);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 p-6">
      <Card className="flex flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-hi">{t("account.security.title")}</h1>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-hi">{t("account.security.twoFactor.title")}</h2>
          <StatusBadge tone={on ? "success" : "muted"}>{on ? t("account.security.twoFactor.on") : t("account.security.twoFactor.off")}</StatusBadge>
        </div>
        <Link href="/" className="text-sm text-muted underline">
          {t("account.security.back")}
        </Link>
      </Card>
    </main>
  );
}
