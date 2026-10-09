// Shared building blocks: background, kinetic text, captions, scene envelope, font gate. Pure Remotion, no assets.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import type { Brand, Locale } from "../types.ts";

export const FONT = {
  en: '"Inter Variable", "Inter", system-ui, sans-serif',
  ar: '"IBM Plex Sans Arabic", "Inter Variable", system-ui, sans-serif',
};

export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

/** Holds the render until both faces are loaded, so no frame is drawn with a fallback font. */
export function useFontsReady() {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [
      '400 40px "Inter Variable"',
      '700 40px "Inter Variable"',
      '400 40px "IBM Plex Sans Arabic"',
      '600 40px "IBM Plex Sans Arabic"',
      '700 40px "IBM Plex Sans Arabic"',
    ];
    Promise.all(faces.map((f) => document.fonts.load(f, f.includes("Arabic") ? "عربي" : "Aa")))
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
}

/** Calm moving gradient behind every scene (brand tokens only). */
export const Background: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const ax = 20 + Math.sin(t / 6) * 6;
  const ay = 25 + Math.cos(t / 7) * 6;
  const bx = 78 + Math.cos(t / 8) * 6;
  const by = 70 + Math.sin(t / 5) * 6;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 700px at ${ax}% ${ay}%, ${brand.blobA} 0%, transparent 70%),
          radial-gradient(900px 700px at ${bx}% ${by}%, ${brand.blobB} 0%, transparent 70%), ${brand.bg}`,
      }}
    />
  );
};

/** Fade/lift in at the start and fade out at the end of a scene. */
export const SceneEnvelope: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const inO = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const outO = interpolate(frame, [durationInFrames - 9, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lift = interpolate(frame, [0, 14], [18, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <AbsoluteFill style={{ opacity: Math.min(inO, outO), transform: `translateY(${lift}px)` }}>{children}</AbsoluteFill>;
};

/** Word-by-word kinetic reveal. Words stay whole (Arabic letters keep joining inside a word). */
export const KineticLine: React.FC<{
  text: string;
  delay: number;
  locale: Locale;
  size: number;
  weight?: number;
  color: string;
  stagger?: number;
  align?: "center" | "start";
}> = ({ text, delay, locale, size, weight = 700, color, stagger = 3, align = "center" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div
      dir={dirOf(locale)}
      style={{
        fontFamily: FONT[locale],
        fontSize: size,
        fontWeight: weight,
        color,
        lineHeight: locale === "ar" ? 1.45 : 1.15,
        letterSpacing: locale === "ar" ? 0 : "-0.025em",
        textAlign: align,
        textWrap: "balance",
      }}
    >
      {words.map((w, i) => {
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 18, stiffness: 140, mass: 0.7 } });
        return (
          <React.Fragment key={i}>
            <span
              style={{
                display: "inline-block",
                opacity: s,
                transform: `translateY(${(1 - s) * 0.45 * size}px)`,
                filter: `blur(${(1 - s) * 8}px)`,
              }}
            >
              {w}
            </span>
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** Burned-in caption (same text as the WebVTT cue), bottom centre, on a soft card. */
export const Caption: React.FC<{ text?: string; locale: Locale; brand: Brand; durationInFrames: number; delay?: number }> = ({
  text,
  locale,
  brand,
  durationInFrames,
  delay = 8,
}) => {
  const frame = useCurrentFrame();
  if (!text) return null;
  const o = interpolate(frame, [delay, delay + 10, durationInFrames - 10, durationInFrames - 2], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 46 }}>
      <div
        dir={dirOf(locale)}
        style={{
          opacity: o,
          maxWidth: 1500,
          padding: "16px 30px",
          borderRadius: 18,
          background: "rgba(255,255,255,0.92)",
          border: `1px solid ${brand.border}`,
          boxShadow: "0 10px 30px rgba(24,24,27,0.08)",
          fontFamily: FONT[locale],
          fontWeight: locale === "ar" ? 600 : 560,
          fontSize: locale === "ar" ? 34 : 33,
          lineHeight: locale === "ar" ? 1.5 : 1.3,
          color: brand.text,
          textAlign: "center",
          textWrap: "balance",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const Pill: React.FC<{ text: string; locale: Locale; brand: Brand; strong?: boolean; size?: number }> = ({
  text,
  locale,
  brand,
  strong,
  size = 26,
}) => (
  <div
    dir={dirOf(locale)}
    style={{
      display: "inline-block",
      padding: "10px 22px",
      borderRadius: 999,
      background: strong ? brand.accent : brand.accentSoft,
      color: strong ? "#fff" : brand.accent,
      border: `1px solid ${strong ? brand.accent : "rgba(124,108,255,0.25)"}`,
      fontFamily: FONT[locale],
      fontWeight: 650,
      fontSize: size,
      lineHeight: 1.3,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);
