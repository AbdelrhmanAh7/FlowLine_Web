"use client";

import { Blocks, Bot, BookOpen, Sparkles, type LucideIcon } from "lucide-react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { Badge, cn } from "@/components/ui";
import { Reveal, WordReveal } from "./reveal";

export interface FeatureScene {
  id: "copilot" | "agents" | "knowledge" | "integrations";
  title: string;
  body: string;
  /** Honest status label shown on the card (e.g. Copilot is experimental in the app). */
  badge?: string;
}

export interface ProviderStatus {
  name: string;
  verified: boolean;
}

const ICONS: Record<FeatureScene["id"], LucideIcon> = { copilot: Sparkles, agents: Bot, knowledge: BookOpen, integrations: Blocks };
const HUES: Record<FeatureScene["id"], { bg: string; fg: string }> = {
  copilot: { bg: "bg-cat-ai-bg", fg: "text-cat-ai" },
  agents: { bg: "bg-accent-bg", fg: "text-accent-text" },
  knowledge: { bg: "bg-cat-output-bg", fg: "text-cat-output" },
  integrations: { bg: "bg-cat-app-bg", fg: "text-cat-app" },
};

/**
 * Scroll-scrubbed feature scenes: cards pin briefly as they stack (pure CSS sticky — works without JS),
 * and a progress rail tracks which scene you're reading (JS enhancement, decorative). Markup is identical
 * on server and client; small screens get the plain stacked cards via CSS. The pinning (sticky cards, the
 * 105vh scene height, the rail) is `lg:motion-safe:` only: under prefers-reduced-motion the cards are plain
 * stacked content with no dead scroll space and no scroll-driven rail.
 *
 * The rail is purely decorative and `aria-hidden`, so it carries no text: assistive tech reads the scene cards in order
 * (each is a heading + paragraph), which is the whole content. (An sr-only label inside an aria-hidden node is never announced.)
 */
export function FeatureScenes({
  title,
  body,
  scenes,
  providers,
  statusLabels,
  providersAria,
}: {
  title: string;
  body: string;
  scenes: FeatureScene[];
  providers: ProviderStatus[];
  statusLabels: { verified: string; notVerified: string };
  /** Accessible name of the providers list ("Integrations"). */
  providersAria: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(scenes.length - 1, Math.max(0, Math.floor(v * scenes.length)))));

  return (
    <section id="features" className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <Reveal>
        <h2 id="features-heading" className="text-xl font-semibold">
          <WordReveal text={title} />
        </h2>
        <p className="mt-1 max-w-2xl text-base text-med">{body}</p>
      </Reveal>

      <nav aria-labelledby="features-heading" className="mt-6 flex flex-wrap gap-2">
        {scenes.map((scene, index) => (
          <a key={scene.id} href={`/?section=feature-${scene.id}`} aria-current={active === index ? "location" : undefined}
            onClick={() => setActive(index)} className={cn("rounded-lg border px-3 py-2 text-sm transition-colors duration-[var(--dur-base)] motion-reduce:transition-none", active === index ? "border-accent bg-accent-bg text-accent-text" : "border-line bg-card text-med hover:text-hi")}>
            {scene.title}
          </a>
        ))}
      </nav>
      <div ref={ref} className="mt-10 lg:motion-safe:grid lg:motion-safe:grid-cols-[auto_1fr] lg:motion-safe:gap-10">
        {/* Progress rail (decorative and aria-hidden; the scenes themselves carry the content). */}
        <div aria-hidden className="sticky top-1/3 mb-8 hidden h-fit flex-col items-center gap-2 lg:motion-safe:flex">
          {scenes.map((s, i) => (
            <div key={s.id} className="flex flex-col items-center gap-2">
              <span className={cn("size-2.5 rounded-full border transition-colors duration-[var(--dur-tab)]", i === active ? "border-accent bg-accent" : i < active ? "border-accent-border bg-accent-bg" : "border-line-strong bg-card")} />
              {i < scenes.length - 1 && <span className={cn("h-10 w-px", i < active ? "bg-accent" : "bg-line")} />}
            </div>
          ))}
        </div>

        <div>
          {scenes.map((s, i) => {
            const Icon = ICONS[s.id];
            const hue = HUES[s.id];
            return (
              <div id={`feature-${s.id}`} key={s.id} className={cn("scroll-mt-28", i < scenes.length - 1 && "lg:motion-safe:min-h-[105vh]")}>
                <div className="rounded-xl border border-line bg-card p-6 sm:p-8 lg:motion-safe:sticky lg:motion-safe:top-28">
                  <div className="flex items-center justify-between gap-3">
                    <span aria-hidden className={cn("flex size-10 items-center justify-center rounded-lg", hue.bg)}>
                      <Icon className={cn("size-5", hue.fg)} />
                    </span>
                    {s.badge && <Badge tone="warning">{s.badge}</Badge>}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
                    <WordReveal text={s.title} />
                  </h3>
                  <p className="mt-2 max-w-xl text-base text-med">{s.body}</p>
                  {s.id === "integrations" && (
                    <ul className="mt-5 flex flex-wrap gap-2" aria-label={providersAria}>
                      {providers.map((p) => (
                        <li key={p.name}>
                          <Badge tone={p.verified ? "success" : "muted"}>
                            {p.name}
                            <span className="font-normal">· {p.verified ? statusLabels.verified : statusLabels.notVerified}</span>
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
