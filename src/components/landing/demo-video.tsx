"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Labels = { title: string; body: string; play: string; pause: string; captions: string };

/**
 * Recorded product demo (`pnpm demo:record` regenerates public/media/flowline-demo.*).
 * Lazy: preload="none" fetches no video bytes, and autoplay (muted) starts only once half the player is in view, so the
 * video never competes with the hero for LCP and a phone visitor below the fold downloads nothing. It pauses again off-screen.
 * prefers-reduced-motion (read after mount, like reveal.tsx, so server and client markup match): never autoplays; the poster
 * stays with a "Play demo" button. A rejected play() (autoplay policy) leaves the same paused state; a visitor's own pause
 * sticks. If the media files are missing the section hides instead of showing a dead player.
 */
export function DemoVideo({ locale, labels }: { locale: "ar" | "en"; labels: Labels }) {
  const ref = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia(REDUCED_MOTION).matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) v.pause();
        else if (!userPaused.current) v.play().catch(() => setPlaying(false));
      },
      { threshold: 0.5 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    userPaused.current = !v.paused;
    if (v.paused) v.play().catch(() => setPlaying(false));
    else v.pause();
  }

  if (broken) return null;
  return (
    <section id="demo" aria-label={labels.title} className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <h2 className="text-xl font-semibold">{labels.title}</h2>
      <p className="mt-1 text-base text-med">{labels.body}</p>
      <div className="relative mt-6 overflow-hidden rounded-xl border border-line bg-card">
        <video
          ref={ref}
          data-testid="demo-video"
          className="aspect-video w-full"
          muted
          loop
          playsInline
          preload="none"
          poster="/media/flowline-demo.jpg"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          <source src="/media/flowline-demo.mp4" type="video/mp4" />
          {/* The last source failing means no format could load (an error on <video> itself never fires for <source>). */}
          <source src="/media/flowline-demo.webm" type="video/webm" onError={() => setBroken(true)} />
          <track kind="captions" srcLang="en" label="English" src="/media/flowline-demo.en.vtt" default={locale === "en"} />
          <track kind="captions" srcLang="ar" label="العربية" src="/media/flowline-demo.ar.vtt" default={locale === "ar"} />
        </video>
        <button
          type="button"
          onClick={toggle}
          className="absolute end-3 bottom-3 h-10 rounded-lg border border-line-strong bg-surface/95 px-4 text-base text-hi hover:bg-elevated"
        >
          {playing ? labels.pause : labels.play}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">{labels.captions}</p>
    </section>
  );
}
