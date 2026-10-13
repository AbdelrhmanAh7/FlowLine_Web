import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFake, type Fake } from "./helpers";

// The fake provider server's mizano handler (#222): GET /api/health behind the server's generic Bearer auth.
let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

const get = (path: string, token?: string) =>
  fetch(`${fake.url}/mizano${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("fake mizano GET /api/health", () => {
  it.each(["test-token", "second-account-token"])("returns 200 { status: 'ok', version: 'fake' } on every call with %s", async (token) => {
    for (let i = 0; i < 12; i++) {
      const res = await get("/api/health", token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok", version: "fake" });
    }
  });

  it("answers a missing or unknown token with the generic 401 { message: 'Unauthorized' }", async () => {
    for (const path of ["/api/health", "/api/me"]) {
      for (const token of [undefined, "not-a-real-token"]) {
        const res = await get(path, token);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ message: "Unauthorized" });
      }
    }
  });

  it("returns 404 { message: 'Not found' } for any other path or method", async () => {
    for (const res of [
      await get("/api/health/other", "test-token"),
      await get("/api/me", "test-token"),
      await fetch(`${fake.url}/mizano/api/health`, { method: "POST", headers: { authorization: "Bearer test-token" } }),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ message: "Not found" });
    }
  });
});
