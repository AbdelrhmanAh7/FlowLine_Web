"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { ClipView } from "@/lib/demo-media";
import { attachSource, shouldSkipVideo, startPlayback } from "@/lib/demo-source";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** The visitor's own pause, kept for the session (WCAG 2.2.2). */
const PAUSE_KEY = "flowline.demo.paused";
/** Loops longer than this need a visible pause control. */
const PAUSE_CONTROL_OVER_S = 5;

type Connection = { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;
const storedPause = () => { try { return sessionStorage.getItem(PAUSE_KEY) === "1"; } catch { return false; } };
const storePause = (on: boolean) => { try { if (on) sessionStorage.setItem(PAUSE_KEY, "1"); else sessionStorage.removeItem(PAUSE_KEY); } catch { /* private mode: the pause just is not remembered */ } };

/**
 * A recorded product loop (issue 100). Server markup is correct without JS: a muted, looping `<video preload="none">` with its poster
 * (the LCP element) inside a fixed aspect-ratio box (CLS 0), no `autoplay` attribute and an H.264 `<source>` as the no-JS default.
 * JS only enhances it: after `window.load` and once visible (IntersectionObserver) it picks AV1 or H.264, sets `src` and plays muted;
 * it pauses when off-screen or the tab is hidden. Reduced motion, Save-Data and 2g fetch nothing: poster + a visible Play demo button
 * (plays once, no loop). A rejected play() (iOS Low Power Mode) shows the same button and the first tap on the tile starts it.
 * Loops over 5 s get a Pause/Play button (>= 44x44, aria-pressed) whose state is remembered for the session.
 */
export function DemoVideo(props: { view: ClipView; label: string; className?: string }) {
  // A new locale/theme brings other files: remount so a file attached imperatively to the old element never outlives its source set.
  return <DemoVideoPlayer key={props.view.poster.src} {...props} />;
}

function DemoVideoPlayer({ view, label, className }: { view: ClipView; label: string; className?: string }) {
  const t = useT();
  const tile = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [skip, setSkip] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [ended, setEnded] = useState(false);
  const starting = useRef(false);
  /** Current intersection visibility (updated by IntersectionObserver). */
  const visible = useRef(false);
  /** Whether an automatic start may still go ahead (visible, tab shown, no reduced motion/Save-Data, no pause by the visitor); kept current by `sync`. */
  const allowed = useRef(true);
  /** The visitor pressed Play while autoplay was off (reduced motion, Save-Data, 2g): that single run is theirs, scrolling does not undo it. */
  const userStarted = useRef(false);

  // React does not reliably write `muted` into the HTML: set property and attribute before any play().
  const setVideo = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    if (el) { el.muted = true; el.setAttribute("muted", ""); }
  }, []);

  /** `once`: play a single run (no loop). `user`: the visitor asked for it (a tap), so it does not wait for the automatic conditions. */
  const play = useCallback(async (once: boolean, user: boolean) => {
    const v = video.current;
    if (!v || starting.current) return;
    starting.current = true;
    try {
      v.muted = true;
      v.loop = view.loop && !once;
      // Clear any previous src so attachSource re-evaluates the codec choice (especially after a failed playback).
      v.removeAttribute("src");
      v.load();
      if (!(await attachSource(v, view.sources, user))) return;
      // Choosing the file is async: the tile may have left the screen, the tab been hidden or reduce switched on meanwhile.
      // Re-check eligibility after the async source selection.
      if (!user) {
        const mq = window.matchMedia(REDUCED_MOTION);
        const conn = connection();
        const skipNow = shouldSkipVideo(mq.matches, conn);
        if (skipNow || document.hidden || !visible.current || userPaused.current) return;
      }
      // We are about to play: let the browser fetch now. Without this a `preload="none"` element only starts the download inside play(),
      // so anything that defers play() (a blocked or stubbed player) would never request the file it just chose.
      v.preload = "auto";
      setBlocked(false);
      await startPlayback(v, (_err) => {
        setBlocked(true);
        // On blocked play (e.g. iOS Low Power Mode), clear src so a subsequent user tap can retry with H.264 fallback.
        v.removeAttribute("src");
        v.load();
      });
    } finally {
      starting.current = false;
    }
  }, [view.loop, view.sources]);

  useEffect(() => {
    const v = video.current;
    const box = tile.current;
    if (!v || !box) return;
    const mq = window.matchMedia(REDUCED_MOTION);
    const conn = connection();
    let loaded = document.readyState === "complete";
    userPaused.current = storedPause();
    setReady(true);
    const sync = () => {
      const skipNow = shouldSkipVideo(mq.matches, conn);
      setSkip(skipNow);
      allowed.current = !skipNow && !document.hidden && visible.current && !userPaused.current;
      if (skipNow) { if (!v.paused && !userStarted.current) v.pause(); return; }
      if (document.hidden || !visible.current || userPaused.current) { if (!v.paused) v.pause(); return; }
      if (loaded && v.paused) void play(false, false);
    };
    // A changed preference (reduce switched on, data saver, slower network) ends any run the visitor started under the old one.
    const onPreference = () => { userStarted.current = false; sync(); };
    const onLoad = () => { loaded = true; sync(); };
    if (!loaded) window.addEventListener("load", onLoad, { once: true });
    const io = new IntersectionObserver(([e]) => { visible.current = !!e?.isIntersecting; sync(); }, { threshold: 0.25, rootMargin: "200px" });
    io.observe(box);
    mq.addEventListener("change", onPreference);
    conn?.addEventListener?.("change", onPreference);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      window.removeEventListener("load", onLoad);
      io.disconnect();
      mq.removeEventListener("change", onPreference);
      conn?.removeEventListener?.("change", onPreference);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [play]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (!v.paused) {
      userPaused.current = true;
      storePause(true);
      v.pause();
      return;
    }
    userPaused.current = false;
    storePause(false);
    userStarted.current = skip;
    void play(skip, true);
  };

  // Only once JS runs (a button that does nothing without JS would be dead): long loops always, any clip when it needs a tap to start.
  const showToggle = ready && ((view.loop && view.durationS > PAUSE_CONTROL_OVER_S) || skip || blocked || ended);
  const fallback = view.sources.find((s) => s.codec === "h264") ?? view.sources[0];
  return (
    <div
      ref={tile}
      style={{ aspectRatio: view.aspect }}
      className={`relative w-full overflow-hidden bg-card ${className ?? ""}`}
      onClick={() => { if (blocked && video.current?.paused && !userPaused.current) void play(skip, true); }}
    >
      <video
        ref={setVideo}
        data-demo-clip={view.clip}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        loop={view.loop}
        playsInline
        preload="none"
        poster={view.poster.src}
        width={view.width}
        height={view.height}
        aria-label={label}
        onPlay={() => { setPlaying(true); setEnded(false); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setEnded(true); }}
      >
        {/* No-JS default; once JS picks a file it sets `src`, which takes precedence over these. */}
        {fallback && <source src={fallback.src} type={fallback.type} />}
      </video>
      {showToggle && (
        <button
          type="button"
          data-demo-toggle=""
          aria-pressed={!playing}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="absolute end-3 bottom-3 inline-grid min-h-11 min-w-11 place-items-center rounded-lg border border-line-strong bg-surface/95 px-4 text-base whitespace-nowrap text-hi transition-colors duration-[var(--dur-base)] hover:bg-elevated"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          {/* Both labels share one grid cell, so the button keeps its size and its text never moves when Play/Pause flips (no layout shift). */}
          <span aria-hidden={playing} className={`col-start-1 row-start-1 ${playing ? "invisible" : ""}`}>{t("landing.demo.play")}</span>
          <span aria-hidden={!playing} className={`col-start-1 row-start-1 ${playing ? "" : "invisible"}`}>{t("landing.demo.pause")}</span>
        </button>
      )}
    </div>
  );
}
