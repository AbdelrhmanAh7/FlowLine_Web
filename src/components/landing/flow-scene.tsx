"use client";

import { useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { FlowIllustration, type IllustrationNode } from "./flow-illustration";

/**
 * "A flow drawing itself": the wrapper is tall, the stage sticks, and scroll progress lights the nodes
 * one by one — like a run walking the steps. Server HTML renders the flow fully lit, so without JS the
 * scene is static and complete. The pin (tall wrapper + sticky stage) exists only on large screens AND only
 * when motion is allowed (`lg:motion-safe:`): under prefers-reduced-motion the section is plain flow
 * content — no dead scroll height, no sticky — and the flow is fully lit (no scrub).
 */
export function FlowScene({ nodes, title, body }: { nodes: IllustrationNode[]; title: string; body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const p = useSpring(scrollYProgress, { stiffness: 80, damping: 22 });
  // Scroll progress → how many of the nodes are lit (0 … nodes.length).
  const lit = useTransform(p, (v) => Math.round(Math.min(nodes.length, Math.max(0, ((v - 0.15) / 0.6) * nodes.length))));

  return (
    <div ref={ref} className="lg:motion-safe:h-[220vh]">
      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-8 lg:motion-safe:sticky lg:motion-safe:top-0 lg:motion-safe:flex lg:motion-safe:h-dvh lg:motion-safe:flex-col lg:motion-safe:justify-center lg:motion-safe:pb-0">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-2xl text-base text-med">{body}</p>
        <div className="mt-10 hidden lg:block">
          <LitFlow nodes={nodes} lit={lit} />
        </div>
        {/* Small screens: no pinning, the flow is simply complete. */}
        <div className="lg:hidden">
          <FlowCard nodes={nodes} lit={nodes.length} />
        </div>
      </div>
    </div>
  );
}

function FlowCard({ nodes, lit }: { nodes: IllustrationNode[]; lit: number }) {
  return (
    <div className="mt-10 overflow-x-auto rounded-xl border border-line bg-app bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)] [background-size:16px_16px] p-6 sm:p-10">
      <FlowIllustration nodes={nodes} lit={lit} />
    </div>
  );
}

/** Renders the illustration with a scroll-driven lit count (client only; reduced motion → fully lit). */
function LitFlow({ nodes, lit }: { nodes: IllustrationNode[]; lit: MotionValue<number> }) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const unsub = lit.on("change", cb);
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => {
        unsub();
        mq.removeEventListener("change", cb);
      };
    },
    [lit],
  );
  const n = useSyncExternalStore(
    subscribe,
    () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? nodes.length : Math.round(lit.get())),
    () => nodes.length,
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-app bg-[radial-gradient(var(--color-elevated)_1px,transparent_1px)] [background-size:16px_16px] p-6 sm:p-10">
      <FlowIllustration nodes={nodes} lit={n} />
    </div>
  );
}
