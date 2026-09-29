"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * Parallax gradient layers in the new palette (violet / sky / emerald), drifting slower than the
 * scroll for depth. Decorative; transform-only; disabled with reduced motion and absent without JS.
 */
export function ParallaxGradients() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const slow = useTransform(scrollY, (v) => v * -0.08);
  const slower = useTransform(scrollY, (v) => v * -0.045);
  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -top-40 start-[8%] size-[34rem] rounded-full opacity-25 blur-3xl"
        style={{ y: slow, background: "radial-gradient(closest-side, var(--color-brand-500), transparent)" }}
      />
      <motion.div
        className="absolute top-[60vh] end-[4%] size-[30rem] rounded-full opacity-20 blur-3xl"
        style={{ y: slower, background: "radial-gradient(closest-side, var(--color-sky-500), transparent)" }}
      />
      <motion.div
        className="absolute top-[160vh] start-[22%] size-[26rem] rounded-full opacity-15 blur-3xl"
        style={{ y: slow, background: "radial-gradient(closest-side, var(--color-emerald-500), transparent)" }}
      />
    </div>
  );
}
