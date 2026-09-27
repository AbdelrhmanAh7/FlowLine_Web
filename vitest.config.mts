import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // One DB, run files serially to keep laptop load and DB contention low.
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 60000,
          globalSetup: ["tests/integration/global-setup.ts"],
        },
      },
    ],
  },
});
