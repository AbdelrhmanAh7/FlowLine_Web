import { describe, expect, it, vi } from "vitest";
import { HttpError, notFound, forbidden, unauthorized } from "@/server/http";

vi.mock("@/db", () => ({ db: {}, schema: {} }));

const accessMock = vi.hoisted(() => ({
  mode: "admin" as "admin" | "unauthenticated" | "forbidden" | "not_found" | "db_error",
  customError: null as Error | null,
}));

vi.mock("@/server/platform-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/platform-access")>();
  return {
    ...actual,
    requirePlatformAdmin: async () => {
      if (accessMock.customError) throw accessMock.customError;
      if (accessMock.mode === "unauthenticated") {
        throw new HttpError(401, "unauthenticated", "Authentication required");
      }
      if (accessMock.mode === "forbidden") {
        throw new HttpError(403, "forbidden", "Admin access required");
      }
      if (accessMock.mode === "not_found") {
        throw new HttpError(404, "not_found", "Admin copy resource not found");
      }
      return {
        user: { id: "admin-1", email: "admin@flowline.test", name: "Admin" },
        session: { id: "sess-1", tokenHash: "hash-1", createdAt: new Date() },
      };
    },
  };
});

vi.mock("@/server/platform-copy", () => ({
  getCopyEditorState: async () => {
    if (accessMock.mode === "db_error") {
      const dbErr = new Error("Connection terminated unexpectedly\nFailed query: select * from \"platform_copy\" where \"id\" = $1");
      dbErr.name = "DrizzleQueryError";
      throw dbErr;
    }
    return { draft: {}, published: {}, draftRevision: 1, publishedRevision: 1 };
  },
  editDraftCopyBatch: vi.fn(),
  publishCopy: vi.fn(),
}));

import { GET } from "@/app/api/platform/copy/route";

describe("admin copy error handling unit tests (#181)", () => {
  const createRequest = (url = "http://localhost:3000/api/platform/copy") =>
    new Request(url, {
      method: "GET",
      headers: { "x-request-id": "unit-test-req-181" },
    });

  it("returns 401 with code unauthenticated when no session is present", async () => {
    accessMock.mode = "unauthenticated";
    accessMock.customError = null;

    const res = await GET(createRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error.code.toLowerCase()).toBe("unauthenticated");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns 403 with code forbidden for a non-admin caller", async () => {
    accessMock.mode = "forbidden";
    accessMock.customError = null;

    const res = await GET(createRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error.code.toLowerCase()).toBe("forbidden");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns 404 with code not_found for an unknown source id or missing resource", async () => {
    accessMock.mode = "not_found";
    accessMock.customError = null;

    const res = await GET(createRequest("http://localhost:3000/api/platform/copy?sourceId=unknown-id"), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error.code.toLowerCase()).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns 500 with a generic code when the underlying DB call throws", async () => {
    accessMock.mode = "db_error";
    accessMock.customError = null;

    const res = await GET(createRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Something went wrong on our side");
  });

  it("500 response body contains no stack trace, SQL fragment, or driver message", async () => {
    accessMock.mode = "db_error";
    accessMock.customError = null;

    const res = await GET(createRequest(), { params: Promise.resolve({}) });
    const rawText = await res.text();

    // Must not leak stack traces
    expect(rawText).not.toMatch(/\n\s+at /);
    expect(rawText).not.toMatch(/\.tsx?:\d+/);
    expect(rawText).not.toMatch(/node_modules/);

    // Must not leak SQL statements or queries
    expect(rawText).not.toMatch(/select\s+\*|insert\s+into|update\s+|delete\s+from/i);
    expect(rawText).not.toMatch(/Failed query/i);

    // Must not leak DB driver / connection messages
    expect(rawText).not.toMatch(/Connection terminated/i);
    expect(rawText).not.toMatch(/DrizzleQueryError/i);
    expect(rawText).not.toMatch(/platform_copy/i);
  });

  it("verifies standard FlowLine platform-admin refusal codes (UNAUTHORIZED, FORBIDDEN, NOT_FOUND)", async () => {
    // 401 standard
    accessMock.customError = unauthorized();
    let res = await GET(createRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    let body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");

    // 403 standard
    accessMock.customError = forbidden();
    res = await GET(createRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");

    // 404 standard (CREDENTIALS_DESIGN.md item 10)
    accessMock.customError = notFound();
    res = await GET(createRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
