import React from "react";
import { Composition } from "remotion";
import { Film, framesOf } from "./engine/Film.tsx";
import { stories } from "./story.ts";

/** One composition per story and locale, e.g. `story-en`, `short-ar`. */
export const RemotionRoot: React.FC = () => (
  <>
    {stories.map((s) => (
      <Composition
        key={`${s.id}-${s.locale}`}
        id={`${s.id}-${s.locale}`}
        component={Film}
        defaultProps={{ story: s }}
        durationInFrames={framesOf(s)}
        fps={s.fps}
        width={s.width}
        height={s.height}
      />
    ))}
  </>
);
