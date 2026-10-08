// The `Demo` composition: background, camera-transformed recording, cursor, captions/chips/cards, loop dissolve.
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Freeze, OffthreadVideo, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoProps } from "./props.ts";
import {
  buildTrack,
  cameraWithCaptions,
  contentRect,
  cursorAt,
  cursorOpacity,
  cursorScale,
  dissolveWeight,
  pressScale,
  ripplesAt,
  toCanvas,
  viewTransform,
} from "./camera.ts";
import { backgroundFor, buildPalette } from "./theme.ts";
import { Cursor, Ripple } from "./Cursor.tsx";
import { CaptionPill, ChapterCard, EndCard, StepChips } from "./Captions.tsx";

// Default CSS unicode-range per font subset (fontsource splits); picked from the file name when props do not say.
const RANGE_ARABIC =
  "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
const RANGE_LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-200B,U+200F-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

function rangeFor(f: DemoProps["fonts"][number]): string | undefined {
  if (f.unicodeRange) return f.unicodeRange;
  if (/-arabic-/.test(f.file)) return RANGE_ARABIC;
  if (/-latin-(?!ext)/.test(f.file)) return RANGE_LATIN;
  return undefined;
}

/** Registers props.fonts and holds the render until every face (and document.fonts) is ready. */
function useFonts(fonts: DemoProps["fonts"], enabled: boolean) {
  const [handle] = useState(() => (enabled ? delayRender("Loading demo fonts") : null));
  useEffect(() => {
    if (handle === null) return;
    let live = true;
    (async () => {
      const faces = fonts.map((f) => {
        const url = staticFile(f.file.includes("/") ? f.file : `fonts/${f.file}`);
        const range = rangeFor(f);
        return new FontFace(f.family, `url(${url})`, { weight: f.weight, ...(range ? { unicodeRange: range } : {}) });
      });
      await Promise.all(faces.map((face) => face.load()));
      if (!live) return;
      faces.forEach((face) => document.fonts.add(face));
      await document.fonts.ready;
      continueRender(handle);
    })().catch((err) => cancelRender(err));
    return () => {
      live = false;
    };
  }, [handle, fonts]);
}

const Placeholder: React.FC = () => (
  <div style={{ width: "100%", height: "100%", background: "repeating-conic-gradient(#d8d8e2 0% 25%, #ececf3 0% 50%) 0 0 / 80px 80px" }} />
);

/** One composed frame. `overlay` marks the frozen frame-0 copy used for the loop dissolve (it never loads fonts or recurses). */
const Scene: React.FC<DemoProps & { overlay?: boolean }> = (props) => {
  const { src, shape, locale, theme, canvas, durationS, loop, dissolveS, tokens, data, captions, chips, chapters, endCard, poster, base, overlay } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  useFonts(props.fonts, !overlay);

  const vp = data.viewport;
  const events = data.events;
  const f = canvas.h / 1080;
  const palette = useMemo(() => buildPalette(tokens, theme), [tokens, theme]);
  const rect = useMemo(() => contentRect(shape, canvas, vp, base), [shape, canvas, vp, base]);
  const keys = useMemo(() => buildTrack(events, vp, durationS, base), [events, vp, durationS, base]);

  const cam = cameraWithCaptions(keys, t, poster ? [] : captions, vp);
  const tr = viewTransform(cam, rect, canvas, vp);
  const win = shape === "window";
  const start: [number, number] = (() => {
    const m = events.find((e) => e.type === "move");
    return m && m.type === "move" ? m.from : [vp.w / 2, vp.h / 2];
  })();
  const cur = toCanvas(cursorAt(events, t, start), tr, rect, vp);
  const showFx = !poster;

  const w = overlay ? 0 : dissolveWeight(t, durationS, dissolveS, loop);

  return (
    <AbsoluteFill style={{ background: backgroundFor(palette, shape, locale), overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: canvas.w, height: canvas.h, transformOrigin: "0 0", transform: `translate(${tr.tx}px, ${tr.ty}px) scale(${tr.scale})` }}>
        <div
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            overflow: "hidden",
            ...(win ? { borderRadius: 18, boxShadow: `${palette.shadow}, 0 0 0 1px ${palette.hairline}` } : {}),
          }}
        >
          {src ? <OffthreadVideo src={staticFile(src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Placeholder />}
        </div>
      </div>
      {showFx ? (
        <>
          {ripplesAt(events, t).map((r, i) => {
            const [rx, ry] = toCanvas([r.x, r.y], tr, rect, vp);
            return <Ripple key={i} x={rx} y={ry} p={r.p} scale={f} palette={palette} />;
          })}
          <Cursor
            x={cur[0]}
            y={cur[1]}
            scale={cursorScale(cam.s) * pressScale(events, t) * f}
            opacity={cursorOpacity(events, t, { durationS, dissolveS, loop })}
            palette={palette}
          />
          <CaptionPill t={t} locale={locale} palette={palette} f={f} captions={captions} />
          {chips ? <StepChips t={t} locale={locale} palette={palette} f={f} chips={chips} /> : null}
          <ChapterCard t={t} locale={locale} palette={palette} f={f} chapters={chapters} />
          {endCard ? <EndCard t={t} locale={locale} palette={palette} f={f} endCard={endCard} /> : null}
        </>
      ) : null}
      {w > 0 ? (
        <AbsoluteFill style={{ opacity: w }}>
          <Freeze frame={0}>
            <Scene {...props} overlay />
          </Freeze>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const Demo: React.FC<DemoProps> = (props) => <Scene {...props} />;
