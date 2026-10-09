// One component per scene kind. Layout is direction-aware: in Arabic every row flows right to left.
import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Brand, Card, Focus, Locale, Scene, Tone } from "../types.ts";
import { Caption, FONT, KineticLine, Pill, SceneEnvelope, dirOf } from "./ui.tsx";

type P<K extends Scene["kind"]> = { scene: Extract<Scene, { kind: K }>; locale: Locale; brand: Brand; frames: number };

const toneColor = (b: Brand, t: Tone | undefined) =>
  t === "good" ? b.good : t === "warn" ? b.warn : t === "bad" ? b.bad : t === "accent" ? b.accent : b.muted;

const CardView: React.FC<{ card: Card; locale: Locale; brand: Brand; late: boolean; width: number }> = ({ card, locale, brand, late, width }) => {
  const tag = late && card.later ? card.later.tag : card.tag;
  const tone = late && card.later ? card.later.tone : card.tone;
  const faded = late && card.later?.faded;
  const c = toneColor(brand, tone);
  return (
    <div
      dir={dirOf(locale)}
      style={{
        width,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "16px 22px",
        background: brand.surface,
        border: `1px solid ${brand.border}`,
        borderRadius: 18,
        boxShadow: "0 8px 24px rgba(24,24,27,0.07)",
        fontFamily: FONT[locale],
        opacity: faded ? 0.5 : 1,
        filter: faded ? "grayscale(1)" : undefined,
      }}
    >
      <div style={{ width: 46, height: 46, borderRadius: 999, background: brand.accentSoft, color: brand.accent, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 22, flex: "none" }}>
        {card.title.trim().charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 25, fontWeight: 650, color: brand.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.title}</div>
        {card.sub ? (
          <div style={{ fontSize: 20, color: brand.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{card.sub}</div>
        ) : null}
      </div>
      {tag ? (
        <div style={{ flex: "none", fontSize: 19, fontWeight: 650, color: c, background: `${c}14`, border: `1px solid ${c}40`, borderRadius: 999, padding: "6px 14px", whiteSpace: "nowrap" }}>
          {tag}
        </div>
      ) : null}
    </div>
  );
};

/** Pile / queue: a vertical list that fills in one card at a time. */
const CardList: React.FC<{ cards: Card[]; mode: "pile" | "queue"; locale: Locale; brand: Brand; frames: number }> = ({ cards, mode, locale, brand, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lateAt = Math.round(frames * 0.5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {cards.map((card, i) => {
        const s = spring({ frame: frame - 6 - i * (mode === "pile" ? 5 : 7), fps, config: { damping: 16, stiffness: 120 } });
        const late = mode === "queue" && frame >= lateAt + i * 4;
        return (
          <div key={i} style={{ opacity: s, transform: `translateY(${(1 - s) * -40}px) scale(${0.96 + s * 0.04})` }}>
            <CardView card={card} locale={locale} brand={brand} late={late} width={640} />
          </div>
        );
      })}
    </div>
  );
};

/** Sorted: cards start stacked in the middle, then fly into two labelled columns. */
const CardSort: React.FC<{ cards: Card[]; groups: [string, string]; locale: Locale; brand: Brand }> = ({ cards, groups, locale, brand }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const rtl = locale === "ar";
  const colW = 600;
  const gap = 80;
  const left = (width - colW * 2 - gap) / 2;
  // First group sits at the inline start (left in English, right in Arabic).
  const colX = (g: 0 | 1) => (rtl ? (g === 0 ? left + colW + gap : left) : g === 0 ? left : left + colW + gap);
  const counters = [0, 0];
  const top = 380;
  return (
    <AbsoluteFill>
      {[0, 1].map((g) => {
        const s = spring({ frame: frame - 20, fps, config: { damping: 20 } });
        return (
          <div
            key={g}
            dir={dirOf(locale)}
            style={{
              position: "absolute",
              left: colX(g as 0 | 1),
              top: top - 70,
              width: colW,
              opacity: s,
              fontFamily: FONT[locale],
              fontWeight: 700,
              fontSize: 30,
              color: g === 0 ? brand.good : brand.muted,
              textAlign: "start",
            }}
          >
            {groups[g]}
          </div>
        );
      })}
      {cards.map((card, i) => {
        const g: 0 | 1 = card.tone === "good" ? 0 : 1;
        const row = counters[g]++;
        const appear = spring({ frame: frame - i * 3, fps, config: { damping: 18 } });
        const move = spring({ frame: frame - 18 - i * 4, fps, config: { damping: 17, stiffness: 90 } });
        const x0 = (width - colW) / 2;
        const y0 = top + 60 + i * 8;
        const x1 = colX(g);
        const y1 = top + row * 104;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: interpolate(move, [0, 1], [x0, x1]),
              top: interpolate(move, [0, 1], [y0, y1]),
              opacity: appear,
              transform: `rotate(${(1 - move) * (i % 2 ? 2 : -2)}deg)`,
              zIndex: 10 + i,
            }}
          >
            <CardView card={card} locale={locale} brand={brand} late={false} width={colW} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export const KineticScene: React.FC<P<"kinetic">> = ({ scene, locale, brand, frames }) => {
  const hasList = scene.cards && scene.cards.length > 0 && scene.cardMode !== "sorted";
  const sorted = scene.cards && scene.cardMode === "sorted";
  const lineSize = hasList ? 62 : sorted ? 64 : 84;
  const lineGap = Math.round(frames / Math.max(scene.lines.length, 1) / 2.2);
  const text = (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: hasList ? 860 : 1500, alignItems: hasList ? "flex-start" : "center" }}>
      {scene.eyebrow ? <Pill text={scene.eyebrow} locale={locale} brand={brand} /> : null}
      {scene.lines.map((l, i) => (
        <KineticLine
          key={i}
          text={l}
          delay={8 + i * lineGap}
          locale={locale}
          size={lineSize}
          color={i === scene.accentLine ? brand.accent : brand.text}
          align={hasList ? "start" : "center"}
        />
      ))}
    </div>
  );
  return (
    <SceneEnvelope durationInFrames={frames}>
      {hasList ? (
        <AbsoluteFill dir={dirOf(locale)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 100, padding: "0 120px 120px" }}>
          {text}
          <CardList cards={scene.cards!} mode={scene.cardMode === "queue" ? "queue" : "pile"} locale={locale} brand={brand} frames={frames} />
        </AbsoluteFill>
      ) : sorted ? (
        <>
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 90 }}>{text}</AbsoluteFill>
          <CardSort cards={scene.cards!} groups={scene.groups ?? ["", ""]} locale={locale} brand={brand} />
        </>
      ) : (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 160px 80px" }}>{text}</AbsoluteFill>
      )}
      <Caption text={scene.caption} locale={locale} brand={brand} durationInFrames={frames} />
    </SceneEnvelope>
  );
};

export const PersonaScene: React.FC<P<"persona">> = ({ scene, locale, brand, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ring = spring({ frame: frame - 4, fps, config: { damping: 14 } });
  return (
    <SceneEnvelope durationInFrames={frames}>
      <AbsoluteFill dir={dirOf(locale)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, paddingBottom: 100 }}>
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 999,
            background: `linear-gradient(135deg, ${brand.accent}, ${brand.blobB})`,
            display: "grid",
            placeItems: "center",
            transform: `scale(${0.6 + ring * 0.4})`,
            opacity: ring,
            boxShadow: `0 30px 80px ${brand.accent}40`,
            fontFamily: FONT[locale],
            fontSize: 150,
            fontWeight: 700,
            color: "#fff",
            flex: "none",
          }}
        >
          {scene.initial}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 980 }}>
          <KineticLine text={scene.name} delay={8} locale={locale} size={96} color={brand.text} align="start" />
          <KineticLine text={scene.role} delay={16} locale={locale} size={44} weight={600} color={brand.text} align="start" stagger={2} />
          <KineticLine text={scene.place} delay={24} locale={locale} size={36} weight={500} color={brand.muted} align="start" stagger={2} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 18 }}>
            {scene.facts.map((f, i) => {
              const s = spring({ frame: frame - 36 - i * 8, fps, config: { damping: 18 } });
              return (
                <div key={i} style={{ opacity: s, transform: `translateY(${(1 - s) * 16}px)` }}>
                  <Pill text={f} locale={locale} brand={brand} />
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
      <Caption text={scene.caption} locale={locale} brand={brand} durationInFrames={frames} />
    </SceneEnvelope>
  );
};

const DEFAULT_FROM: Focus = { x: 0.5, y: 0.5, zoom: 1 };
const DEFAULT_TO: Focus = { x: 0.5, y: 0.5, zoom: 1.06 };

/** Real product footage in a floating window with a slow camera move, a chapter pill and a caption. */
export const FootageScene: React.FC<P<"footage">> = ({ scene, locale, brand, frames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const from = scene.from ?? DEFAULT_FROM;
  const to = scene.to ?? DEFAULT_TO;
  const k = interpolate(frame, [0, frames], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateRight: "clamp" });
  const zoom = from.zoom + (to.zoom - from.zoom) * k;
  const fx = from.x + (to.x - from.x) * k;
  const fy = from.y + (to.y - from.y) * k;
  const winW = Math.round(width * 0.8);
  const winH = Math.round((winW * 9) / 16);
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 110 } });
  const srcLen = (scene.toS ?? 0) - (scene.fromS ?? 0);
  const rate = scene.media === "video" && srcLen > 0 ? srcLen / scene.durationS : 1;
  const chapterS = spring({ frame: frame - 4, fps, config: { damping: 16 } });
  // Keep the zoomed frame inside the window: translate so the focus point moves toward the centre, clamped at the edges.
  const maxShift = (zoom - 1) / 2;
  const tx = Math.max(-maxShift, Math.min(maxShift, (0.5 - fx) * (zoom - 1) * 2)) * winW;
  const ty = Math.max(-maxShift, Math.min(maxShift, (0.5 - fy) * (zoom - 1) * 2)) * winH;
  return (
    <SceneEnvelope durationInFrames={frames}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 54 }}>
        <div
          style={{
            width: winW,
            height: winH,
            borderRadius: 26,
            overflow: "hidden",
            background: brand.surface,
            border: `1px solid ${brand.border}`,
            boxShadow: "0 40px 90px rgba(40,30,120,0.18), 0 8px 24px rgba(24,24,27,0.08)",
            transform: `translateY(${(1 - enter) * 40}px) scale(${0.97 + enter * 0.03})`,
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", inset: 0, transform: `translate(${tx}px, ${ty}px) scale(${zoom})`, transformOrigin: "50% 50%" }}>
            {scene.media === "video" ? (
              <OffthreadVideo
                src={staticFile(`footage/${scene.src}`)}
                trimBefore={Math.round((scene.fromS ?? 0) * fps)}
                playbackRate={rate}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Img src={staticFile(`footage/${scene.src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
            )}
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill dir={dirOf(locale)} style={{ padding: "26px 0 0", paddingInlineStart: (width - winW) / 2 - 18, alignItems: "flex-start" }}>
        <div style={{ opacity: chapterS, transform: `translateY(${(1 - chapterS) * -16}px)` }}>
          <Pill text={scene.chapter} locale={locale} brand={brand} strong size={28} />
        </div>
      </AbsoluteFill>
      <Caption text={scene.caption} locale={locale} brand={brand} durationInFrames={frames} delay={10} />
      {void height}
    </SceneEnvelope>
  );
};

export const OutcomeScene: React.FC<P<"outcome">> = ({ scene, locale, brand, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <SceneEnvelope durationInFrames={frames}>
      <AbsoluteFill dir={dirOf(locale)} style={{ alignItems: "center", justifyContent: "center", paddingBottom: 90 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 34, width: 1280 }}>
          <KineticLine text={scene.title} delay={4} locale={locale} size={68} color={brand.text} align="start" />
          {scene.points.map((p, i) => {
            const s = spring({ frame: frame - 18 - i * 14, fps, config: { damping: 16 } });
            const check = spring({ frame: frame - 26 - i * 14, fps, config: { damping: 12, stiffness: 160 } });
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, opacity: s, transform: `translateY(${(1 - s) * 22}px)` }}>
                <div style={{ width: 64, height: 64, flex: "none", borderRadius: 999, background: brand.good, display: "grid", placeItems: "center", transform: `scale(${check})` }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" strokeDashoffset={24 * (1 - check)} />
                  </svg>
                </div>
                <div style={{ fontFamily: FONT[locale], fontSize: 46, fontWeight: 600, color: brand.text, lineHeight: 1.35 }}>{p}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Caption text={scene.caption} locale={locale} brand={brand} durationInFrames={frames} />
    </SceneEnvelope>
  );
};

export const CtaScene: React.FC<P<"cta">> = ({ scene, locale, brand, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 2, fps, config: { damping: 14 } });
  const btn = spring({ frame: frame - 30, fps, config: { damping: 14 } });
  return (
    <SceneEnvelope durationInFrames={frames + 9}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, paddingBottom: 40 }}>
        <div style={{ fontFamily: FONT.en, fontSize: 168, fontWeight: 760, letterSpacing: "-0.045em", color: brand.text, opacity: s, transform: `scale(${0.9 + s * 0.1})` }}>
          {scene.wordmark}
        </div>
        <div style={{ width: 1400 }}>
          <KineticLine text={scene.tagline} delay={14} locale={locale} size={50} weight={600} color={brand.muted} stagger={2} />
        </div>
        {scene.badge ? (
          <div style={{ opacity: btn }}>
            <Pill text={scene.badge} locale={locale} brand={brand} size={28} />
          </div>
        ) : null}
        <div
          dir={dirOf(locale)}
          style={{
            marginTop: 8,
            opacity: btn,
            transform: `scale(${0.92 + btn * 0.08})`,
            padding: "22px 46px",
            borderRadius: 16,
            background: brand.accent,
            color: "#fff",
            fontFamily: FONT[locale],
            fontSize: 38,
            fontWeight: 700,
            boxShadow: `0 18px 40px ${brand.accent}55`,
          }}
        >
          {scene.action}
        </div>
        {scene.note ? (
          <div dir={dirOf(locale)} style={{ opacity: btn, fontFamily: FONT[locale], fontSize: 28, color: brand.muted }}>
            {scene.note}
          </div>
        ) : null}
      </AbsoluteFill>
      <Caption text={scene.caption} locale={locale} brand={brand} durationInFrames={frames} />
    </SceneEnvelope>
  );
};

/** Concept hand-off between two products: a card leaves one product's tile and lands in the other's. Not product UI. */
export const HandoffScene: React.FC<P<"handoff">> = ({ scene, locale, brand, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rtl = locale === "ar";
  const tiles = spring({ frame: frame - 6, fps, config: { damping: 18 } });
  const travel = interpolate(frame, [Math.round(frames * 0.3), Math.round(frames * 0.62)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const landed = spring({ frame: frame - Math.round(frames * 0.62), fps, config: { damping: 14 } });
  const tileW = 620;
  const gap = 260;
  const total = tileW * 2 + gap;
  const left0 = (1920 - total) / 2;
  // Source tile at the inline start: left in English, right in Arabic.
  const srcX = rtl ? left0 + tileW + gap : left0;
  const dstX = rtl ? left0 : left0 + tileW + gap;
  const top = 470;
  const Tile: React.FC<{ x: number; product: string; color: string; children?: React.ReactNode }> = ({ x, product, color, children }) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top,
        width: tileW,
        height: 300,
        borderRadius: 28,
        background: "rgba(255,255,255,0.7)",
        border: `2px dashed ${color}66`,
        opacity: tiles,
        transform: `translateY(${(1 - tiles) * 30}px)`,
      }}
    >
      <div style={{ position: "absolute", top: -54, insetInlineStart: 0, width: "100%", textAlign: "center", fontFamily: FONT.en, fontWeight: 760, fontSize: 40, letterSpacing: "-0.03em", color }}>{product}</div>
      {children}
    </div>
  );
  const cardX = interpolate(travel, [0, 1], [srcX + 10, dstX + 10]);
  const lift = Math.sin(travel * Math.PI) * -70;
  return (
    <SceneEnvelope durationInFrames={frames}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 70 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, maxWidth: 1500 }}>
          <Pill text={scene.eyebrow} locale={locale} brand={brand} />
          {scene.lines.map((l, i) => (
            <KineticLine key={i} text={l} delay={8 + i * 12} locale={locale} size={60} color={i === scene.lines.length - 1 ? brand.accent : brand.text} />
          ))}
        </div>
      </AbsoluteFill>
      <Tile x={srcX} product={scene.from.product} color={scene.from.color} />
      <Tile x={dstX} product={scene.to.product} color={scene.to.color}>
        <div style={{ position: "absolute", left: 10, top: 170, opacity: landed, transform: `translateY(${(1 - landed) * 12}px)` }}>
          <CardView card={scene.to.card} locale={locale} brand={brand} late={false} width={tileW - 20} />
        </div>
      </Tile>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: tiles }}>
        <path
          d={`M ${srcX + tileW + (rtl ? -tileW : 0) + (rtl ? -10 : 10)} ${top + 150} L ${dstX + (rtl ? tileW + 10 : -10)} ${top + 150}`}
          stroke={brand.muted}
          strokeOpacity={0.35}
          strokeWidth={4}
          strokeDasharray="10 12"
          strokeDashoffset={-frame * 1.5}
        />
      </svg>
      <div style={{ position: "absolute", left: cardX, top: top + 40 + lift, zIndex: 20, opacity: 1 - landed * 0.999 }}>
        <CardView card={scene.from.card} locale={locale} brand={brand} late={false} width={tileW - 20} />
      </div>
      {scene.badge ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: scene.caption ? 150 : 70 }}>
          <div dir={dirOf(locale)} style={{ fontFamily: FONT[locale], fontSize: 24, fontWeight: 600, color: brand.warn, background: "#fff7ed", border: `1px solid ${brand.warn}55`, borderRadius: 999, padding: "8px 20px" }}>
            {scene.badge}
          </div>
        </AbsoluteFill>
      ) : null}
      <Caption text={scene.caption} locale={locale} brand={brand} durationInFrames={frames} />
    </SceneEnvelope>
  );
};
