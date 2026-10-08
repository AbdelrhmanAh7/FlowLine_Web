// public/media/demo/manifest.json: the contract the landing page reads (clip metadata, hashed file names, codec
// strings, sizes). Schema, validation, merging of partial rebuilds, and the size budget checks.
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BUDGET, CLIP_IDS, CLIPS, type ClipId } from "./clips";

const clipId = z.enum(CLIP_IDS as [ClipId, ...ClipId[]]);
const locale = z.enum(["ar", "en"]);
const theme = z.enum(["light", "dark"]);
const bytes = z.number().int().nonnegative();

export const ClipEntrySchema = z
  .object({
    shape: z.enum(["window", "wide", "square"]),
    aspect: z.enum(["16/9", "1/1"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().positive(),
    durationS: z.number().positive(),
    loop: z.boolean(),
    chapters: z.array(z.object({ id: z.string().min(1), t: z.number().nonnegative() }).strict()).optional(),
  })
  .strict();

const base = { clip: clipId, locale, path: z.string().min(1), bytes };

export const ManifestFileSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, theme, kind: z.literal("video"), codec: z.enum(["av1", "h264"]), type: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/), bitrate: z.number().int().positive() }).strict(),
  z.object({ ...base, theme, kind: z.literal("poster"), sha256: z.string().regex(/^[0-9a-f]{64}$/).optional() }).strict(),
  z.object({ ...base, kind: z.literal("captions"), lang: locale }).strict(),
  z.object({ ...base, theme, kind: z.literal("chapter-still"), chapter: z.string().min(1) }).strict(),
]);

export const ManifestSchema = z
  .object({
    schema: z.literal(1),
    generatedAt: z.iso.datetime(),
    uiCommit: z.string().min(1),
    tooling: z.object({ playwright: z.string().min(1), remotion: z.string().min(1) }).strict(),
    clips: z.partialRecord(clipId, ClipEntrySchema),
    files: z.array(ManifestFileSchema),
  })
  .strict();

export type ClipEntry = z.infer<typeof ClipEntrySchema>;
export type ManifestFile = z.infer<typeof ManifestFileSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type Slice = { clip: ClipId; locale: "ar" | "en"; theme?: "light" | "dark" };

/** `<stem>.<first 8 hex of sha256(bytes)>.<ext>`: the file name changes whenever the content does. */
export function hashName(stem: string, ext: string, content: Buffer | Uint8Array): string {
  return `${stem}.${createHash("sha256").update(content).digest("hex").slice(0, 8)}.${ext}`;
}

/** Name pattern of a file: `<clip>.<locale>[.<theme>].<part>.<8 hex>.<ext>` (captions have no theme and no part). */
function namePattern(f: ManifestFile): RegExp {
  const head = `${f.clip}\\.${f.locale}`;
  switch (f.kind) {
    case "video":
      return new RegExp(`^${head}\\.${f.theme}\\.${f.codec}\\.[0-9a-f]{8}\\.mp4$`);
    case "poster":
      return new RegExp(`^${head}\\.${f.theme}\\.poster\\.[0-9a-f]{8}\\.jpg$`);
    case "chapter-still":
      return new RegExp(`^${head}\\.${f.theme}\\.ch\\d+\\.[0-9a-f]{8}\\.jpg$`);
    case "captions":
      return new RegExp(`^${head}\\.[0-9a-f]{8}\\.vtt$`);
  }
}

const ASPECT = { window: "16/9", wide: "16/9", square: "1/1" } as const;

