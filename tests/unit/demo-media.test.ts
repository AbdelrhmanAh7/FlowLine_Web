import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import fixture from "./fixtures/demo-manifest.json";
import { validateManifest } from "../../scripts/demo/manifest";
import { chooseSource, fileFor, readDemoManifest } from "@/lib/demo-media";

const manifest = validateManifest(fixture);
const files = fileFor(manifest, "hero", "ar", "light");
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

it("AC8: missing manifest returns null; valid manifests are parsed; invalid manifests fail visibly", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fl357-"));
  dirs.push(dir);
  expect(await readDemoManifest(dir)).toBeNull();
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(fixture));
  expect(await readDemoManifest(dir)).toEqual(manifest);
  await fs.writeFile(path.join(dir, "manifest.json"), '{"schema":2}');
  await expect(readDemoManifest(dir)).rejects.toThrow(/invalid/);
});

it("AC1: locale/theme resolution falls back to Arabic light; absent clips stay empty", () => {
  expect(fileFor(manifest, "hero", "en", "dark")).toEqual(files);
  expect(fileFor(manifest, "build", "en", "dark")[0]?.path).toBe("build.en.dark.av1.aa11bb22.mp4");
  expect(fileFor(manifest, "history", "ar", "light")).toEqual([]);
});

it.each([
  [true, true, true, true, "av1"],
  [true, true, false, true, "h264"],
  [true, true, false, false, "av1"],
  [true, false, true, false, null],
  [false, false, false, true, "h264"],
  [false, false, false, false, null],
])("AC1: capabilities supported=%s smooth=%s efficient=%s h264=%s select %s", (supported, smooth, powerEfficient, h264, codec) => {
  const selected = chooseSource(files, { av1: { supported, smooth, powerEfficient }, h264: { supported: h264, smooth: false, powerEfficient: false } });
  expect(selected?.codec ?? null).toBe(codec);
});
it("AC1: unknown capabilities and an empty file list choose no video", () => {
  expect(chooseSource(files, {})).toBeNull();
  expect(chooseSource([], {})).toBeNull();
});
