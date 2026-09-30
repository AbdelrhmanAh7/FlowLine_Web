/**
 * Parallax gradient layers in the brand hues (accent / info / success glow tokens), drifting slower than the
 * scroll for depth. Decorative and static by default; the drift is a CSS scroll-driven animation where supported,
 * and never under prefers-reduced-motion.
 *
 * Stacking: the layer is `fixed` at `-z-10`, so the page wrapper MUST be a stacking context (`relative isolate`,
 * see src/app/page.tsx). Otherwise a negative z-index paints in the root context BELOW the wrapper's own
 * `bg-surface` and the gradients are covered. Inside the isolated wrapper the order is: wrapper background,
 * these layers, then the page content. Colours come from semantic glow tokens (`--glow-*`), never primitives.
 * The layers are fixed to the viewport, so each blob sits inside the first screen or two.
 */
export function ParallaxGradients() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="parallax-slow absolute -top-40 start-[8%] size-[34rem] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--glow-accent), transparent)" }}
      />
      <div
        className="parallax-slower absolute top-[60vh] end-[4%] size-[30rem] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--glow-info), transparent)" }}
      />
      <div
        className="parallax-slow absolute top-[85vh] start-[22%] size-[26rem] rounded-full opacity-15 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--glow-success), transparent)" }}
      />
    </div>
  );
}
