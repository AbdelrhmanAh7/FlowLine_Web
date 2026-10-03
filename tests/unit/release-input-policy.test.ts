import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const pinned = /^[a-z0-9/._-]+:[a-z0-9._-]+@sha256:[a-f0-9]{64}$/i;
describe("release input policy", () => {
  it("aligns package support, CI, build and runtime on approved Node 22 LTS", () => {
    const dockerfile = read("Dockerfile");
    const packageJson = JSON.parse(read("package.json"));
    expect(packageJson.engines.node).toBe("22.x");
    expect(read(".github/actions/setup-gate/action.yml")).toMatch(/node-version:\s*22\s/);
    const from = [...dockerfile.matchAll(/^FROM\s+(\S+)\s+AS\s+(\S+)/gm)];
    expect(from.find((match) => match[2] === "base")?.[1]).toMatch(/^node:22-bookworm-slim@sha256:/);
    expect(from.find((match) => match[2] === "runtime")?.[1]).toBe("base");
  });
  it("requires immutable digests for release/frontend/infrastructure/sandbox defaults and CI pulls", () => {
    const dockerfile = read("Dockerfile");
    const frontend = /^# syntax=(\S+)/m.exec(dockerfile)![1]!;
    const base = /^FROM\s+(\S+)\s+AS base/m.exec(dockerfile)![1]!;
    const sandbox = /FLOWLINE_CODE_IMAGE \?\? "([^"]+)"/.exec(read("src/server/code-sandbox.ts"))![1]!;
    const compose = [...read("deploy/beta/docker-compose.beta.yml").matchAll(/^\s+image:\s+(\S+)/gm)].map((m) => m[1]!).filter((value) => !value.startsWith("${FLOWLINE_IMAGE"));
    const setup = read(".github/actions/setup-gate/action.yml");
    const ciImages = [...setup.matchAll(/^\s+(?:run: docker pull )?((?:node|postgres):\S+)/gm)].map((m) => m[1]!);
    expect(compose).toHaveLength(3); expect(ciImages).toHaveLength(2);
    for (const value of [frontend, base, sandbox, ...compose, ...ciImages]) expect(value).toMatch(pinned);
    expect(setup).not.toMatch(/docker pull node:[^\s@]+\s/);
    expect(setup).toContain(sandbox);
  });
});
