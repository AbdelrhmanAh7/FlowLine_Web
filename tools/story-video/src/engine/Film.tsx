// Plays a list of scenes back to back over one persistent background.
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { brand } from "../brand.ts";
import type { Story } from "../types.ts";
import { CtaScene, FootageScene, HandoffScene, KineticScene, OutcomeScene, PersonaScene } from "./scenes.tsx";
import { Background, useFontsReady } from "./ui.tsx";

export const framesOf = (s: Story) => s.scenes.reduce((n, sc) => n + Math.round(sc.durationS * s.fps), 0);

/** Start frame of every scene (used by the VTT writer too). */
export function timeline(s: Story) {
  let at = 0;
  return s.scenes.map((scene) => {
    const frames = Math.round(scene.durationS * s.fps);
    const row = { scene, from: at, frames };
    at += frames;
    return row;
  });
}

export const Film: React.FC<{ story: Story }> = ({ story }) => {
  useFontsReady();
  const { locale } = story;
  return (
    <AbsoluteFill style={{ background: brand.bg }}>
      <Background brand={brand} />
      {timeline(story).map(({ scene, from, frames }) => {
        const p = { locale, brand, frames };
        return (
          <Sequence key={scene.id} from={from} durationInFrames={frames} name={scene.id}>
            {scene.kind === "kinetic" ? <KineticScene scene={scene} {...p} /> : null}
            {scene.kind === "persona" ? <PersonaScene scene={scene} {...p} /> : null}
            {scene.kind === "footage" ? <FootageScene scene={scene} {...p} /> : null}
            {scene.kind === "outcome" ? <OutcomeScene scene={scene} {...p} /> : null}
            {scene.kind === "handoff" ? <HandoffScene scene={scene} {...p} /> : null}
            {scene.kind === "cta" ? <CtaScene scene={scene} {...p} /> : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
