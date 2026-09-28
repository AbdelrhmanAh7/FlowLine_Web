import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { POST as betaCheck } from "@/app/api/beta/check/route";
import { GET as authConfig } from "@/app/api/auth-config/route";
import { GET as outbox } from "@/app/api/test/outbox/route";
import { POST as testBeta } from "@/app/api/test/beta/route";
import { createBetaCode } from "@/server/beta";
import { createInvite } from "@/server/members";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

/**
 * P4 sign-up UX for the private beta: the advisory pre-check endpoint (never consumes a code, rate limited) and the
 * test-only helpers the E2E suite uses (outbox reader, per-context beta toggle) — which must not exist outside test.
 */
process.env.FLOWLINE_EMAIL_PROVIDER = "outbox";
const prevMode = process.env.FLOWLINE_BETA_MODE;
const prevEnv = process.env.FLOWLINE_ENV;
afterEach(() => {
  process.env.FLOWLINE_BETA_MODE = prevMode;
  process.env.FLOWLINE_ENV = prevEnv;
});
afterAll(closeDb);

const BASE = "http://localhost:3100";
const email = (p: string) => `${p}-${randomUUID().slice(0, 8)}@flowline-beta.test`;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function check(body: { email: string; code?: string | null }, headers: Record<string, string> = {}) {
  const res = await betaCheck(new Request(`${BASE}/api/beta/check`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip(), ...headers }, body: JSON.stringify(body) }), undefined as never);
  return { status: res.status, body: (await res.json()) as { allowed?: boolean; mode?: string; error?: { code: string } } };
}
async function usedCount(id: string) {
  const [row] = await db.select().from(schema.betaAccessCode).where(eq(schema.betaAccessCode.id, id));
  return row!.usedCount;
}

describe("sign-up pre-check (POST /api/beta/check)", () => {
  it("answers allowed in open mode", async () => {
    process.env.FLOWLINE_BETA_MODE = "open";
    expect(await check({ email: email("open") })).toEqual({ status: 200, body: { allowed: true, mode: "open" } });
  });

  it("refuses an uninvited email and admits an invited one (case-insensitive) in invite_only mode", async () => {
    process.env.FLOWLINE_BETA_MODE = "invite_only";
    expect((await check({ email: email("stranger") })).body).toEqual({ allowed: false, mode: "invite_only" });
    const owner = await makeUser("precheck-owner");
    const ws = await createWorkspace(owner, unique("Precheck"));
    const invited = email("invited");
    await createInvite(owner, ws.id, { email: invited, role: "viewer" });
    expect((await check({ email: invited.toUpperCase() })).body).toEqual({ allowed: true, mode: "invite_only" });
  });

  it("looks at a beta code without consuming it; the sign-up is what takes the use", async () => {
    process.env.FLOWLINE_BETA_MODE = "invite_only";
    const { code, id } = await createBetaCode({ label: "precheck", maxUses: 1 });
    const e = email("coded");
    for (let i = 0; i < 3; i++) expect((await check({ email: e, code })).body.allowed).toBe(true);
    expect(await usedCount(id)).toBe(0);
    expect((await check({ email: e, code: "FL-WRONG" })).body.allowed).toBe(false);

    await auth.api.signUpEmail({ body: { email: e, password: "Beta-Test-Pass-1", name: "Coded", betaCode: code } as never });
    expect(await usedCount(id)).toBe(1);
    expect((await check({ email: email("after"), code })).body.allowed).toBe(false);
  });

  it("is rate limited per email (shared PostgreSQL counter) with a 429", async () => {
    process.env.FLOWLINE_BETA_MODE = "invite_only";
    const e = email("limited");
    for (let i = 0; i < 10; i++) expect((await check({ email: e })).status).toBe(200);
    const limited = await check({ email: e });
    expect(limited.status).toBe(429);
    expect(limited.body.error?.code).toBe("BETA_CHECK_RATE_LIMIT");
  });

  it("is rate limited per IP across different emails", async () => {
    process.env.FLOWLINE_BETA_MODE = "invite_only";
    const fixed = ip();
    for (let i = 0; i < 30; i++) expect((await check({ email: email(`ip${i}`) }, { "x-real-ip": fixed })).status).toBe(200);
    expect((await check({ email: email("ip-over") }, { "x-real-ip": fixed })).status).toBe(429);
  });

  it("on the test stack only, the shared loopback client is not IP-limited (per-email limits still apply)", async () => {
    process.env.FLOWLINE_BETA_MODE = "invite_only";
    process.env.FLOWLINE_ENV = "test";
    for (let i = 0; i < 32; i++) expect((await check({ email: email(`lo${i}`) }, { "x-real-ip": "127.0.0.1" })).status).toBe(200);
    process.env.FLOWLINE_ENV = "development";
    let limited = false;
    for (let i = 0; i < 32 && !limited; i++) limited = (await check({ email: email(`lo-dev${i}`) }, { "x-real-ip": "::1" })).status === 429;
    expect(limited).toBe(true);
  });

  it("rejects a malformed request", async () => {
    expect((await check({ email: "not-an-email" })).status).toBe(400);
  });
});

