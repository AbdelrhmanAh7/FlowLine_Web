import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

const nightlyFiles = [
  "tests/integration/p2-code-sandbox.test.ts",
  "tests/integration/company-builder-cli.test.ts",
  "tests/unit/drizzle-tooling-prune.test.ts",
];

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], exclude: nightlyFiles, environment: "node" } },
      // Provider adapter contract tests: adapters vs. the local fake provider server (no DB, no network).
      { resolve: { alias }, test: { name: "contract", include: ["tests/contract/**/*.test.ts"], environment: "node", testTimeout: 20000, fileParallelism: false } },
      // Live/sandbox suite: real local Ollama, real Postgres, SaaS sandboxes (BLOCKED without credentials).
      // Kept separate from the deterministic suites; results land in artifacts/phase-2/live-results.json.
      { resolve: { alias }, test: { name: "live", include: ["tests/live/**/*.test.ts"], environment: "node", testTimeout: 200000, fileParallelism: false } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          exclude: nightlyFiles,
          environment: "node",
          // One DB, run files serially to keep laptop load and DB contention low.
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 60000,
          globalSetup: ["tests/integration/global-setup.ts"],
        },
      },
      // Nightly tier (.github/workflows/nightly.yml): slow or infra-sensitive suites moved out of the PR gate.
      // Needs .env.test + Postgres + the code-sandbox image, like the integration project.
      {
        resolve: { alias },
        test: {
          name: "nightly",
          include: nightlyFiles,
          environment: "node",
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 60000,
          globalSetup: ["tests/integration/global-setup.ts"],
        },
      },
    ],
  },
});
