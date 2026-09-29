import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression (merged browser gate, 2026-09-29): every write-only secret field is UNCONTROLLED and read through its ref
 * at submit time (`takeSecret(ref.current)`). Five fields were rendered without `ref`, so the typed secret was never
 * submitted (setup code, setup email key, setup password, admin-panel secrets, workspace OAuth secret).
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("SecretInput usages", () => {
  it("every <SecretInput …> is bound to a ref", () => {
    const missing: string[] = [];
    for (const f of files("src")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<SecretInput\b[^>]*>/g)) if (!/\bref=\{/.test(m[0])) missing.push(`${f}: ${m[0].slice(0, 80)}`);
    }
    expect(missing).toEqual([]);
  });
});
