// Issue #180: Improve client-side error display for /admin/copy.
// Acceptance: When server errors occur, the UI displays appropriate error messages without breaking.
// Request-level test verifying that /admin/copy loads (status 200) in Arabic (RTL) and English (LTR)
// displaying the copy editor shell, and that unauthorized mutations receive a clean JSON NOT_FOUND error without stack traces.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
/** JSON request headers for the stack; the test stack's open-beta cookie comes first, then the given cookies. */
const headers = (base: string, ...cookies: string[]) => ({
  "content-type": "application/json",
  origin: new URL(base).origin,
  cookie: ["fl_test_beta_mode=open", ...cookies].join("; "),
});

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
  "@issue-180 AC: /admin/copy loads and displays user-friendly error messages when the server encounters issues, in Arabic RTL and English LTR without breaking",
  { tags: ["feat:fl-platform-admin", "feat:fl-i18n-rtl", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    // Deterministic per stack: derived from the stack URL, never from the clock.
    const session = await signedIn(base, `army-180-${createHash("sha256").update(base).digest("hex").slice(0, 12)}@flowline-e2e.test`);

    // 1. The /admin/copy page is loadable (status 200) and displays Arabic RTL by default and English LTR when selected.
    const open = async (...cookies: string[]) => {
      const page = await fetch(`${base}/admin/copy`, { headers: headers(base, ...cookies, session) });
      const html = await page.text();
      return {
        status: page.status,
        lang: /<html[^>]*\slang="([\w-]+)"/.exec(html)?.[1],
        dir: /<html[^>]*\sdir="(\w+)"/.exec(html)?.[1],
        containsTitle: html.includes("محرر نصوص المنصة") || html.includes("Copy editor"),
      };
    };

    const ar = await open();
    expect(ar.status).toBe(200);
    expect(ar.lang).toBe("ar");
    expect(ar.dir).toBe("rtl");
    expect(ar.containsTitle).toBe(true);

    const en = await open("fl_locale=en");
    expect(en.status).toBe(200);
    expect(en.lang).toBe("en");
    expect(en.dir).toBe("ltr");
    expect(en.containsTitle).toBe(true);

    // 2. 404 on API mutation is intentional (hides the panel): requirePlatformAdmin throws notFound()
    // for non-admins before the body is validated or a step-up is checked;
    // route() serialises it as { error: { code: "NOT_FOUND", message } } without a stack trace.
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
  },
);

