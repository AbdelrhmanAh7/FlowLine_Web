"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { FlowIllustration, type IllustrationNode } from "./flow-illustration";
import { useFlowProgress } from "./flow-progress";
import { FlowStepPreview } from "./flow-step-preview";

/** Scroll and keyboard/click share one step. Reduced motion has no pin or dead scroll space. */
export function FlowScene({ nodes, title, body }: { nodes: IllustrationNode[]; title: string; body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const progress = useFlowProgress(scrollYProgress, nodes.length);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedAt = useRef(0);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    // On phones/reduced motion, scrolling to the preview must preserve the clicked step.
    // Desktop scroll resumes the walkthrough only when it crosses another step boundary.
    if (selected !== null && window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches &&
      Math.floor(value * nodes.length) !== Math.floor(selectedAt.current * nodes.length)) setSelected(null);
  });
  const select = (index: number) => {
    selectedAt.current = scrollYProgress.get();
    setSelected(index);
  };
  const active = selected ?? progress - 1;
  const node = nodes[active];
  return (
    <section id="flow-demo" ref={ref} data-testid="landing-flow-scene" className="lg:motion-safe:h-[220vh]">
      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-8 lg:motion-safe:sticky lg:motion-safe:top-0 lg:motion-safe:flex lg:motion-safe:min-h-dvh lg:motion-safe:flex-col lg:motion-safe:justify-center lg:motion-safe:pb-0">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-2xl text-base text-med">{body}</p>
        <div className="mt-6 rounded-xl border border-line bg-app bg-[radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:16px_16px] p-4 sm:p-6">
          <FlowIllustration nodes={nodes} lit={active + 1} onSelect={select} />
        </div>
        <FlowStepPreview node={node} step={active} />
      </div>
    </section>
  );
}
