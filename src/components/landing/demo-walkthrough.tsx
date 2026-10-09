"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useDir, useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/types";
import type { WalkthroughView } from "@/lib/demo-media";
import { shouldSkipVideo, startPlayback } from "@/lib/demo-source";
import { attachSource } from "./demo-video";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const btn = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-card px-4 text-base text-hi transition-colors duration-[var(--dur-base)] hover:bg-elevated disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-card";

/**
 * The 53 s walkthrough (issue 100): a button that opens a native modal `<dialog>` (showModal: focus trap, Esc, inert page) with the video
 * (`controls`, no loop, EN + AR caption tracks, the page language is the default track) and a four-step chapter stepper that seeks it.
 * Left/Right keys follow the reading direction (flipped in RTL). Under reduced motion nothing plays by itself and the stepper also
 * shows the chapter still with its text, so the walkthrough is usable without playback. No API calls; works logged out.
 */
export function DemoWalkthrough({ view }: { view: WalkthroughView }) {
  const t = useT();
  const locale = useLocale();
  const dir = useDir();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const steps = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION);
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const chapterText = (id: string) => (t.has(`landing.demo.ch.${id}`) ? t(`landing.demo.ch.${id}` as MessageKey) : id);
  const last = view.chapters.length - 1;

  const open = async () => {
    const d = dialog.current;
    const v = video.current;
    if (!d || d.open) return;
    d.showModal();
    if (!v) return;
    // Choosing the file does not download it (preload="none"); bytes flow only when the visitor, or autoplay below, starts playback.
    if (!(await attachSource(v, view.sources, true))) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!shouldSkipVideo(window.matchMedia(REDUCED_MOTION).matches, conn)) {
      v.muted = true;
      await startPlayback(v, () => { /* blocked: the native controls are right there */ });
    }
  };

  const select = (index: number, focus = false) => {
    const i = Math.max(0, Math.min(last, index));
    setActive(i);
    const v = video.current;
    const chapter = view.chapters[i];
    if (v && chapter) v.currentTime = chapter.t;
    if (focus) steps.current[i]?.focus();
  };

  const onKeys = (e: KeyboardEvent) => {
    const ahead = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const behind = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (e.key === ahead) select(active + 1, true);
    else if (e.key === behind) select(active - 1, true);
    else if (e.key === "Home") select(0, true);
    else if (e.key === "End") select(last, true);
    else return;
    e.preventDefault();
  };

  // Follow the video while it plays: the stepper shows the chapter that is on screen.
  const onTime = () => {
    const now = video.current?.currentTime ?? 0;
    let i = 0;
    view.chapters.forEach((c, n) => { if (now >= c.t - 0.05) i = n; });
    setActive((cur) => (cur === i ? cur : i));
  };

  const order = locale === "ar" ? (["ar", "en"] as const) : (["en", "ar"] as const);
  const chapter = view.chapters[active];
  const fallback = view.sources.find((s) => s.codec === "h264") ?? view.sources[0];
  return (
    <>
      <button ref={opener} type="button" data-testid="demo-watch" onClick={() => void open()} className={`${btn} motion-press`}>
        {t("landing.demo.watch")}
      </button>
      <dialog
        ref={dialog}
        data-testid="demo-walkthrough"
        aria-label={t("landing.demo.walkthroughAria")}
        className="demo-dialog m-auto w-[min(72rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-line bg-surface p-0 text-hi"
        onClose={() => { video.current?.pause(); opener.current?.focus(); }}
        onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-y-auto p-4">
          <div className="flex justify-end">
            <button type="button" data-testid="demo-close" onClick={() => dialog.current?.close()} className={btn}>{t("landing.demo.close")}</button>
          </div>
          <video
            ref={video}
            controls
            playsInline
            muted
            preload="none"
            poster={view.poster.src}
            width={view.width}
            height={view.height}
            style={{ aspectRatio: view.aspect }}
            className="w-full rounded-lg bg-card"
            aria-label={t("landing.demo.walkthroughAria")}
            onTimeUpdate={onTime}
          >
            {fallback && <source src={fallback.src} type={fallback.type} />}
            {order.map((lang) => view.captions[lang] && (
              <track key={lang} kind="captions" srcLang={lang} label={lang === "ar" ? "العربية" : "English"} src={view.captions[lang]} default={lang === locale} />
            ))}
          </video>
          {reduced && chapter?.still && (
            <figure data-testid="demo-chapter-still" className="m-0 flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, content-hashed still; its size is the recording's */}
              <img src={chapter.still} alt="" width={view.width} height={view.height} style={{ aspectRatio: view.aspect }} className="w-full rounded-lg border border-line" />
              <figcaption className="text-base text-med">{chapterText(chapter.id)}</figcaption>
            </figure>
          )}
          <div role="group" aria-label={t("landing.demo.chapters")} data-testid="demo-stepper" onKeyDown={onKeys} className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={active === 0} onClick={() => select(active - 1)}>{t("landing.demo.back")}</button>
            {view.chapters.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => { steps.current[i] = el; }}
                type="button"
                data-chapter={c.id}
                aria-current={i === active ? "step" : undefined}
                onClick={() => select(i)}
                className={`${btn} ${i === active ? "border-accent bg-elevated font-semibold" : ""}`}
              >
                {i + 1}. {chapterText(c.id)}
              </button>
            ))}
            <button type="button" className={btn} disabled={active === last} onClick={() => select(active + 1)}>{t("landing.demo.next")}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
