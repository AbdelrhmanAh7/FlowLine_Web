import path from "node:path";
import { readManifest } from "../../scripts/demo/manifest";
export { chooseSource, fileFor } from "./demo-source";

/** Missing media is expected until recordings ship; malformed manifests remain errors. Server-only IO. */
export async function readDemoManifest(dir = path.join(process.cwd(), "public/media/demo")) {
  try { return await readManifest(dir); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
