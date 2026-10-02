"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { FlowIllustration, type IllustrationNode } from "./flow-illustration";
import { useFlowProgress } from "./flow-progress";
import { FlowStepPreview } from "./flow-step-preview";
import { Reveal } from "./reveal";

/**
 * Pinned hero: the wrapper (`.hero-pin`) is taller than the viewport and the inner stage sticks; the product visual
 * scales, tilts and settles while the stage is pinned. Pure CSS: sticky + a scroll-driven animation where supported.
 * The scrub (`.hero-scrub`) is driven by the WRAPPER's named view timeline (`view-timeline: --hero-pin`), not by a
 * `view()` on itself: an element inside a sticky stage does not move relative to the viewport while pinned, so its own
 * view progress would only advance at pin release. Static, fully visible everywhere else — no JS, small screens,
 * no scroll-timeline support, prefers-reduced-motion: the 170vh pin, the sticky stage, the timeline and the scrub are all
 * declared in globals.css inside ONE `@supports (animation-timeline: view())` + `(min-width: 1024px)` +
 * `(prefers-reduced-motion: no-preference)` block, so the fallback has no dead scroll space. The markup is the same in
 * every case. Transform only, no layout shift.
 */
export function HeroPin({ nodes, label }: { nodes: IllustrationNode[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const lit = useFlowProgress(scrollYProgress, nodes.length);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedAt = useRef(0);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (selected !== null && window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches && Math.floor(value * nodes.length) !== Math.floor(selectedAt.current * nodes.length)) setSelected(null);
  });
  const active = selected ?? lit - 1;
  return (
    <div ref={ref} data-testid="landing-hero-scene" className="hero-pin w-full max-w-4xl">
      <div className="hero-pin-stage" style={{ perspective: 900 }}>
        <div className="hero-scrub">
          <div role="group" aria-label={label} className="w-full rounded-xl border border-line bg-app bg-[radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:16px_16px] p-6 sm:p-10">
            <FlowIllustration nodes={nodes} lit={active + 1} onSelect={(index) => { selectedAt.current = scrollYProgress.get(); setSelected(index); }} />
          </div>
          <Reveal><FlowStepPreview node={nodes[active]} step={active} testId="landing-hero-step-preview" /></Reveal>
        </div>
      </div>
    </div>
  );
}
