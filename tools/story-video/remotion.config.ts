// JPEG frames (fast, small) and overwrite on re-render. No telemetry or paid services.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
