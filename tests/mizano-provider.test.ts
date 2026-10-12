import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, Server } from "http";
import mizano from "@/integrations/providers/mizano";
import type { Credentials } from "@/integrations/types";
import { ProviderError } from "@/integrations/types";

describe("Mizano provider", () => {
  let server: Server;
  let baseUrl: string;
  let credentials: Credentials;

  beforeEach(() => {
    // Start a mock HTTP server
    server = createServer((req, res) => {
      // Mock the /api/health endpoint
      if (req.method === "GET" && req.url === "/api/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // Mock any other requests with 404
      res.writeHead(404);
      res.end();
    });

    server.listen(0, () => {
      const address = server.address() as any;
      baseUrl = `http://localhost:${address.port}`;
    });

    // Wait for server to be ready
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (server.listening) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("should verify credentials with valid API key", async () => {
    credentials = {
      type: "api_key",
      token: "mizano-test-key-12345",
      settings: {
        baseUrl: baseUrl,
      },
    };

    const identity = await mizano.identity({
      http: {
        request: async (req) => {
          const response = await makeRequest(req);
          return response;
        },
      },
      credentials,
      signal: AbortSignal.timeout(10000),
      log: () => {},
    });

    expect(identity.accountId).toBe("mizano");
    expect(identity.label).toContain("Mizano");
  });

  it("should reject invalid API key with 401 error", async () => {
    // Create a server that returns 401 for invalid key
    const authServer = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/health") {
        const authHeader = req.headers.authorization;
        if (authHeader !== "Bearer mizano-test-key-12345") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    authServer.listen(0, () => {
      const address = authServer.address() as any;
      const authBaseUrl = `http://localhost:${address.port}`;
    });

    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (authServer.listening) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    }).then(async () => {
      credentials = {
        type: "api_key",
        token: "wrong-key",
        settings: {
          baseUrl: `http://localhost:${(authServer.address() as any).port}`,
        },
      };

      await expect(
        mizano.identity({
          http: {
            request: async (req) => {
              const response = await makeRequest(req);
              return response;
            },
          },
          credentials,
          signal: AbortSignal.timeout(10000),
          log: () => {},
        })
      ).rejects.toThrow(/401|unauthorized|authentication failed/i);
    });
  });

  it("should handle unreachable server", async () => {
    // Create a server that closes immediately
    const unreachableServer = createServer();
    unreachableServer.listen(0, () => {
      const address = unreachableServer.address() as any;
      const unreachableBaseUrl = `http://localhost:${address.port}`;
      unreachableServer.close();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    credentials = {
      type: "api_key",
      token: "test-key",
      settings: {
        baseUrl: `http://localhost:${(unreachableServer.address() as any).port}`,
      },
    };

    await expect(
      mizano.identity({
        http: {
          request: async (req) => {
            const response = await makeRequest(req);
            return response;
          },
        },
        credentials,
        signal: AbortSignal.timeout(5000),
        log: () => {},
      })
    ).rejects.toThrow(/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i);
  });

  it("should reject requests to invalid endpoints", async () => {
    credentials = {
      type: "api_key",
      token: "test-key",
      settings: {
        baseUrl: baseUrl,
      },
    };

    // Mock a 404 response
    await expect(
      mizano.identity({
        http: {
          request: async (req) => {
            const response = await makeRequest(req);
            return response;
          },
        },
        credentials,
        signal: AbortSignal.timeout(10000),
        log: () => {},
      })
    ).rejects.toThrow();
  });
});

// Helper function to make HTTP requests
async function makeRequest(req: { method: string; path: string; headers?: Record<string, string>; baseUrl?: string }) {
  const url = new URL(req.path, req.baseUrl);
  const response = await fetch(url.toString(), {
    method: req.method,
    headers: req.headers,
  });

  const data = await response.text();
  return {
    status: response.status,
    headers: new Headers(response.headers),
    data: response.ok ? JSON.parse(data) : data,
  };
}
