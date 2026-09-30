import Link from "next/link";
import { Logo } from "@/components/ui";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-app px-4 text-center">
      <Logo />
      <p className="data mt-6 text-sm text-muted">404</p>
      <h1 className="text-xl font-semibold">{t("notFound.title")}</h1>
      <p className="max-w-sm text-base text-med">{t("notFound.body")}</p>
      <Link href="/app" className="mt-2 inline-flex h-9 items-center rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover">
        {t("notFound.home")}
      </Link>
    </div>
  );
}
