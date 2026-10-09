// e2e-army runner configuration for FlowLine_Web (issue #85)
import { defineConfig } from "e2e";

export default defineConfig({
  // Base URL from environment, defaults to localhost:3100 (test stack)
  baseURL: process.env.E2E_ARMY_URL || "http://localhost:3100",

  // Headless mode
  headless: true,

  // Replay cache enabled (natural-language steps are cached)
  replayCache: true,

  // Telemetry disabled
  telemetry: false,

  // Model configuration for agent steps
  // Uses the hub's free Gemini adapter when E2E_ARMY_CLI=agy
  // Uses Claude Haiku when E2E_ARMY_CLI=claude
  // Agent steps are skipped when E2E_ARMY_NOAGENT=1
  model: process.env.E2E_ARMY_CLI === "claude" ? "claude" : "agy",

  // Test files to run
  testFiles: ["e2e-army/*.e2e.ts", "e2e-army/features/_setup.e2e.ts", "e2e-army/features/smoke.e2e.ts"],

  // Shard configuration (from e2e-army/FlowLine_Web.json)
  shards: [
    { id: "smoke", name: "Quick smoke run", testPattern: "e2e-army/*.e2e.ts" },
    { id: "auth", name: "Authentication flows", testPattern: "e2e-army/*.e2e.ts" },
    { id: "workspaces", name: "Workspace management", testPattern: "e2e-army/*.e2e.ts" },
    { id: "flows", name: "Flows and builder", testPattern: "e2e-army/*.e2e.ts" },
    { id: "runs", name: "Run execution and history", testPattern: "e2e-army/*.e2e.ts" },
    { id: "api", name: "API endpoints", testPattern: "e2e-army/*.e2e.ts" },
    { id: "jobs", name: "Job execution", testPattern: "e2e-army/*.e2e.ts" },
    { id: "ai", name: "AI providers and agents", testPattern: "e2e-army/*.e2e.ts" },
    { id: "billing", name: "Billing and SSO", testPattern: "e2e-army/*.e2e.ts" },
    { id: "design", name: "Design system and i18n", testPattern: "e2e-army/*.e2e.ts" }
  ],

  // Timeout per shard (≤ 5 minutes)
  timeout: 5 * 60 * 1000,

  // Reporter
  reporter: "list",

  // Test hooks
  beforeAll: async () => {
    // Setup: ensure test stack is running
    if (!process.env.E2E_ARMY_URL) {
      console.log("Starting test stack...");
      // This would be handled by scripts/dev-test.mjs
    }
  },

  afterAll: async () => {
    // Cleanup: stop test stack
    if (!process.env.E2E_ARMY_URL) {
      console.log("Stopping test stack...");
      // This would be handled by scripts/dev-test.mjs
    }
  }
});
