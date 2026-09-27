import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { Logo } from "@/components/ui";
import { LandingDocsLink } from "./landing-docs";

export const dynamic = "force-dynamic";

const btn = "inline-flex items-center justify-center whitespace-nowrap rounded-lg transition-colors duration-[var(--dur-hover)]";

export default async function Landing() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const signedIn = Boolean(session);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" aria-label="Flowline home">
          <Logo />
        </Link>
        <nav aria-label="Marketing" className="hidden items-center gap-6 text-base text-med md:flex">
          <a href="#product" className="hover:text-hi">Product</a>
          <a href="#templates" className="hover:text-hi">Templates</a>
          <a href="#pricing" className="hover:text-hi">Pricing</a>
          <LandingDocsLink />
        </nav>
        <div className="flex items-center gap-3">
          {signedIn ? (
            <Link href="/app" className={`${btn} h-9 bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover`}>
              Open app
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="text-base text-med hover:text-hi">
                Sign in
              </Link>
              <Link href="/sign-up" className={`${btn} h-9 bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover`}>
                Start free
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section id="product" className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-14 pb-16 text-center sm:px-8 sm:pt-20">
          <span className="rounded-full border border-line-strong bg-card px-3 py-1 text-sm text-med">✦ Preview · local nodes, real runs</span>
          <h1 className="mt-6 max-w-3xl text-[34px] leading-[40px] font-semibold tracking-tight sm:text-[48px] sm:leading-[56px]">
            Automate anything. <span className="text-accent">No code required.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg font-normal text-med">
            The visual workflow platform. Drag nodes, wire them together, and run real automations — every step recorded and inspectable.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={signedIn ? "/app" : "/sign-up"} className={`${btn} h-11 bg-accent px-5 text-base font-semibold text-on-accent hover:bg-accent-hover`}>
              Start building — free
            </Link>
            <Link href={signedIn ? "/app" : "/sign-up?next=canvas"} className={`${btn} h-11 border border-line-strong bg-card px-5 text-base text-hi hover:bg-elevated`}>
              Try the canvas →
            </Link>
          </div>

          <HeroCanvas />
        </section>

        <section id="templates" className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
          <h2 className="text-xl font-semibold">Start from a template</h2>
          <p className="mt-1 text-base text-med">Every template below runs today on local nodes — no API keys needed.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {LOCAL_TEMPLATES.map((t) => (
              <div key={t.id} className="rounded-xl border border-line bg-card p-4">
                <p className="text-xs font-medium tracking-[0.4px] text-muted uppercase">{t.category}</p>
                <p className="mt-2 text-lg font-semibold">{t.name}</p>
                <p className="mt-1 text-base text-med">{t.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
          <div className="rounded-xl border border-line bg-card p-6">
            <h2 className="text-xl font-semibold">Pricing</h2>
            <p className="mt-1 max-w-2xl text-base text-med">
              Pricing hasn&apos;t been announced. During the preview, building and running local flows is free and nothing is billed.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">Flowline preview</footer>
    </div>
  );
}

function HeroCanvas() {
  const nodes = [
    { title: "Manual trigger", sub: "TRIGGER", dot: "bg-success" },
    { title: "Normalise lead", sub: "JSON TRANSFORM", dot: "bg-success", selected: true },
    { title: "50+ employees?", sub: "CONDITION", dot: "bg-info" },
  ];
  return (
    <div
      aria-label="Illustration of a flow on the canvas"
      role="img"
      className="mt-14 w-full max-w-4xl overflow-hidden rounded-xl border border-line bg-app bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)] [background-size:16px_16px] p-6 sm:p-10"
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        {nodes.map((n, i) => (
          <div key={n.title} className="flex items-center gap-0 sm:flex-1">
            <div className={`w-44 rounded-lg border bg-card px-3.5 py-3 text-left ${n.selected ? "border-accent shadow-[var(--shadow-glow)]" : "border-line"}`}>
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
