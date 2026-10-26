"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipEntry, ManifestFile } from "../../../scripts/demo/manifest";
import { chooseSource } from "@/lib/demo-source";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function DemoVideo({ clip, files, poster }: { clip: ClipEntry; files: ManifestFile[]; poster: string }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const toggle = useRef(() => {});
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const v = element;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = "connection" in navigator ? navigator.connection : null;
    const blocked = () => reduce.matches || (connection && typeof connection === "object" &&
      (("saveData" in connection && connection.saveData === true) || ("effectiveType" in connection && ["2g", "slow-2g"].includes(String(connection.effectiveType)))));
    let live = true, visible = false, loaded = document.readyState === "complete", paused = false;
    try { paused = sessionStorage.getItem("flowline-demo-paused") === "true"; } catch { /* Storage may be unavailable. */ }
    let selection: ReturnType<typeof select> | undefined;
    async function select() {
      const caps: Partial<Record<"av1" | "h264", MediaCapabilitiesInfo>> = {};
      await Promise.all(files.map(async (f) => {
        if (f.kind !== "video") return;
        try {
          caps[f.codec] = await navigator.mediaCapabilities.decodingInfo({ type: "file", video: {
            contentType: f.type, width: clip.width, height: clip.height, framerate: clip.fps, bitrate: f.bitrate,
          } });
        } catch { /* Unknown capabilities leave the poster visible. */ }
      }));
      return chooseSource(files, caps);
    }
    async function start(manual = false) {
      if (!manual && (!loaded || !visible || paused || blocked() || document.hidden)) return;
      const selected = await (selection ??= select());
      if (!live || (!manual && (!visible || paused || blocked() || document.hidden))) return;
      const source = selected ?? (manual ? files.find((f) => f.kind === "video" && f.codec === "h264") : null);
      if (!source) return;
      if (!v.getAttribute("src")) v.src = `/media/demo/${source.path}`;
      v.loop = clip.loop && !blocked();
      try { await v.play(); } catch { if (live) setPlaying(false); }
    }
    const refresh = () => { if (!visible || blocked() || document.hidden) v.pause(); else void start(); };
    const onLoad = () => { loaded = true; refresh(); };
    toggle.current = () => {
      if (!v.isConnected) return;
      paused = !v.paused;
      try { sessionStorage.setItem("flowline-demo-paused", String(paused)); } catch { /* Private mode. */ }
      if (paused) v.pause(); else void start(true);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= 0.25; refresh(); }, { threshold: 0.25, rootMargin: "200px" });
    observer.observe(v);
    window.addEventListener("load", onLoad);
    document.addEventListener("visibilitychange", refresh);
    reduce.addEventListener("change", refresh);
    return () => { live = false; observer.disconnect(); window.removeEventListener("load", onLoad); document.removeEventListener("visibilitychange", refresh); reduce.removeEventListener("change", refresh); v.pause(); };
  }, [clip, files]);
  const fallback = files.find((f) => f.kind === "video" && f.codec === "h264");
  return <div role="group" aria-label={t("landing.canvasAria")} className="relative w-full overflow-hidden rounded-xl border border-line bg-app" style={{ aspectRatio: `${clip.width}/${clip.height}` }}>
    {/* Native image keeps the manifest's hashed URL and explicit LCP preload aligned. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img data-testid="landing-demo-poster" src={poster} alt="" width={clip.width} height={clip.height} fetchPriority="high" className="absolute inset-0 size-full" />
    <video data-testid="landing-demo" ref={(v) => { video.current = v; if (v) { v.muted = true; v.setAttribute("muted", ""); } }} aria-label={t("landing.canvasAria")} muted playsInline loop preload="none" poster={poster} width={clip.width} height={clip.height} onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} className="relative size-full">
      {fallback && <source src={`/media/demo/${fallback.path}`} type="video/mp4" />}
    </video>
    <Button type="button" aria-pressed={playing} onClick={() => toggle.current()} className="absolute end-2 bottom-2 min-h-11 min-w-11 rounded-lg bg-surface px-3 text-hi">{t(playing ? "landing.demo.pause" : "landing.demo.play")}</Button>
  </div>;
}
