import { afterAll, describe, expect, it, vi } from "vitest";

const sessionHolder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => sessionHolder.headers,
  cookies: async () => { throw new Error("cookies() is not used here"); },
}));

import { GET as copyGET, PATCH as copyPATCH } from "@/app/api/platform/copy/route";
import { GET as meGET } from "@/app/api/me/route";
import { closeDb } from "./helpers";
import { jsonOf, makeAdmin, makeVerifiedUser, platformReq, sessionFor, type TestSession } from "./platform-helpers";

type Handler = (request: Request, context: { params: Promise<Record<string, never>> }) => Promise<Response>;
async function call(handler: unknown, request: Request) {
  return jsonOf(await (handler as Handler)(request, { params: Promise.resolve({}) }));
}
function as(session: TestSession | null) {
  sessionHolder.headers = new Headers(session ? { cookie: session.cookie } : {});
}
function expectNoStore(headers: Headers) {
  expect(headers.get("cache-control")).toBe("no-store");
  expect(headers.get("referrer-policy")).toBe("no-referrer");
}

afterAll(closeDb);

// #200: route() error responses are never cached and never leak the URL as a referrer.
describe("route() error responses carry no-store + no-referrer", () => {
  it("platform copy: 404 for a non-admin, 403 for a mutation without the CSRF token", async () => {
    const member = await sessionFor(await makeVerifiedUser("hdr-member"));
    as(member);
    const refused = await call(copyGET, platformReq("/api/platform/copy", member));
    expect(refused.status).toBe(404);
    expectNoStore(refused.headers);

    const admin = await makeAdmin("hdr-admin");
    as(admin.session);
    const noCsrf = await call(copyPATCH, platformReq("/api/platform/copy", admin.session, { method: "PATCH", body: {}, noCsrf: true }));
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe("CSRF_TOKEN_INVALID");
    expectNoStore(noCsrf.headers);
  });

  it("platform copy: 404 without a session (what the e2e-army test relies on)", async () => {
    as(null);
    const res = await call(copyGET, new Request("http://localhost:3100/api/platform/copy"));
    expect(res.status).toBe(404);
    expectNoStore(res.headers);
  });

  it("a non-platform route: 401 without a session", async () => {
    as(null);
    const res = await call(meGET, new Request("http://localhost:3100/api/me"));
    expect(res.status).toBe(401);
    expectNoStore(res.headers);
  });

  it("the cross-site refusal raised by route() itself", async () => {
    as(null);
    const res = await call(meGET, new Request("http://localhost:3100/api/me", { method: "POST", headers: { cookie: "a=b", "sec-fetch-site": "cross-site" } }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CROSS_SITE_REQUEST");
    expectNoStore(res.headers);
  });
});
