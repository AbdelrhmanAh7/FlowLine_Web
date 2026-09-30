import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { LANDING_TEMPLATES, LOCAL_TEMPLATES } from "@/engine/templates";
import type { NodeType } from "@/engine/types";
import { listProviders } from "@/integrations/registry";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { CATEGORY_HUE, Logo, type CategoryHue } from "@/components/ui";
import { FeatureScenes } from "@/components/landing/feature-scenes";
import { FlowScene } from "@/components/landing/flow-scene";
import { HeroPin } from "@/components/landing/hero-pin";
import { Magnetic } from "@/components/landing/magnetic";
import { ParallaxGradients } from "@/components/landing/parallax-gradients";
import { Reveal, WordReveal } from "@/components/landing/reveal";
import { ScrollRoot } from "@/components/landing/scroll-root";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import type { MessageKey } from "@/i18n/types";
import { LandingDocsLink } from "./landing-docs";

export const dynamic = "force-dynamic";

const btn = "inline-flex items-center justify-center whitespace-nowrap rounded-lg transition-colors duration-[var(--dur-base)]";

export default async function Landing() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const signedIn = Boolean(session);
  const t = await getT();
  // Built-in template copy is translated by id; anything else keeps the engine's English text.
  const tr = (key: string, fallback: string) => (t.has(key) ? t(key as MessageKey) : fallback);

  // Honesty: the integrations scene reads the real registry — every app shows its actual live status.
  const providers = listProviders().map((p) => ({ name: p.name, verified: p.verification.live === "verified" }));

  // Landing illustrations use visitor-friendly copy; product catalogue labels stay unchanged.
  const flowNodes = [
    { id: "t", type: "trigger.manual", label: t("landing.flowNodes.trigger"), sub: t("landing.flowNodes.triggerSub") },
    { id: "n", type: "transform.json", label: t("landing.flowNodes.normalise"), sub: t("landing.flowNodes.normaliseSub") },
    { id: "c", type: "logic.condition", label: t("landing.flowNodes.check"), sub: t("landing.flowNodes.checkSub") },
    { id: "a", type: "ai.extract", label: t("landing.flowNodes.enrich"), sub: t("landing.flowNodes.enrichSub") },
    { id: "o", type: "output", label: t("landing.flowNodes.output"), sub: t("landing.flowNodes.outputSub") },
  ] as const;

  return (
    <ScrollRoot>
      {/* relative + isolate: the wrapper is a stacking context so the -z-10 glow layers paint ABOVE its bg-surface, below the content. */}
      <div className="relative isolate min-h-dvh bg-surface">
        <ParallaxGradients />
        {/*
          Header layout (DV2-Q03/Q04). Never wider than the viewport, at any width from 360 up:
          - lg and up: ONE row, logo | nav | preferences | account actions (icon-only preferences until xl, labelled from xl).
          - below lg: TWO rows. Row 1 is logo | nav (md+) | account actions; row 2 is the preferences (Light/Dark/System, العربية/English), so a phone or
            tablet visitor can always change theme and language from the landing page. The wrapper below is `display: contents` there, which lets
            its two groups take part in this flex-wrap layout directly; the preferences are pushed to their own full-width line with `order-last`.
          flex-wrap is the safety net: if a translation ever makes a row too wide, a group drops to the next line instead of overflowing the page.
        */}
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-8 lg:min-h-16 lg:content-center lg:py-0">
          <Link href="/" aria-label={t("common.homeAria")} className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label={t("landing.navAria")} className="hidden items-center gap-6 text-base whitespace-nowrap text-med md:flex">
            <Link href="#product" className="hover:text-hi">{t("landing.nav.product")}</Link>
            <Link href="#templates" className="hover:text-hi">{t("landing.nav.templates")}</Link>
            <Link href="#pricing" className="hover:text-hi">{t("landing.nav.pricing")}</Link>
            <LandingDocsLink />
          </nav>
          <div className="contents lg:flex lg:items-center lg:gap-3">
            <div data-testid="landing-preferences" className="order-last flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 md:justify-end lg:order-none lg:w-auto lg:flex-nowrap lg:gap-3">
              <ThemeSwitcher compact="responsive" />
              <LanguageSwitcher compact="responsive" />
            </div>
            <div className="flex items-center gap-3">
              {signedIn ? (
                <Link href="/app" className={`${btn} motion-press h-9 bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover`}>
                  {t("landing.openApp")}
                </Link>
              ) : (
                <>
                  <Link href="/sign-in" className="text-base whitespace-nowrap text-med hover:text-hi">
                    {t("landing.signIn")}
                  </Link>
                  <Link href="/sign-up" className={`${btn} motion-press h-9 bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover`}>
                    {t("landing.startFree")}
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <main>
          <section id="product" className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-14 pb-16 text-center sm:px-8 sm:pt-20">
            <span className="rounded-full border border-line-strong bg-card px-3 py-1 text-sm text-med">{t("landing.badge")}</span>
            <h1 className="mt-6 max-w-3xl text-[34px] leading-[40px] font-semibold tracking-tight sm:text-[48px] sm:leading-[56px]">
              {/* The first line is the LCP text — it paints immediately; the accent line reveals word by word. */}
              {t("landing.heroTitle")}{" "}
              <span className="text-accent-text">
                <WordReveal text={t("landing.heroAccent")} />
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg font-normal text-med">
              {t("landing.heroBody")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Magnetic>
                <Link href={signedIn ? "/app" : "/sign-up"} className={`${btn} motion-press h-11 bg-accent px-5 text-base font-semibold text-on-accent hover:bg-accent-hover`}>
                  {t("landing.ctaStart")}
                </Link>
              </Magnetic>
              <Magnetic>
                <Link href={signedIn ? "/app" : "/sign-up?next=canvas"} className={`${btn} motion-press h-11 border border-line-strong bg-card px-5 text-base text-hi hover:bg-elevated`}>
                  {t("landing.ctaCanvas")}
                </Link>
              </Magnetic>
            </div>

            <HeroPin>
              <div
                aria-label={t("landing.canvasAria")}
                role="img"
                className="w-full overflow-hidden rounded-xl border border-line bg-app bg-[radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:16px_16px] p-6 sm:p-10"
              >
                <HeroFlow t={t} />
              </div>
            </HeroPin>
          </section>

          <FlowScene nodes={[...flowNodes]} title={t("landing.flowSceneTitle")} body={t("landing.flowSceneBody")} />

          <FeatureScenes
            title={t("landing.featuresTitle")}
            body={t("landing.featuresBody")}
            providersAria={t("shell.nav.integrations")}
            scenes={[
              // Same status word the app shows on the Copilot panel (copilot.beta): it is experimental, and the landing page says so.
              { id: "copilot", title: t("landing.scenes.copilot.title"), body: t("landing.scenes.copilot.body"), badge: t("copilot.beta") },
              { id: "agents", title: t("landing.scenes.agents.title"), body: t("landing.scenes.agents.body") },
              { id: "knowledge", title: t("landing.scenes.knowledge.title"), body: t("landing.scenes.knowledge.body") },
              { id: "integrations", title: t("landing.scenes.integrations.title"), body: t("landing.scenes.integrations.body") },
            ]}
            providers={providers}
            statusLabels={{ verified: t("landing.scenes.integrations.verifiedLive"), notVerified: t("landing.scenes.integrations.notVerified") }}
          />

          <section id="templates" className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
            <Reveal>
              <h2 className="text-xl font-semibold">
                <WordReveal text={t("landing.templatesTitle")} />
              </h2>
              <p className="mt-1 text-base text-med">{t("landing.templatesBody")}</p>
            </Reveal>
            {/* A short curated set; the in-app gallery lists every template (the count below is the real number). */}
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {LANDING_TEMPLATES.map((tpl, i) => (
                <Reveal key={tpl.id} delay={i * 0.05}>
                  <div className="h-full rounded-xl border border-line bg-card p-4">
                    <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{tr(`templateCategory.${tpl.category}`, tpl.category)}</p>
                    <p className="mt-2 text-lg font-semibold">{tr(`localTemplates.${tpl.id}.name`, tpl.name)}</p>
                    <p className="mt-1 text-base text-med">{tr(`localTemplates.${tpl.id}.description`, tpl.description)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="mt-4 text-base text-med">{t.plural("landing.templatesMore", LOCAL_TEMPLATES.length)}</p>
          </section>

          <section id="pricing" className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
            <Reveal>
              <div className="rounded-xl border border-line bg-card p-6">
                <h2 className="text-xl font-semibold">{t("landing.pricingTitle")}</h2>
                <p className="mt-1 max-w-2xl text-base text-med">{t("landing.pricingBody")}</p>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="border-t border-line py-6 text-center text-sm text-muted">{t("landing.footer")}</footer>
      </div>
    </ScrollRoot>
  );
}

function HeroFlow({ t }: { t: Translator }) {
  const nodes = [
    // Plain landing subtitles, with category colours from the real catalogue.
    { title: t("landing.heroNodes.trigger"), sub: t("landing.heroNodes.triggerSub"), type: "trigger.manual" },
    { title: t("landing.heroNodes.transform"), sub: t("landing.heroNodes.transformSub"), type: "transform.json" },
    { title: t("landing.heroNodes.condition"), sub: t("landing.heroNodes.conditionSub"), type: "logic.condition" },
  ].map((n) => ({ ...n, hue: CATEGORY_HUE[NODE_DEFINITIONS[n.type as NodeType].category] }));
  // The dot is the node's real category hue (same mapping as the canvas), so the illustration can't drift from the product.
  const HUE_BG: Record<CategoryHue, string> = { trigger: "bg-cat-trigger", logic: "bg-cat-logic", ai: "bg-cat-ai", app: "bg-cat-app", output: "bg-cat-output" };
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
      {nodes.map((n, i) => (
        <div key={n.title} className="flex items-center gap-0 sm:flex-1">
          <div className={`w-44 rounded-lg border bg-elevated shadow-[var(--shadow-popover)] px-3.5 py-3 text-start ${i === 1 ? "border-accent shadow-[var(--shadow-glow)]" : "border-line-strong"}`}>
            <p className="flex items-center gap-2 text-base font-semibold">
              <span className={`size-2 rounded-full ${HUE_BG[n.hue]}`} /> {n.title}
            </p>
            <p className="mt-0.5 text-xs tracking-[0.4px] text-muted">{n.sub}</p>
          </div>
          {i < nodes.length - 1 && <div className={`hidden h-px flex-1 sm:block ${i === 1 ? "border-t border-dashed border-accent" : "bg-line-strong"}`} />}
        </div>
      ))}
    </div>
  );
}
