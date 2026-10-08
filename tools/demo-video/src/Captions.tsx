// Overlay text layers: glass caption pill, hero step chips, chapter cards, end card. Everything here is composited on
// top of the (zoomed) scene and is never scaled by the camera. Whole-line animations only: fade + short slide + blur.
import React from "react";
import type { Locale, TimedText } from "./props.ts";
import { fadeEnvelope, smoother } from "./camera.ts";
import { FONT_EN, fontFor } from "./theme.ts";
import type { Palette } from "./theme.ts";

type Common = { t: number; locale: Locale; palette: Palette; /** canvas.h / 1080 */ f: number };

const type = (locale: Locale, f: number, enSize: number, arSize: number) =>
  locale === "ar"
    ? { fontFamily: fontFor("ar"), fontWeight: 600, fontSize: arSize * f, lineHeight: 1.55, letterSpacing: 0 }
    : { fontFamily: fontFor("en"), fontWeight: 600, fontSize: enSize * f, lineHeight: 1.25, letterSpacing: "-0.01em" };

const glass = (p: Palette, f: number, radius: number): React.CSSProperties => ({
  background: p.pillBg,
  border: `${Math.max(1, f)}px solid ${p.pillBorder}`,
  borderRadius: radius * f,
  backdropFilter: `blur(${18 * f}px)`,
  WebkitBackdropFilter: `blur(${18 * f}px)`,
  boxShadow: "0 18px 40px -20px rgba(20, 20, 50, 0.35)",
  color: p.pillText,
});

/** Slide + blur + fade for a whole element: enters over 350 ms, leaves over 250 ms (fade only). */
function enter(t: number, t0: number, t1: number, f: number, dir: 1 | -1, axis: "x" | "y") {
  const { inP, a } = fadeEnvelope(t, t0, t1, 0.35, 0.25);
  const d = 14 * f * (1 - inP) * dir;
  return {
    opacity: a,
    filter: `blur(${6 * f * (1 - inP)}px)`,
    transform: axis === "y" ? `translateY(${d}px)` : `translateX(${d}px)`,
  } satisfies React.CSSProperties;
}

export const CaptionPill: React.FC<Common & { captions: TimedText[] }> = ({ t, locale, palette, f, captions }) => {
  let c: TimedText | undefined;
  for (const x of captions) if (t >= x.t0 && t <= x.t1 && (!c || x.t0 >= c.t0)) c = x;
  if (!c) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 56 * f, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div
        dir={locale === "ar" ? "rtl" : "ltr"}
        style={{
          ...glass(palette, f, 22),
          ...type(locale, f, 44, 46),
          ...enter(t, c.t0, c.t1, f, 1, "y"),
          maxWidth: "70%",
          padding: `${12 * f}px ${32 * f}px`,
          textAlign: "center",
        }}
      >
        {c.text}
      </div>
    </div>
  );
};

const Check: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M3.5 8.4l3 3 6-6.6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const StepChips: React.FC<Common & { chips: { tIn: number; tOut: number; items: { t0: number; text: string }[] } }> = ({ t, locale, palette, f, chips }) => {
  const a = smoother((t - chips.tIn) / 0.5) * (1 - smoother((t - chips.tOut) / 0.4));
  if (a <= 0.001) return null;
  let active = -1;
  chips.items.forEach((it, i) => {
    if (t >= it.t0) active = i;
  });
  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      style={{ position: "absolute", left: 0, right: 0, top: 44 * f, display: "flex", justifyContent: "center", gap: 14 * f, opacity: a, pointerEvents: "none" }}
    >
      {chips.items.map((it, i) => {
        const isActive = i === active;
        const done = i < active;
        return (
          <div
            key={i}
            style={{
              ...glass(palette, f, 999),
              ...type(locale, f, 26, 28),
              display: "flex",
              alignItems: "center",
              gap: 10 * f,
              padding: `${9 * f}px ${24 * f}px`,
              backdropFilter: `blur(${14 * f}px)`,
              ...(isActive ? { background: palette.accentBg, border: `${2 * f}px solid ${palette.accentBorder}`, color: palette.accent } : {}),
              ...(!isActive ? { color: done ? palette.textMuted : palette.pillText, opacity: done ? 1 : 0.72 } : {}),
            }}
          >
            {done ? <Check size={20 * f} color={palette.textMuted} /> : null}
            <span>{it.text}</span>
          </div>
        );
      })}
    </div>
  );
};

export const ChapterCard: React.FC<Common & { chapters: (TimedText & { index: number })[] }> = ({ t, locale, palette, f, chapters }) => {
  let c: (TimedText & { index: number }) | undefined;
  for (const x of chapters) if (t >= x.t0 && t <= x.t1) c = x;
  if (!c) return null;
  const { a } = fadeEnvelope(t, c.t0, c.t1, 0.35, 0.25);
  const dir: 1 | -1 = locale === "ar" ? 1 : -1; // slide in from the start side: left in LTR, right in RTL
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: palette.scrim, opacity: a }} />
      <div
        dir={locale === "ar" ? "rtl" : "ltr"}
        style={{
          ...glass(palette, f, 30),
          ...type(locale, f, 64, 66),
          ...enter(t, c.t0, c.t1, f, dir, "x"),
          position: "relative",
          maxWidth: "74%",
          padding: `${34 * f}px ${64 * f}px`,
          textAlign: "center",
          boxShadow: "0 40px 90px -30px rgba(20, 20, 50, 0.45)",
        }}
      >
        {c.text}
      </div>
    </div>
  );
};

export const EndCard: React.FC<Common & { endCard: { t0: number; wordmark: string; badge: string } }> = ({ t, locale, palette, f, endCard }) => {
  const a = smoother((t - endCard.t0) / 0.4);
  if (a <= 0.001) return null;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 * f, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: palette.scrim, opacity: a }} />
      <div
        style={{
          position: "relative",
          opacity: a,
          fontFamily: FONT_EN,
          fontWeight: 700,
          fontSize: 132 * f,
          lineHeight: 1.1,
          letterSpacing: "-0.035em",
          color: palette.pillText,
        }}
      >
        {endCard.wordmark}
      </div>
      <div
        dir={locale === "ar" ? "rtl" : "ltr"}
        style={{ position: "relative", opacity: a, ...glass(palette, f, 999), ...type(locale, f, 34, 36), padding: `${10 * f}px ${30 * f}px`, color: palette.accent }}
      >
        {endCard.badge}
      </div>
    </div>
  );
};
