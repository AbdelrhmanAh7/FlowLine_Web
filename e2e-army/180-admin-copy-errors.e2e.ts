// Issue #180: Improve client-side error display for /admin/copy.
// Request-level test (plain fetch, no browser, no model). The hub's test stack has no platform admin (that needs a
// platform_admin row plus TOTP and MFA, and no test API creates one), so this covers what a signed-in non-admin can
// reach: the copy API's JSON error and the ordinary not-found page in both languages. The editor's own error display
// (translated save/publish messages, reloads, load error with Retry) is covered by tests/unit/admin/copy/.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
/** JSON request headers for the stack; the test stack's open-beta cookie comes first, then the given cookies. */
const headers = (base: string, ...cookies: string[]) => ({ "content-type": "application/json", origin: new URL(base).origin, cookie: ["fl_test_beta_mode=open", ...cookies].join("; ") });

/** A verified, signed-in account through the product's own endpoints (test stack outbox); returns its session cookies. */
async function signedIn(base: string, email: string) {
  const h = headers(base, "fl_locale=en");
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    // Poll (no fixed sleep) until the verification mail lands in the test outbox — the sign-up response can precede it.
    let token: string | null = null;
    await expect.poll(async () => {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      return token;
    }, { timeout: 15_000 }).not.toBeNull();
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
    if (!v.ok) throw new Error(`verify ${v.status}`);
  }
  const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

test(
  "@issue-180 AC: a signed-in non-admin gets a JSON NOT_FOUND error without a stack from /api/platform/copy, and the ordinary 404 page at /admin/copy in Arabic right-to-left by default and English left-to-right when chosen",
  { tags: ["feat:fl-platform-admin", "feat:fl-i18n-rtl", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    // Deterministic per stack: derived from the stack URL, never from the clock.
    const session = await signedIn(base, `army-180-${createHash("sha256").update(base).digest("hex").slice(0, 12)}@flowline-e2e.test`);

    // 404 is intentional (hides the panel): requirePlatformAdmin throws notFound() for non-admins before the body is
    // validated or a step-up is checked (src/server/platform-access.ts requirePlatformAdmin, src/server/platform-http.ts platformWrite);
    // route() serialises it as { error: { code: "NOT_FOUND", message } } (src/server/http.ts).
    const res = await fetch(`${base}/api/platform/copy`, {
      method: "PATCH",
      headers: headers(base, "fl_locale=en", session),
      body: JSON.stringify({ action: "edit", edits: [], expectedRevision: 0 }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = JSON.parse(await res.text());
    expect(json.error.code).toBe("NOT_FOUND");
    // Checked on the parsed value: JSON text escapes newlines, so a stack-frame pattern could never match the raw body.
    expect(json.error).not.toHaveProperty("stack");
    expect(typeof json.error.message).toBe("string");
    expect(json.error.message).not.toMatch(/\n\s+at \S+/);

    // The page is server-rendered, so a plain fetch sees the status and the root layout's <html lang dir>
    // (src/app/layout.tsx), which follow the fl_locale cookie; non-admins never get the editor (platform-access.ts).
    const open = async (...cookies: string[]) => {
      const page = await fetch(`${base}/admin/copy`, { headers: headers(base, ...cookies, session) });
      const html = await page.text();
      return { status: page.status, lang: /<html[^>]*\slang="([\w-]+)"/.exec(html)?.[1], dir: /<html[^>]*\sdir="(\w+)"/.exec(html)?.[1] };
    };
    expect(await open()).toEqual({ status: 404, lang: "ar", dir: "rtl" });
    expect(await open("fl_locale=en")).toEqual({ status: 404, lang: "en", dir: "ltr" });
  },
);
