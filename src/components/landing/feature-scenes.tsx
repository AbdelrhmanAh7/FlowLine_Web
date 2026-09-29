"use client";

import { Blocks, Bot, BookOpen, Sparkles, type LucideIcon } from "lucide-react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { Badge, cn } from "@/components/ui";
import { Reveal, WordReveal } from "./reveal";

export interface FeatureScene {
  id: "copilot" | "agents" | "knowledge" | "integrations";
  title: string;
  body: string;
}

export interface ProviderStatus {
  name: string;
  verified: boolean;
}

const ICONS: Record<FeatureScene["id"], LucideIcon> = { copilot: Sparkles, agents: Bot, knowledge: BookOpen, integrations: Blocks };
const HUES: Record<FeatureScene["id"], { bg: string; fg: string }> = {
  copilot: { bg: "bg-cat-ai-bg", fg: "text-cat-ai" },
  agents: { bg: "bg-accent-bg", fg: "text-accent" },
  knowledge: { bg: "bg-cat-output-bg", fg: "text-cat-output" },
  integrations: { bg: "bg-cat-app-bg", fg: "text-cat-app" },
};

/**
 * Scroll-scrubbed feature scenes: cards pin briefly as they stack (CSS sticky — works without JS),
 * and a progress rail tracks which scene you're reading (JS enhancement). Mobile/reduced: plain stack.
 */
export function FeatureScenes({
  title,
  body,
  scenes,
  providers,
  statusLabels,
  progressAria,
}: {
  title: string;
  body: string;
  scenes: FeatureScene[];
  providers: ProviderStatus[];
  statusLabels: { verified: string; notVerified: string };
  progressAria: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(scenes.length - 1, Math.max(0, Math.floor(v * scenes.length)))));
  const pinned = !reduced;

  return (
    <section id="features" className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <Reveal>
        <h2 className="text-xl font-semibold">
          <WordReveal text={title} />
        </h2>
        <p className="mt-1 max-w-2xl text-base text-med">{body}</p>
      </Reveal>

      <div ref={ref} className="mt-10 lg:grid lg:grid-cols-[auto_1fr] lg:gap-10">
        {/* Progress rail (decorative; the scenes themselves carry the content). */}
        {pinned && (
          <div aria-hidden className="sticky top-1/3 mb-8 hidden h-fit flex-col items-center gap-2 lg:flex">
            <span className="sr-only">{progressAria}</span>
            {scenes.map((s, i) => (
              <div key={s.id} className="flex flex-col items-center gap-2">
                <span className={cn("size-2.5 rounded-full border transition-colors duration-[var(--dur-tab)]", i === active ? "border-accent bg-accent" : i < active ? "border-accent-border bg-accent-bg" : "border-line-strong bg-card")} />
                {i < scenes.length - 1 && <span className={cn("h-10 w-px", i < active ? "bg-accent" : "bg-line")} />}
              </div>
            ))}
          </div>
        )}

        <div>
          {scenes.map((s, i) => {
            const Icon = ICONS[s.id];
            const hue = HUES[s.id];
            return (
              <div key={s.id} className={cn(pinned && i < scenes.length - 1 && "lg:min-h-[105vh]")}>
                <div className={cn("rounded-xl border border-line bg-card p-6 sm:p-8", pinned && "lg:sticky lg:top-28")}>
                  <span aria-hidden className={cn("flex size-10 items-center justify-center rounded-lg", hue.bg)}>
                    <Icon className={cn("size-5", hue.fg)} />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">
                    <WordReveal text={s.title} />
                  </h3>
                  <p className="mt-2 max-w-xl text-base text-med">{s.body}</p>
                  {s.id === "integrations" && (
                    <ul className="mt-5 flex flex-wrap gap-2" aria-label={title}>
                      {providers.map((p) => (
                        <li key={p.name}>
                          <Badge tone={p.verified ? "success" : "muted"}>
                            {p.name}
                            <span className="font-normal opacity-80">· {p.verified ? statusLabels.verified : statusLabels.notVerified}</span>
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
