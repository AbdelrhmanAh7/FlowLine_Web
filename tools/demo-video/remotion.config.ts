// Minimal Remotion config: PNG frames (lossless input to the x264 encode) and overwrite on re-render.
// No telemetry or paid services are configured here.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
