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
export function HeroPin({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero-pin w-full max-w-4xl">
      <div className="hero-pin-stage" style={{ perspective: 900 }}>
        <div className="hero-scrub">{children}</div>
      </div>
    </div>
  );
}
