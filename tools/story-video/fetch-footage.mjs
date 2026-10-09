// Copies the real-UI walkthrough recordings (landing demo pipeline, #99) into public/footage/ for the story film.
// Source order: ../../public/media/demo (once #99 is merged), else the ai/99 branch via `git show`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = "public/footage";
mkdirSync(out, { recursive: true });
const demo = "../../public/media/demo";
for (const locale of ["en", "ar"]) {
  const re = new RegExp(`^walkthrough\\.${locale}\\.light\\.h264\\.[0-9a-f]+\\.mp4$`);
  const local = existsSync(demo) ? readdirSync(demo).find((f) => re.test(f)) : undefined;
  const dst = join(out, `walkthrough.${locale}.mp4`);
  if (local) {
    copyFileSync(join(demo, local), dst);
  } else {
    const ref = process.env.FOOTAGE_REF ?? "75d9352130b54d42e1a4f1f15fda6afc6ddc9ecb" /* head of branch ai/99 (PR #101); fetch it first: git fetch origin ai/99 */;
    const list = execFileSync("git", ["-C", "../..", "ls-tree", "--name-only", `${ref}:public/media/demo`], { encoding: "utf8" }).split("\n");
    const name = list.find((p) => re.test(p));
    if (!name) throw new Error(`no walkthrough.${locale} H.264 clip in ${demo} or ${ref}; run pnpm demo:build first`);
    writeFileSync(dst, execFileSync("git", ["-C", "../..", "show", `${ref}:public/media/demo/${name}`], { maxBuffer: 64 << 20 }));
  }
  console.log("footage:", dst);
}
