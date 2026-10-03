import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

// Owned ignored scratch output only; protect all real environment files from Kit's dotenv autoload.
const scratch = resolve("node_modules/.cache/paid-pilot-drizzle-prune");
mkdirSync(scratch, { recursive: true });
const empty = join(scratch, "empty.txt");
writeFileSync(empty, "");
const config = join(scratch, "drizzle.config.ts");
const generated = join(scratch, "generated");
writeFileSync(config, `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({schema:"./src/db/schema.ts",out:"./node_modules/.cache/paid-pilot-drizzle-prune/generated",dialect:"postgresql"});\n`);
const require = createRequire(import.meta.url);
const kitFolder = dirname(require.resolve("drizzle-kit"));
const cli = join(kitFolder, "bin.cjs");
for (const command of ["generate", "check"]) {
  const run = spawnSync(process.execPath, [cli, command, "--config", config], {
    env: { ...process.env, DOTENV_CONFIG_PATH: empty }, stdio: "inherit",
  });
  assert.equal(run.status, 0, `Drizzle ${command} failed`);
}
const sqlFiles = readdirSync(generated).filter((name) => name.endsWith(".sql"));
assert.ok(sqlFiles.length > 0, "Generation produced no migration");
const sql = sqlFiles.map((name) => readFileSync(join(generated, name), "utf8")).join("\n");
assert.match(sql, /CREATE TABLE "user"/);
assert.match(sql, /CREATE TABLE "workspace"/);
assert.match(sql, /CREATE TABLE "session"/);
const kitRequire = createRequire(cli);
const esbuild = kitRequire("esbuild");
assert.equal(esbuild.version, "0.25.12");
for (const entry of ["worker/index.ts", "src/lib/auth.ts"]) {
  const output = await esbuild.build({ entryPoints: [entry], bundle: true, packages: "external", platform: "node", format: "esm", target: "node22", write: false });
  assert.ok(output.outputFiles[0].contents.length > 0);
  console.log(`Compiled ${entry} with retained esbuild ${esbuild.version} for Node 22`);
}
console.log("Drizzle schema generation/check and auth/worker compilation passed; no database access or Next production build claimed.");
