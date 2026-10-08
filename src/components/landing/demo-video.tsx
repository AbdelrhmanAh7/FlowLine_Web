"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Labels = { title: string; body: string; play: string; pause: string; captions: string };

/**
 * Recorded product demo (`pnpm demo:record` regenerates public/media/flowline-demo.*).
 * The poster is the paint element (preload="metadata", never the video bytes). Autoplay only without
 * prefers-reduced-motion; with it the poster stays and the button says "Play demo". A rejected play() (autoplay
 * policy) falls back to the same paused state. If the media files are missing the section hides instead of showing a dead player.
 */
export function DemoVideo({ locale, labels }: { locale: "ar" | "en"; labels: Labels }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia(REDUCED_MOTION).matches) return;
    v.play().catch(() => setPlaying(false));
  }, []);

  function toggle() {
    const v = ref.current;
    if (!v) return;
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
          preload="metadata"
          poster="/media/flowline-demo.jpg"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setBroken(true)}
        >
          <source src="/media/flowline-demo.mp4" type="video/mp4" />
          <source src="/media/flowline-demo.webm" type="video/webm" />
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
