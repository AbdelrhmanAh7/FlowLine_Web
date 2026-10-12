// Issue #222: Add a mizano handler for GET /api/health in the fake provider server
// This test verifies the mizano provider's health endpoint in the fake server
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-222 AC1: the fake provider server returns 200 with { status: 'ok', version: 'fake' } for GET /api/health with valid token",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app, _agent, _screen }) => {
    // Test GET /api/health endpoint with valid token
    const healthResponse = await app.fetch("/mizano/api/health", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-token",
      },
    });

    expect(healthResponse.status).toBe(200);
    const healthData = await healthResponse.json();
    expect(healthData).toEqual({ status: "ok", version: "fake" });
  },
);

test(
  "@issue-222 AC2: the fake provider server returns 401 { message: 'Unauthorized' } for GET /api/health without valid token",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app, _agent, _screen }) => {
    // Test that GET /api/health rejects requests without valid token
    const unauthorizedResponse = await app.fetch("/mizano/api/health", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(unauthorizedResponse.status).toBe(401);
    const unauthorizedData = await unauthorizedResponse.json();
    expect(unauthorizedData).toEqual({ message: "Unauthorized" });
  },
);

test(
  "@issue-222 AC3: the fake provider server returns 429 { error: 'rate limited' } for GET /api/health when rate limited",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app, _agent, _screen }) => {
    // Test rate limiting: make 11 requests in quick succession (10 allowed, 1 rate limited)
    const validToken = "test-token";
    for (let i = 0; i < 11; i++) {
      const response = await app.fetch("/mizano/api/health", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${validToken}`,
        },
      });
      // First 10 requests should succeed, 11th should be rate limited
      if (i < 10) {
        expect(response.status).toBe(200);
        await response.json();
      } else {
        expect(response.status).toBe(429);
        const rateLimitedData = await response.json();
        expect(rateLimitedData).toEqual({ error: "rate limited" });
      }
    }
  },
);

test(
  "@issue-222 AC4: the fake provider server returns 404 { message: 'Not found' } for any other path",
  { tags: ["feat:fl-provider-server"], session: "fl-user" },
  async ({ app, _agent, _screen }) => {
    // Test that any other path returns 404
    const notFoundResponse = await app.fetch("/mizano/api/health/other", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer test-token",
      },
    });

    expect(notFoundResponse.status).toBe(404);
    const notFoundData = await notFoundResponse.json();
    expect(notFoundData).toEqual({ message: "Not found" });
  },
);