export function validateManifest(json: unknown): Manifest {
  const r = ManifestSchema.safeParse(json);
  if (!r.success) throw new Error(`manifest.json is invalid: ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  const m = r.data;
  const problems: string[] = [];
  for (const [id, c] of Object.entries(m.clips)) {
    if (ASPECT[c.shape] !== c.aspect) problems.push(`clips.${id}: shape ${c.shape} must have aspect ${ASPECT[c.shape]}, got ${c.aspect}`);
  }
  const seen = new Set<string>();
  for (const f of m.files) {
    if (seen.has(f.path)) problems.push(`duplicate path ${f.path}`);
    seen.add(f.path);
    if (f.path.includes("/") || f.path.includes("\\")) problems.push(`${f.path}: path must be a bare file name`);
    else if (!namePattern(f).test(f.path)) problems.push(`${f.path}: name does not match the hashed pattern for a ${f.kind} (${f.clip}, ${f.locale})`);
    const clip = m.clips[f.clip];
    if (!clip) problems.push(`${f.path}: clip "${f.clip}" is not in clips`);
    else if (f.kind === "chapter-still" && clip.chapters && !clip.chapters.some((c) => c.id === f.chapter)) problems.push(`${f.path}: chapter "${f.chapter}" is not a chapter of ${f.clip}`);
  }
  if (problems.length) throw new Error(`manifest.json is invalid: ${problems.join("; ")}`);
  return m;
}

const KIND_ORDER = { video: 0, poster: 1, "chapter-still": 2, captions: 3 } as const;
const CLIP_ORDER = new Map(CLIP_IDS.map((c, i) => [c, i]));

function fileSortKey(f: ManifestFile): [number, string, string, number, string, string] {
  return [
    CLIP_ORDER.get(f.clip)!,
    f.locale,
    "theme" in f ? f.theme : "",
    KIND_ORDER[f.kind],
    f.kind === "video" ? f.codec : f.kind === "chapter-still" ? f.chapter : "",
    f.path,
  ];
}

function compareFiles(a: ManifestFile, b: ManifestFile): number {
  const ka = fileSortKey(a);
  const kb = fileSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i]! < kb[i]!) return -1;
    if (ka[i]! > kb[i]!) return 1;
  }
  return 0;
}

export type ManifestUpdate = {
  clips: Partial<Record<ClipId, ClipEntry>>;
  files: ManifestFile[];
  /** Slices that were rebuilt: their old entries go, the new `files` come in. Others are kept. */
  replace: Slice[];
  uiCommit: string;
  generatedAt: string;
  tooling: Manifest["tooling"];
};

export function mergeManifest(old: Manifest | null, update: ManifestUpdate): Manifest {
  const inSlice = (f: ManifestFile, s: Slice) => f.clip === s.clip && f.locale === s.locale && (s.theme === undefined || !("theme" in f) || f.theme === s.theme);
  const kept = (old?.files ?? []).filter((f) => !update.replace.some((s) => inSlice(f, s)));
  const clips = { ...(old?.clips ?? {}), ...update.clips };
  const ordered: Manifest["clips"] = {};
  for (const id of CLIP_IDS) if (clips[id]) ordered[id] = clips[id];
  return validateManifest({
    schema: 1,
    generatedAt: update.generatedAt,
    uiCommit: update.uiCommit,
    tooling: update.tooling,
    clips: ordered,
    files: [...kept, ...update.files].sort(compareFiles),
  });
}

const mb = (n: number) => `${(n / 1_000_000).toFixed(2)} MB`;
const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;

/** Size problems against the budget (empty = ok). With `dir`, the real file sizes are used and checked against the manifest. */
export function budgetReport(files: ManifestFile[], dir?: string): string[] {
  const problems: string[] = [];
  let total = 0;
  for (const f of files) {
    let size = f.bytes;
    if (dir) {
      try {
        size = fs.statSync(path.join(dir, f.path)).size;
        if (size !== f.bytes) problems.push(`${f.path}: ${size} bytes on disk, manifest says ${f.bytes}`);
      } catch {
        problems.push(`${f.path}: listed in the manifest but missing from ${dir}`);
        continue;
      }
    }
    total += size;
    if (size > BUDGET.fileCap) problems.push(`${f.path}: ${mb(size)} is over the ${mb(BUDGET.fileCap)} file cap`);
    if (f.kind === "video") {
      const target = CLIPS[f.clip].target[f.codec];
      if (size > target) problems.push(`${f.path}: ${mb(size)} is over the ${mb(target)} ${f.codec} target`);
    } else if (f.kind === "poster" && size > BUDGET.poster) {
      problems.push(`${f.path}: poster ${kb(size)} is over ${kb(BUDGET.poster)}`);
    } else if (f.kind === "chapter-still" && size > BUDGET.chapterStill) {
      problems.push(`${f.path}: chapter still ${kb(size)} is over ${kb(BUDGET.chapterStill)}`);
    }
  }
  if (total > BUDGET.totalCap) problems.push(`total ${mb(total)} is over the ${mb(BUDGET.totalCap)} directory cap`);
  return problems;
}

export async function readManifest(dir: string): Promise<Manifest> {
  return validateManifest(JSON.parse(await fsp.readFile(path.join(dir, "manifest.json"), "utf8")));
}

export async function writeManifest(dir: string, m: Manifest): Promise<void> {
  validateManifest(m);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
}

/** Files in `dir` that the manifest does not reference (manifest.json and dotfiles excluded), sorted. */
export async function staleFiles(dir: string, manifest: Manifest): Promise<string[]> {
  const known = new Set(manifest.files.map((f) => f.path));
  const names = await fsp.readdir(dir);
  return names.filter((n) => n !== "manifest.json" && !n.startsWith(".") && !known.has(n)).sort();
}
