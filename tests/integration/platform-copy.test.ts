import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => { throw new Error("cookies() is not used here"); },
}));

import { GET, PATCH, POST } from "@/app/api/platform/copy/route";
import { POST as stepUpPOST } from "@/app/api/platform/step-up/route";
import { db, schema } from "@/db";
import { closeDb } from "./helpers";
import { getPublishedCopy } from "@/server/platform-copy";
import { code, jsonOf, makeAdmin, makeVerifiedUser, platformReq, sessionFor, type TestSession } from "./platform-helpers";

type Handler = (request: Request, context: { params: Promise<Record<string, never>> }) => Promise<Response>;
async function call(handler: unknown, request: Request) {
  return jsonOf(await (handler as Handler)(request, { params: Promise.resolve({}) }));
}
function as(session: TestSession | null) {
  sessionHolder.headers = new Headers(session ? { cookie: session.cookie } : {});
}

afterAll(async () => {
  await db.delete(schema.platformSetting).where(eq(schema.platformSetting.key, "site.copy.draft"));
  await db.delete(schema.platformSetting).where(eq(schema.platformSetting.key, "site.copy.published"));
  await closeDb();
});

describe("platform copy routes", () => {
  it("hides copy from non-admins and keeps atomic drafts private until a revision-checked publish", async () => {
    const owner = await makeVerifiedUser("copy-workspace-owner");
    const ownerSession = await sessionFor(owner);
    as(ownerSession);
    expect((await call(GET, platformReq("/api/platform/copy", ownerSession))).status).toBe(404);
    const admin = await makeAdmin("copy-admin");
    as(admin.session);
    const before = await call(GET, platformReq("/api/platform/copy", admin.session));
    expect(before.status).toBe(200);
    const publicCopy = await getPublishedCopy();
    for (const locale of ["ar", "en"] as const) expect(Object.getPrototypeOf(publicCopy[locale])).toBe(Object.prototype);
    const locked = await call(PATCH, platformReq("/api/platform/copy", admin.session, { method: "PATCH", body: { action: "edit", edits: [{ locale: "ar", key: "meta.title", value: "عنوان تجريبي" }], expectedRevision: 0 } }));
    expect(locked.body.error.code).toBe("STEP_UP_REQUIRED");
    expect((await call(stepUpPOST, platformReq("/api/platform/step-up", admin.session, { method: "POST", body: { code: code(admin.secret) } }))).status).toBe(200);
    const invalid = await call(PATCH, platformReq("/api/platform/copy", admin.session, { method: "PATCH", body: { action: "edit", edits: [{ locale: "ar", key: "meta.title", value: "عنوان تجريبي" }, { locale: "en", key: "meta.title", value: "<script>" }], expectedRevision: 0 } }));
    expect(invalid.status).toBe(400);
    const afterInvalid = await call(GET, platformReq("/api/platform/copy", admin.session));
    expect(afterInvalid.body.draft.revision).toBe(0);
    const saved = await call(PATCH, platformReq("/api/platform/copy", admin.session, { method: "PATCH", body: { action: "edit", edits: [{ locale: "ar", key: "meta.title", value: "عنوان تجريبي" }, { locale: "en", key: "meta.title", value: "Test title" }], expectedRevision: 0 } }));
    expect(saved.status).toBe(200);
    const draft = await call(GET, platformReq("/api/platform/copy", admin.session));
    expect(draft.body.draft.value.ar["meta.title"]).toBe("عنوان تجريبي");
    expect(draft.body.published.value.ar["meta.title"]).toBeUndefined();
    const stale = await call(POST, platformReq("/api/platform/copy", admin.session, { method: "POST", body: { action: "publish", expectedDraftRevision: 0, expectedPublishedRevision: 0 } }));
    expect(stale.status).toBe(409);
    const published = await call(POST, platformReq("/api/platform/copy", admin.session, { method: "POST", body: { action: "publish", expectedDraftRevision: 1, expectedPublishedRevision: 0 } }));
    expect(published.status).toBe(200);
    const afterPublish = await call(GET, platformReq("/api/platform/copy", admin.session));
    expect(afterPublish.body.published.value.en["meta.title"]).toBe("Test title");
    as(ownerSession);
    expect((await call(POST, platformReq("/api/platform/copy", ownerSession, { method: "POST", body: { action: "publish", expectedDraftRevision: 1, expectedPublishedRevision: 1 } }))).status).toBe(404);
  });
});
