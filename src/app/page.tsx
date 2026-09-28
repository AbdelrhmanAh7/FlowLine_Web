import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/ui";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";
import { LandingDocsLink } from "./landing-docs";

export const dynamic = "force-dynamic";

const btn = "inline-flex items-center justify-center whitespace-nowrap rounded-lg transition-colors duration-[var(--dur-hover)]";

export default async function Landing() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const signedIn = Boolean(session);
  const t = await getT();
  // Built-in template copy is translated by id; anything else keeps the engine's English text.
  const tr = (key: string, fallback: string) => (t.has(key) ? t(key as MessageKey) : fallback);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" aria-label={t("common.homeAria")}>
          <Logo />
        </Link>
        <nav aria-label={t("landing.navAria")} className="hidden items-center gap-6 text-base text-med md:flex">
          <a href="#product" className="hover:text-hi">{t("landing.nav.product")}</a>
          <a href="#templates" className="hover:text-hi">{t("landing.nav.templates")}</a>
          <a href="#pricing" className="hover:text-hi">{t("landing.nav.pricing")}</a>
          <LandingDocsLink />
        </nav>
        <div className="flex items-center gap-3">
          <LanguageSwitcher className="hidden sm:flex" />
          {signedIn ? (
            <Link href="/app" className={`${btn} h-9 bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover`}>
              {t("landing.openApp")}
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="text-base text-med hover:text-hi">
                {t("landing.signIn")}
              </Link>
              <Link href="/sign-up" className={`${btn} h-9 bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover`}>
                {t("landing.startFree")}
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section id="product" className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-14 pb-16 text-center sm:px-8 sm:pt-20">
          <span className="rounded-full border border-line-strong bg-card px-3 py-1 text-sm text-med">{t("landing.badge")}</span>
          <h1 className="mt-6 max-w-3xl text-[34px] leading-[40px] font-semibold tracking-tight sm:text-[48px] sm:leading-[56px]">
            {t("landing.heroTitle")} <span className="text-accent">{t("landing.heroAccent")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg font-normal text-med">
            {t("landing.heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={signedIn ? "/app" : "/sign-up"} className={`${btn} h-11 bg-accent px-5 text-base font-semibold text-on-accent hover:bg-accent-hover`}>
              {t("landing.ctaStart")}
            </Link>
            <Link href={signedIn ? "/app" : "/sign-up?next=canvas"} className={`${btn} h-11 border border-line-strong bg-card px-5 text-base text-hi hover:bg-elevated`}>
              {t("landing.ctaCanvas")}
            </Link>
          </div>

          <HeroCanvas t={t} />
        </section>

        <section id="templates" className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
          <h2 className="text-xl font-semibold">{t("landing.templatesTitle")}</h2>
          <p className="mt-1 text-base text-med">{t("landing.templatesBody")}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {LOCAL_TEMPLATES.map((tpl) => (
              <div key={tpl.id} className="rounded-xl border border-line bg-card p-4">
                <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{tr(`templateCategory.${tpl.category}`, tpl.category)}</p>
                <p className="mt-2 text-lg font-semibold">{tr(`localTemplates.${tpl.id}.name`, tpl.name)}</p>
                <p className="mt-1 text-base text-med">{tr(`localTemplates.${tpl.id}.description`, tpl.description)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
          <div className="rounded-xl border border-line bg-card p-6">
            <h2 className="text-xl font-semibold">{t("landing.pricingTitle")}</h2>
            <p className="mt-1 max-w-2xl text-base text-med">{t("landing.pricingBody")}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">{t("landing.footer")}</footer>
    </div>
  );
}

function HeroCanvas({ t }: { t: Translator }) {
  const nodes = [
    { title: t("landing.heroNodes.trigger"), sub: "TRIGGER", dot: "bg-success" },
    { title: t("landing.heroNodes.transform"), sub: "JSON TRANSFORM", dot: "bg-success", selected: true },
    { title: t("landing.heroNodes.condition"), sub: "CONDITION", dot: "bg-info" },
  ];
  return (
    <div
      aria-label={t("landing.canvasAria")}
      role="img"
      className="mt-14 w-full max-w-4xl overflow-hidden rounded-xl border border-line bg-app bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)] [background-size:16px_16px] p-6 sm:p-10"
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        {nodes.map((n, i) => (
          <div key={n.title} className="flex items-center gap-0 sm:flex-1">
            <div className={`w-44 rounded-lg border bg-card px-3.5 py-3 text-start ${n.selected ? "border-accent shadow-[var(--shadow-glow)]" : "border-line"}`}>
              <p className="flex items-center gap-2 text-base font-semibold">
                <span className={`size-2 rounded-full ${n.dot}`} /> {n.title}
              </p>
              <p className="data mt-0.5 text-xs tracking-[0.4px] text-muted">{n.sub}</p>
            </div>
            {i < nodes.length - 1 && <div className={`hidden h-px flex-1 sm:block ${i === 1 ? "border-t border-dashed border-accent" : "bg-line-strong"}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}
