// Issue #222: Add a mizano handler for GET /api/health in the fake provider server
// This test verifies the mizano provider's health endpoint in the fake server
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-222 AC1: the fake provider server returns 200 with { status: 'ok', version: 'fake' } for GET /api/health",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    // Test GET /api/health endpoint
    const healthResponse = await app.fetch("/api/health", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(healthResponse.status).toBe(200);
    const healthData = await healthResponse.json();
    expect(healthData).toEqual({ status: "ok", version: "fake" });
  },
);

test(
  "@issue-222 AC2: the fake provider server returns 404 { message: 'Not found' } for any other path",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    // Test that any other path returns 404
    const notFoundResponse = await app.fetch("/api/health/other", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(notFoundResponse.status).toBe(404);
    const notFoundData = await notFoundResponse.json();
    expect(notFoundData).toEqual({ message: "Not found" });
  },
);
