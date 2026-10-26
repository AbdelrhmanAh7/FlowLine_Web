import type { Manifest, ManifestFile } from "../../scripts/demo/manifest";

export function fileFor(manifest: Manifest, clip: ManifestFile["clip"], locale: "ar" | "en", theme: "light" | "dark") {
  for (const [lang, appearance] of [[locale, theme], [locale, "light"], ["ar", theme], ["ar", "light"]]) {
    const files = manifest.files.filter((f) => f.clip === clip && f.locale === lang && "theme" in f && f.theme === appearance);
    if (files.length) return files;
  }
  return [];
}

export function chooseSource(files: ManifestFile[], caps: Partial<Record<"av1" | "h264", MediaCapabilitiesInfo>>) {
  const videos = files.filter((f) => f.kind === "video");
  const av1 = videos.find((f) => f.kind === "video" && f.codec === "av1");
  const h264 = videos.find((f) => f.kind === "video" && f.codec === "h264");
  if (caps.av1?.supported && caps.av1.smooth && caps.av1.powerEfficient && av1) return av1;
  if (caps.h264?.supported && h264) return h264;
  return caps.av1?.supported && caps.av1.smooth && av1 ? av1 : null;
}
