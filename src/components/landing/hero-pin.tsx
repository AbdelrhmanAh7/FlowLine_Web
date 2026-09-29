"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

/**
 * Pinned hero: the wrapper is taller than the viewport, the inner stage sticks, and the product visual
 * scales, tilts and settles as you scroll through it. Transform/opacity only. Without JS, with reduced
 * motion, or on small screens this is a plain static section (CSS sticky only kicks in at lg).
 */
export function HeroPin({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const scale = useTransform(p, [0, 0.7], [1, 0.94]);
  const rotateX = useTransform(p, [0, 0.7], [10, 0]);
  const y = useTransform(p, [0, 0.7], [0, -16]);

  if (reduced) return <div className="mt-14 w-full max-w-4xl">{children}</div>;
  return (
    <div ref={ref} className="w-full max-w-4xl lg:h-[170vh]">
      <div className="mt-14 lg:sticky lg:top-24" style={{ perspective: 900 }}>
        <motion.div style={{ scale, rotateX, y, transformStyle: "preserve-3d" }}>{children}</motion.div>
      </div>
    </div>
  );
}
