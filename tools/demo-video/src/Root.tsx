import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo.tsx";
import { defaultProps } from "./defaultProps.ts";
import type { DemoProps } from "./props.ts";

export const Root: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    width={defaultProps.canvas.w}
    height={defaultProps.canvas.h}
    fps={defaultProps.fps}
    durationInFrames={Math.round(defaultProps.durationS * defaultProps.fps)}
    defaultProps={defaultProps}
    calculateMetadata={({ props }: { props: DemoProps }) => ({
      width: props.canvas.w,
      height: props.canvas.h,
      fps: props.fps,
      durationInFrames: Math.max(1, Math.round(props.durationS * props.fps)),
    })}
  />
);
