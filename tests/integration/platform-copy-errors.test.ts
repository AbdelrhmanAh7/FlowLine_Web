import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * #181 (part 3/3 of #119): every error the admin copy endpoints can return, followed from the real route handler to the
 * browser client the copy editor uses (`api()` in src/lib/api.ts). Each case hands the route's exact Response to `api()`
 * and checks the ApiError the editor receives carries the server's status, code and message, and that nothing in the
 * body echoes submitted text or leaks a stack. The happy path and the non-admin 404 live in platform-copy.test.ts.
 */
const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
const fault = vi.hoisted(() => ({ read: null as Error | null }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => { throw new Error("cookies() is not used here"); },
}));
// Fault injection for the INTERNAL case only: the real reader runs unless a test sets `fault.read`.
vi.mock("@/server/platform-copy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/platform-copy")>();
  return { ...actual, getCopyEditorState: async () => { if (fault.read) throw fault.read; return actual.getCopyEditorState(); } };
});

import { GET, PATCH, POST } from "@/app/api/platform/copy/route";
import { POST as stepUpPOST } from "@/app/api/platform/step-up/route";
import { db, schema } from "@/db";
import { ApiError, api } from "@/lib/api";
import { checkRate } from "@/server/rate-limit";
import { closeDb } from "./helpers";
import { code, jsonOf, makeAdmin, makeVerifiedUser, platformReq, sessionFor, type TestSession } from "./platform-helpers";

type Handler = (request: Request, context: { params: Promise<Record<string, never>> }) => Promise<Response>;
type Flow = { server: Awaited<ReturnType<typeof jsonOf>>; client: unknown };
const MARKER = "army181-echo-marker";
const PATH = "/api/platform/copy";

function as(session: TestSession | null) {
  sessionHolder.headers = new Headers(session ? { cookie: session.cookie } : {});
}

/** Runs the real route, then gives its exact Response to the browser client, as the copy editor's fetch would. */
async function flow(handler: unknown, request: Request): Promise<Flow> {
  const res = await (handler as Handler)(request, { params: Promise.resolve({}) });
  const server = await jsonOf(res.clone());
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(res);
  let client: unknown = null;
  try {
    await api(PATH);
  } catch (e) {
    client = e;
  } finally {
    fetchMock.mockRestore();
  }
  return { server, client };
}

function expectError({ server, client }: Flow, status: number, errorCode: string) {
  expect(server.status).toBe(status);
  expect(server.body?.error?.code).toBe(errorCode);
  expect(server.headers.get("x-request-id")).toBeTruthy();
  expect(server.text).not.toMatch(/\n\s+at |node_modules|\.tsx?:\d+/);
  expect(server.text).not.toContain(MARKER);
  expect(client).toBeInstanceOf(ApiError);
  const e = client as ApiError;
  expect({ status: e.status, code: e.code, message: e.message, isNetwork: e.isNetwork }).toEqual({ status, code: errorCode, message: server.body.error.message, isNetwork: false });
}

/** A strict platform mutation whose raw body and content type the test controls (platformReq always sends JSON). */
function rawReq(session: TestSession, method: string, body: string, contentType = "application/json") {
  const base = platformReq(PATH, session, { method });
  const headers = new Headers(base.headers);
  headers.set("content-type", contentType);
  return new Request(base.url, { method, headers, body });
}

const edit = (value: string | null, extra: object = {}) => ({ action: "edit", edits: [{ locale: "en", key: "meta.title", value }], expectedRevision: 0, ...extra });

async function clearCopy() {
  await db.delete(schema.platformSetting).where(eq(schema.platformSetting.key, "site.copy.draft"));
  await db.delete(schema.platformSetting).where(eq(schema.platformSetting.key, "site.copy.published"));
}

let admin: Awaited<ReturnType<typeof makeAdmin>>;
beforeAll(async () => {
  await clearCopy();
  admin = await makeAdmin("copy-errors-admin");
});
afterAll(async () => {
  await clearCopy();
  await closeDb();
});

