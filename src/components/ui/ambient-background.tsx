"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";
import type { ThemePreference } from "@/theme/config";

type AmbientBackgroundProps = { locale: Locale; theme: ThemePreference };

const scenes = {
  "ar-light": { name: "pearl-ribbon-sweep", topology: "ribbon-sweep" },
  "en-light": { name: "glass-fluid-arc", topology: "glass-arc" },
  "ar-dark": { name: "auroral-lens", topology: "auroral-lens" },
  "en-dark": { name: "woven-light-trail", topology: "woven-trail" },
} as const;

/** Decorative workflow depth. It never receives input or changes page behavior. */
export function AmbientBackground({ locale, theme }: AmbientBackgroundProps) {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    let frame = 0;
    let pulseTimer = 0;
    let pointerX = 0;
    let pointerY = 0;
    let scrollY = window.scrollY;
    let scrollRange = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    let clickX = 50;
    let clickY = 50;

    const selectScene = () => {
      const effectiveTheme = theme === "system" ? (systemDark.matches ? "dark" : "light") : theme;
      const scene = scenes[`${locale}-${effectiveTheme}` as keyof typeof scenes];
      field.dataset.scene = scene.name;
      field.dataset.topology = scene.topology;
    };
    selectScene();
    const paint = () => {
      frame = 0;
      const progress = scrollRange > 0 ? Math.min(1, Math.max(0, scrollY / scrollRange)) : 0;
      field.style.setProperty("--ambient-near-x", `${(pointerX * 20).toFixed(1)}px`);
      field.style.setProperty("--ambient-near-y", `${(pointerY * 14).toFixed(1)}px`);
      field.style.setProperty("--ambient-far-x", `${(pointerX * -10).toFixed(1)}px`);
      field.style.setProperty("--ambient-far-y", `${(pointerY * -8).toFixed(1)}px`);
      field.style.setProperty("--ambient-flow", progress.toFixed(3));
      field.style.setProperty("--ambient-flow-phase", `${(progress * 120).toFixed(1)}px`);
      field.dataset.activeStep = String(Math.min(4, Math.floor(progress * 5)));
    };
    const queuePaint = () => { if (!frame) frame = window.requestAnimationFrame(paint); };
    const onPointerMove = (event: PointerEvent) => {
      pointerX = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth - 0.5) * 2));
      pointerY = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight - 0.5) * 2));
      queuePaint();
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
        scrollY = target.scrollTop;
        scrollRange = Math.max(0, target.scrollHeight - target.clientHeight);
      } else {
        scrollY = window.scrollY;
        scrollRange = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      }
      queuePaint();
    };
    const onPointerDown = (event: PointerEvent) => {
      clickX = (event.clientX / window.innerWidth) * 100;
      clickY = (event.clientY / window.innerHeight) * 100;
      field.style.setProperty("--ambient-click-x", `${clickX.toFixed(2)}%`);
      field.style.setProperty("--ambient-click-y", `${clickY.toFixed(2)}%`);
      field.dataset.pulse = "true";
      window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => { delete field.dataset.pulse; }, 240);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pointerdown", onPointerDown);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(pulseTimer);
      frame = 0;
      delete field.dataset.pulse;
      for (const key of ["--ambient-near-x", "--ambient-near-y", "--ambient-far-x", "--ambient-far-y", "--ambient-flow", "--ambient-click-x", "--ambient-click-y", "--ambient-flow-phase"]) field.style.removeProperty(key);
    };
    const syncMotion = () => {
      stop();
      if (motion.matches) return;
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true, capture: true });
      window.addEventListener("pointerdown", onPointerDown, { passive: true });
      queuePaint();
    };
    const onSystemTheme = () => { if (theme === "system") selectScene(); };
    motion.addEventListener("change", syncMotion);
    systemDark.addEventListener("change", onSystemTheme);
    syncMotion();
    return () => {
      motion.removeEventListener("change", syncMotion);
      systemDark.removeEventListener("change", onSystemTheme);
      stop();
    };
  }, [locale, theme]);

  return (
    <div ref={fieldRef} className="ambient-background" data-locale={locale} data-theme={theme} data-scene={theme === "system" ? undefined : scenes[`${locale}-${theme}`].name} data-topology={theme === "system" ? undefined : scenes[`${locale}-${theme}`].topology} aria-hidden="true">
      <svg className="ambient-background__map" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ambient-ribbon-light" x1="0" y1="0" x2="1" y2=".15">
            <stop stopColor="var(--cat-app)" stopOpacity=".04" />
            <stop offset=".48" stopColor="var(--accent)" stopOpacity=".24" />
            <stop offset="1" stopColor="var(--cat-ai)" stopOpacity=".04" />
          </linearGradient>
          <linearGradient id="ambient-ribbon-dark" x1="0" y1="0" x2="1" y2=".2">
            <stop stopColor="var(--cat-trigger)" stopOpacity=".05" />
            <stop offset=".5" stopColor="var(--cat-ai)" stopOpacity=".3" />
            <stop offset="1" stopColor="var(--cat-app)" stopOpacity=".06" />
          </linearGradient>
          <linearGradient id="ambient-ribbon-glass" x1="0" y1="0" x2="1" y2=".3">
            <stop stopColor="var(--cat-app)" stopOpacity=".18" />
            <stop offset=".5" stopColor="var(--accent)" stopOpacity=".08" />
            <stop offset="1" stopColor="var(--cat-output)" stopOpacity=".2" />
          </linearGradient>
          <radialGradient id="ambient-lens-glow">
            <stop stopColor="var(--cat-ai)" stopOpacity=".16" />
            <stop offset=".72" stopColor="var(--cat-app)" stopOpacity=".06" />
            <stop offset="1" stopColor="var(--cat-app)" stopOpacity="0" />
          </radialGradient>
          <pattern id="ambient-structure-grid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M44 0H0V44" stroke="var(--ambient-grid)" strokeWidth=".65" />
          </pattern>
        </defs>
        <rect className="ambient-structure" width="1000" height="700" fill="url(#ambient-structure-grid)" />
        <g className="ambient-particles" aria-hidden="true">
          <circle cx="54" cy="120" r="1.6" fill="var(--cat-app)" />
          <circle cx="932" cy="112" r="1.8" fill="var(--accent)" />
          <circle cx="84" cy="590" r="1.5" fill="var(--cat-output)" />
          <circle cx="910" cy="584" r="1.7" fill="var(--cat-ai)" />
          <circle cx="164" cy="60" r="1.2" fill="var(--cat-trigger)" />
        </g>
        <g className="ambient-scene ambient-scene--ar-light" data-scene-map="pearl-ribbon-sweep">
          <path className="ambient-ribbon ambient-ribbon--wide" stroke="url(#ambient-ribbon-light)" d="M1120 82C933 96 853 178 704 234S450 323 322 292 112 328-120 505" />
          <path className="ambient-ribbon ambient-ribbon--wide ambient-ribbon--second" stroke="url(#ambient-ribbon-glass)" d="M1120 220C930 230 846 288 685 332S443 415 293 378 74 400-120 586" />
          <path className="ambient-ribbon ambient-ribbon--hairline" d="M1120 82C933 96 853 178 704 234S450 323 322 292 112 328-120 505" />
          <path className="ambient-ribbon ambient-ribbon--hairline ambient-ribbon--second" d="M1120 220C930 230 846 288 685 332S443 415 293 378 74 400-120 586" />
        </g>
        <g className="ambient-scene ambient-scene--en-light" data-scene-map="glass-fluid-arc">
          <path className="ambient-lens" fill="url(#ambient-lens-glow)" d="M190 360C230 220 375 180 480 250C560 303 546 407 440 448C330 492 210 457 190 360Z" />
          <path className="ambient-ribbon ambient-ribbon--wide" stroke="url(#ambient-ribbon-glass)" d="M-100 505C92 488 157 343 318 310S578 391 700 330 868 184 1120 208" />
          <path className="ambient-ribbon ambient-ribbon--wide ambient-ribbon--second" stroke="url(#ambient-ribbon-light)" d="M-100 590C118 565 174 427 337 394S581 475 730 410 898 278 1120 291" />
          <path className="ambient-ribbon ambient-ribbon--wide ambient-ribbon--third" stroke="url(#ambient-ribbon-glass)" d="M-100 414C105 407 178 264 331 235S575 313 681 249 863 105 1120 122" />
          <path className="ambient-ribbon ambient-ribbon--hairline" d="M-100 505C92 488 157 343 318 310S578 391 700 330 868 184 1120 208" />
          <path className="ambient-ribbon ambient-ribbon--hairline ambient-ribbon--third" d="M-100 414C105 407 178 264 331 235S575 313 681 249 863 105 1120 122" />
        </g>
        <g className="ambient-scene ambient-scene--ar-dark" data-scene-map="auroral-lens">
          <path className="ambient-lens" fill="url(#ambient-lens-glow)" d="M1000 322C890 142 744 152 642 264C558 357 616 496 752 500C876 505 975 423 1000 322Z" />
          <path className="ambient-ribbon ambient-ribbon--wide" stroke="url(#ambient-ribbon-dark)" d="M1120 342C984 140 772 125 638 242S427 489 250 468 54 344-120 239" />
          <path className="ambient-ribbon ambient-ribbon--wide ambient-ribbon--second" stroke="url(#ambient-ribbon-light)" d="M1120 403C959 222 798 206 674 300S456 520 275 517 55 407-120 322" />
          <path className="ambient-ribbon ambient-ribbon--wide ambient-ribbon--third" stroke="url(#ambient-ribbon-dark)" d="M1120 284C1000 75 797 55 600 171S378 400 205 395 32 290-120 169" />
          <path className="ambient-ribbon ambient-ribbon--hairline" d="M1120 342C984 140 772 125 638 242S427 489 250 468 54 344-120 239" />
          <path className="ambient-ribbon ambient-ribbon--hairline ambient-ribbon--third" d="M1120 284C1000 75 797 55 600 171S378 400 205 395 32 290-120 169" />
        </g>
        <g className="ambient-scene ambient-scene--en-dark" data-scene-map="woven-light-trail">
          <path className="ambient-lens" fill="url(#ambient-lens-glow)" d="M470 240C560 155 700 174 758 250C806 314 762 389 684 400C580 414 479 339 470 240Z" />
          <path className="ambient-ribbon ambient-ribbon--wide" stroke="url(#ambient-ribbon-dark)" d="M-120 160C110 154 178 386 385 371S668 114 850 167 1000 325 1120 324" />
          <path className="ambient-ribbon ambient-ribbon--wide ambient-ribbon--second" stroke="url(#ambient-ribbon-glass)" d="M-120 306C88 299 175 108 374 124S669 391 850 366 1000 207 1120 207" />
          <path className="ambient-ribbon ambient-ribbon--wide ambient-ribbon--third" stroke="url(#ambient-ribbon-dark)" d="M-120 476C117 474 204 265 400 271S665 530 863 506 1011 416 1120 410" />
          <path className="ambient-ribbon ambient-ribbon--hairline" d="M-120 160C110 154 178 386 385 371S668 114 850 167 1000 325 1120 324" />
          <path className="ambient-ribbon ambient-ribbon--hairline ambient-ribbon--second" d="M-120 306C88 299 175 108 374 124S669 391 850 366 1000 207 1120 207" />
        </g>
      </svg>
      <div className="ambient-background__glint" />
    </div>
  );
}