describe("beta mode per request (test-only cookie)", () => {
  const cookie = { cookie: "fl_test_beta_mode=invite_only", origin: BASE };

  it("the test cookie switches invite_only on for that request only, and auth-config reports it", async () => {
    process.env.FLOWLINE_BETA_MODE = "open";
    process.env.FLOWLINE_ENV = "test";
    expect((await check({ email: email("cookie") }, cookie)).body).toEqual({ allowed: false, mode: "invite_only" });
    expect(await (await authConfig(new Request(`${BASE}/api/auth-config`, { headers: cookie }))).json()).toMatchObject({ betaMode: "invite_only" });
    expect(await (await authConfig(new Request(`${BASE}/api/auth-config`))).json()).toMatchObject({ betaMode: "open" });
  });

  it("the cookie is ignored outside FLOWLINE_ENV=test", async () => {
    process.env.FLOWLINE_BETA_MODE = "open";
    process.env.FLOWLINE_ENV = "development";
    expect((await check({ email: email("prod-cookie") }, cookie)).body).toEqual({ allowed: true, mode: "open" });
    expect(await (await authConfig(new Request(`${BASE}/api/auth-config`, { headers: cookie }))).json()).toMatchObject({ betaMode: "open" });
  });
});

describe("test-only routes", () => {
  const outboxReq = (e: string) => new Request(`${BASE}/api/test/outbox?email=${encodeURIComponent(e)}`);
  const betaReq = (body: unknown) => new Request(`${BASE}/api/test/beta`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("are 404 outside FLOWLINE_ENV=test", async () => {
    for (const env of ["development", "production", ""]) {
      process.env.FLOWLINE_ENV = env;
      expect((await outbox(outboxReq("a@b.test"), undefined as never)).status).toBe(404);
      const toggle = await testBeta(betaReq({ mode: "invite_only", createCode: true }), undefined as never);
      expect(toggle.status).toBe(404);
      expect(toggle.headers.get("set-cookie")).toBeNull();
    }
  });

  it("the outbox returns the newest verification email and its link, carrying a safe callbackURL only", async () => {
    process.env.FLOWLINE_ENV = "test";
    process.env.FLOWLINE_BETA_MODE = "open";
    const e = email("outbox");
    const res = await auth.api.signUpEmail({ body: { email: e, password: "Outbox-Pass-123", name: "Outbox", callbackURL: "/sign-in?next=invite%3Aabc" } });
    expect(res.token).toBeNull();
    const body = (await (await outbox(outboxReq(e.toUpperCase()), undefined as never)).json()) as { messages: { purpose: string; link: string }[] };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]!.purpose).toBe("verify");
    const link = new URL(body.messages[0]!.link);
    expect(link.pathname).toBe("/verify-email");
    expect(link.searchParams.get("token")).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(link.searchParams.get("callbackURL")).toBe("/sign-in?next=invite%3Aabc");

    const evil = email("evil");
    await auth.api.signUpEmail({ body: { email: evil, password: "Outbox-Pass-123", name: "Evil", callbackURL: "//evil.example/steal" } }).catch(() => null);
    const mails = (await (await outbox(outboxReq(evil), undefined as never)).json()) as { messages: { link: string }[] };
    for (const m of mails.messages) expect(new URL(m.link).searchParams.get("callbackURL")).toBeNull();

    expect(((await (await outbox(outboxReq(email("nobody")), undefined as never)).json()) as { messages: unknown[] }).messages).toEqual([]);
  });

  it("the beta toggle sets the per-context cookie and can mint a single-use code", async () => {
    process.env.FLOWLINE_ENV = "test";
    const res = await testBeta(betaReq({ mode: "invite_only", createCode: true }), undefined as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/fl_test_beta_mode=invite_only/);
    const { code } = (await res.json()) as { code: string };
    const [row] = await db.select().from(schema.betaAccessCode).where(eq(schema.betaAccessCode.label, "e2e")).orderBy(sql`${schema.betaAccessCode.createdAt} desc`).limit(1);
    expect(row!.maxUses).toBe(1);
    expect(code).toMatch(/^FL-/);
  });
});
