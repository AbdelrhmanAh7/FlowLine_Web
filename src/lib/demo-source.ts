/**
 * Pure, client-safe helpers of the landing demo (#100): which video file to fetch, and when to fetch nothing. No Node APIs here,
 * so the client components can import them; `demo-media.ts` re-exports them next to the server-side manifest reader.
 */

export type VideoSource = { codec: "av1" | "h264"; type: string; src: string; width: number; height: number; fps: number; bitrate: number };

/** The slice of `navigator.mediaCapabilities` / `HTMLVideoElement` that `chooseSource` needs (injectable for tests). */
export type DecodeCaps = {
  decodingInfo?: (config: { type: "file"; video: { contentType: string; width: number; height: number; framerate: number; bitrate: number } }) => Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }>;
  canPlayType?: (type: string) => string;
};

/**
 * Section 6 order: 1) AV1 if supported, smooth and power efficient; 2) H.264 if supported; 3) AV1 if supported and smooth (software
 * decode); 4) null = poster + Play. Without MediaCapabilities it falls back to `canPlayType` (H.264 first). A throwing
 * `decodingInfo` (an unknown type) counts as "not supported".
 */
export async function chooseSource(files: VideoSource[], caps: DecodeCaps): Promise<VideoSource | null> {
  const av1 = files.find((f) => f.codec === "av1");
  const h264 = files.find((f) => f.codec === "h264");
  const { decodingInfo, canPlayType } = caps;
  if (!decodingInfo) {
    if (!canPlayType) return null;
    return [h264, av1].find((f) => f && canPlayType(f.type) !== "") ?? null;
  }
  const info = async (f: VideoSource | undefined) => {
    if (!f) return { supported: false, smooth: false, powerEfficient: false };
    try {
      return await decodingInfo({ type: "file", video: { contentType: f.type, width: f.width, height: f.height, framerate: f.fps, bitrate: f.bitrate } });
    } catch {
      return { supported: false, smooth: false, powerEfficient: false };
    }
  };
  const [a, h] = await Promise.all([info(av1), info(h264)]);
  if (av1 && a.supported && a.smooth && a.powerEfficient) return av1;
  if (h264 && h.supported) return h264;
  if (av1 && a.supported && a.smooth) return av1;
  return null;
}

type Connection = { saveData?: boolean; effectiveType?: string } | undefined;

/** True when no video may be fetched on its own: reduced motion, Save-Data, or a 2g connection. */
export function shouldSkipVideo(reducedMotion: boolean, connection: Connection): boolean {
  return reducedMotion || connection?.saveData === true || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g";
}

/**
 * `play()` can reject (iOS Low Power Mode, autoplay policy: `NotAllowedError`). The handler decides what to show (the Play button);
 * resolves true when playback started. Very old browsers return `undefined` from `play()`.
 */
export async function startPlayback(video: { play(): Promise<void> | undefined }, onBlocked: (error: unknown) => void): Promise<boolean> {
  try {
    await video.play();
    return true;
  } catch (error) {
    onBlocked(error);
    return false;
  }
}