describe("admin copy error flow, server to client (#181)", () => {
  it("refuses a non-admin with NOT_FOUND on read, edit and publish, before the body is read", async () => {
    const user = await sessionFor(await makeVerifiedUser("copy-errors-user"));
    as(user);
    expectError(await flow(GET, platformReq(PATH, user)), 404, "NOT_FOUND");
    expectError(await flow(PATCH, platformReq(PATH, user, { method: "PATCH", body: edit(MARKER) })), 404, "NOT_FOUND");
    expectError(await flow(POST, platformReq(PATH, user, { method: "POST", body: { action: "publish", expectedDraftRevision: 0, expectedPublishedRevision: 0 } })), 404, "NOT_FOUND");
    expectError(await flow(PATCH, rawReq(user, "PATCH", `{"broken": ${MARKER}`)), 404, "NOT_FOUND");
  });

  it("refuses an admin write without the exact origin, the CSRF token or JSON, then asks for step-up", async () => {
    as(admin.session);
    const s = admin.session;
    expectError(await flow(PATCH, platformReq(PATH, s, { method: "PATCH", body: edit(MARKER), origin: "https://army-181.invalid" })), 403, "CROSS_SITE_REQUEST");
    expectError(await flow(PATCH, platformReq(PATH, s, { method: "PATCH", body: edit(MARKER), origin: null })), 403, "CROSS_SITE_REQUEST");
    expectError(await flow(PATCH, platformReq(PATH, s, { method: "PATCH", body: edit(MARKER), noCsrf: true })), 403, "CSRF_TOKEN_INVALID");
    expectError(await flow(PATCH, rawReq(s, "PATCH", JSON.stringify(edit(MARKER)), "text/plain")), 415, "UNSUPPORTED_MEDIA_TYPE");
    expectError(await flow(PATCH, platformReq(PATH, s, { method: "PATCH", body: edit(MARKER) })), 403, "STEP_UP_REQUIRED");
    expectError(await flow(POST, platformReq(PATH, s, { method: "POST", body: { action: "publish", expectedDraftRevision: 0, expectedPublishedRevision: 0 } })), 403, "STEP_UP_REQUIRED");
  });

  it("after step-up, maps body, validation, copy-rule, conflict and rate-limit refusals without changing the draft", async () => {
    as(admin.session);
    const s = admin.session;
    expect((await jsonOf(await (stepUpPOST as Handler)(platformReq("/api/platform/step-up", s, { method: "POST", body: { code: code(admin.secret) } }), { params: Promise.resolve({}) }))).status).toBe(200);
    const patch = (body: unknown) => flow(PATCH, platformReq(PATH, s, { method: "PATCH", body }));
    const read = async () => (await jsonOf(await (GET as Handler)(platformReq(PATH, s), { params: Promise.resolve({}) }))).body;
    const before = await read();

    expectError(await patch(edit(`${MARKER} ${"x".repeat(17 * 1024)}`)), 413, "BODY_TOO_LARGE");
    expectError(await flow(PATCH, rawReq(s, "PATCH", `{"action":"edit",${MARKER}`)), 400, "BAD_JSON");
    const tooLong = await patch(edit(`${MARKER}${"x".repeat(1200)}`));
    expectError(tooLong, 400, "VALIDATION");
    expect(tooLong.server.body.error.details).toEqual([{ path: ["edits", "0", "value"] }]);
    expectError(await patch({ action: "edit", edits: [], expectedRevision: 0 }), 400, "VALIDATION");
    expectError(await patch({ ...edit(MARKER), edits: [{ locale: "en", key: "army.unknown.key", value: MARKER }] }), 400, "COPY_KEY_INVALID");
    expectError(await patch(edit(`<b>${MARKER}</b>`)), 400, "COPY_VALUE_INVALID");
    expectError(await patch({ ...edit(MARKER), edits: [{ locale: "en", key: "meta.title", value: MARKER }, { locale: "en", key: "meta.title", value: "Again" }] }), 400, "COPY_DUPLICATE_EDIT");
    expectError(await patch(edit("Army title", { expectedRevision: 99 })), 409, "REVISION_CONFLICT");
    expectError(await flow(POST, platformReq(PATH, s, { method: "POST", body: { action: "publish", expectedDraftRevision: 99, expectedPublishedRevision: 0 } })), 409, "REVISION_CONFLICT");

    // None of the refused writes touched the draft or the published copy.
    const after = await read();
    expect({ draft: after.draft, published: after.published }).toEqual({ draft: before.draft, published: before.published });
    expect(JSON.stringify(after)).not.toContain(MARKER);

    // Exhaust this admin's platform-write budget (20 a minute); the next write is refused, not queued or dropped silently.
    for (let i = 0; i < 25 && (await checkRate(`platform-write:${admin.user.id}`, 20, 60)); i++);
    expectError(await patch(edit("Army title")), 429, "RATE_LIMITED");
    const afterLimit = await read();
    expect({ draft: afterLimit.draft, published: afterLimit.published }).toEqual({ draft: before.draft, published: before.published });
  });

  it("turns an unexpected server failure into INTERNAL with a request id and without the cause", async () => {
    as(admin.session);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fault.read = new Error(`relation exploded password=${MARKER} at /srv/app/db.ts:12`);
    try {
      const res = await flow(GET, platformReq(PATH, admin.session));
      expectError(res, 500, "INTERNAL");
      expect(res.server.body.error.requestId).toBe(res.server.headers.get("x-request-id"));
      expect(res.server.body.error.message).toBe("Something went wrong on our side");
    } finally {
      fault.read = null;
      log.mockRestore();
    }
  });

  it("gives the editor a network error when the server is unreachable and a bounded error for a non-JSON gateway page", async () => {
    const offline = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError(`fetch failed ${MARKER}`));
    const unreachable = await api(PATH).catch((e: unknown) => e);
    offline.mockRestore();
    expect(unreachable).toBeInstanceOf(ApiError);
    expect({ status: (unreachable as ApiError).status, code: (unreachable as ApiError).code, isNetwork: (unreachable as ApiError).isNetwork }).toEqual({ status: 0, code: "NETWORK", isNetwork: true });
    expect((unreachable as ApiError).message).not.toContain(MARKER);

    const gateway = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(`<html><body>502 ${MARKER}</body></html>`, { status: 502, headers: { "content-type": "text/html" } }));
    const proxied = await api(PATH).catch((e: unknown) => e);
    gateway.mockRestore();
    expect(proxied).toBeInstanceOf(ApiError);
    expect({ status: (proxied as ApiError).status, code: (proxied as ApiError).code, message: (proxied as ApiError).message }).toEqual({ status: 502, code: "HTTP_502", message: "Request failed (502)" });
    expect((proxied as ApiError).message).not.toContain(MARKER);
  });
});
