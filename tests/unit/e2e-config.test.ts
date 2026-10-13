import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("e2e-army configuration and runner", () => {
  it("e2e.config.ts contains no committed secrets or hardcoded API keys", () => {
    const configText = readFileSync(join(root, "e2e.config.ts"), "utf8");
    expect(configText).not.toMatch(/(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']+["']/i);
    expect(configText).toContain("e2e-army/**/*.e2e.ts");
    expect(configText).toContain("process.env.E2E_TELEMETRY_DISABLED = \"1\"");
  });

  it("scripts/e2e-army.mjs sanitizes logging and does not log clear-text env variables", () => {
    const runnerText = readFileSync(join(root, "scripts/e2e-army.mjs"), "utf8");
    // Ensure process.env / env properties (especially URLs/credentials) are not directly logged to console
    expect(runnerText).not.toMatch(/console\.log\([^)]*env\.E2E_ARMY_URL/);
    expect(runnerText).not.toMatch(/console\.log\([^)]*process\.env\.E2E_ARMY_URL/);
    expect(runnerText).toContain('console.log(`e2e-army: ${target} · model ${model}`)');
  });

  it("every feature test is titled [<feature>.<n>] and tagged feat / shard / lvl with matching feature ids", () => {
    const dir = join(root, "e2e-army/features");
    const found: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".e2e.ts") && !x.startsWith("_"))) {
      const text = readFileSync(join(dir, f), "utf8");
      for (const m of text.matchAll(/test\("\[([a-z0-9-]+)\.(\d+)\][^\n]*?tags: \[([^\]]*)\]/g)) {
        const [, feature, , tags] = m;
        found.push(`${feature}.${m[2]}`);
        expect(tags, `${f} ${feature}.${m[2]}`).toContain(`"feat:${feature}"`);
        expect(tags, `${f} ${feature}.${m[2]}`).toMatch(/"shard:[a-z0-9-]+"/);
        expect(tags, `${f} ${feature}.${m[2]}`).toMatch(/"lvl:(ui|api|job)"/);
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(100);
    expect(new Set(found).size).toBe(found.length);
  });

  it("scripts/e2e-army.mjs maps --shard-id to the shard tag", () => {
    const runnerText = readFileSync(join(root, "scripts/e2e-army.mjs"), "utf8");
    expect(runnerText).toContain('"--shard-id"');
    expect(runnerText).toContain("`shard:${id}`");
  });
});
