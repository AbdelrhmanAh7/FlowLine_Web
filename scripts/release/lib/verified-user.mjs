/**
 * A signed-in, email-VERIFIED user for the release / load scripts (Phase 4: `requireEmailVerification: true`, so a
 * fresh sign-up has no session).
 *
 *   const s = new Session();                        // any object with `cookie` and `req(path, { method, json })`
 *   await verifiedUser({ base, session: s, email, password, name, betaCode, tokenSource });
 *
 * Steps: POST /api/auth/sign-up/email (429 → back off and retry) → read the verification token → POST /api/email
 * { action: "verify", token } (the real endpoint; the DB is never written to mark a user verified) →
 * POST /api/auth/sign-in/email, which leaves the session cookie on `session`.
 *
 * Token sources (`tokenSource`), tried in this order:
 *   { outbox: true }       test stack only (FLOWLINE_ENV=test): GET /api/test/outbox?email=…
 *   { dbUrl: "postgres…" } read the newest `email_outbox` row for the recipient (the stack must run with
 *                          FLOWLINE_EMAIL_PROVIDER=outbox) and take the /verify-email?token= link from it.
 *   neither                fail with a clear message.
 * An older build without required verification (sign-up already returns a session) is accepted as is, so the
 * rollback check can seed users on a pre-Phase-4 "known good" image.
 */
import { extractEmailToken } from "./email-token.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryAfterMs = (res, fallbackS) => (Number(res.headers.get("x-retry-after") ?? res.headers.get("retry-after")) || fallbackS) * 1000;
const snippet = async (res) => (await res.text().catch(() => "")).slice(0, 200);

/** POST with 429 back-off (sign-up and sign-in are rate limited per IP in production builds). */
async function postWithBackoff(session, path, json, { attempts = 20, onRateLimited } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await session.req(path, { method: "POST", json });
    if (res.status !== 429 || attempt >= attempts) return res;
    onRateLimited?.(path);
    await sleep(retryAfterMs(res, 6));
  }
}

/** Newest verification token for `email` from the test-only outbox route. */
async function tokenFromTestOutbox(base, email) {
  const res = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`);
  if (res.status === 404) throw new Error("GET /api/test/outbox → 404: --outbox only works on the test stack (FLOWLINE_ENV=test)");
  if (!res.ok) return null;
  const box = await res.json();
  for (const m of box.messages ?? []) {
    if (m.purpose !== "verify") continue;
    const token = extractEmailToken(m.link ?? m.text);
    if (token) return token;
  }
  return null;
}

/** Newest verification token for `email` from the email_outbox table (outbox provider). */
async function tokenFromDb(dbUrl, email) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: dbUrl });
  await c.connect();
  try {
    const { rows } = await c.query(
      "select plain_text, html from email_outbox where lower(recipient) = lower($1) and tags->>'purpose' = 'verify' order by created_at desc limit 1",
      [email],
    );
    return rows[0] ? extractEmailToken(rows[0].plain_text) ?? extractEmailToken(rows[0].html) : null;
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * @param {object} o
 * @param {string} o.base                       e.g. http://localhost:3200 (no trailing slash)
 * @param {{ cookie: string, req: (path: string, init?: object) => Promise<Response> }} o.session
 * @param {string} o.email
 * @param {string} o.password
 * @param {string} [o.name]
 * @param {string} [o.betaCode]                 beta access code (FLOWLINE_BETA_MODE=invite_only)
 * @param {{ outbox?: boolean, dbUrl?: string }} [o.tokenSource]
 * @param {(path: string) => void} [o.onRateLimited]  called on every 429 back-off
 * @param {number} [o.waitMs]                   how long to wait for the email to appear (default 15 s)
 * @returns {Promise<{ email: string, verification: "verified" | "not-required", via?: "test-outbox" | "db-outbox" }>}
 */
export async function verifiedUser({ base, session, email, password, name = "Release check", betaCode, tokenSource = {}, onRateLimited, waitMs = 15_000 }) {
  base = base.replace(/\/+$/, "");
  const via = tokenSource.outbox ? "test-outbox" : tokenSource.dbUrl ? "db-outbox" : null;
  if (!via) {
    throw new Error(
      "email verification is required on this build but no way to read the verification email was given: " +
        "pass --outbox (test stack) or give the script DB access to a stack running FLOWLINE_EMAIL_PROVIDER=outbox (--env <file>)",
    );
  }

  const up = await postWithBackoff(session, "/api/auth/sign-up/email", { email, password, name, ...(betaCode ? { betaCode } : {}) }, { onRateLimited });
  if (!up.ok) {
    const body = await snippet(up);
    const hint = /email provider|outbox|delivery/i.test(body) ? " (the verification email could not be sent — is FLOWLINE_EMAIL_PROVIDER=outbox allowed on this stack?)" : /BETA_INVITE_REQUIRED|private beta/i.test(body) ? " (invite-only beta: pass a beta code)" : "";
    throw new Error(`sign-up ${email} → ${up.status} ${body}${hint}`);
  }
  // Pre-Phase-4 builds sign the new user in straight away.
  if (session.cookie) {
    const me = await session.req("/api/auth/get-session");
    if (me.ok && (await me.json().catch(() => null))?.user) return { email, verification: "not-required" };
  }

  let token = null;
  const end = Date.now() + waitMs;
  while (!token && Date.now() < end) {
    token = via === "test-outbox" ? await tokenFromTestOutbox(base, email) : await tokenFromDb(tokenSource.dbUrl, email);
    if (!token) await sleep(500);
  }
  if (!token) {
    throw new Error(
      via === "test-outbox"
        ? `no verification email for ${email} in the test outbox after ${waitMs / 1000} s`
        : `no verification email for ${email} in email_outbox after ${waitMs / 1000} s — the stack must run with FLOWLINE_EMAIL_PROVIDER=outbox (a NODE_ENV=production build refuses that provider outside FLOWLINE_ENV=test)`,
    );
  }

  const v = await session.req("/api/email", { method: "POST", json: { action: "verify", token } });
  const vBody = await v.json().catch(() => ({}));
  if (!v.ok || vBody.status !== "done") throw new Error(`email verification for ${email} → HTTP ${v.status} status ${vBody.status ?? "?"}`);

  const inRes = await postWithBackoff(session, "/api/auth/sign-in/email", { email, password }, { onRateLimited });
  if (!inRes.ok || !session.cookie) throw new Error(`sign-in ${email} → ${inRes.status} ${await snippet(inRes)}`);
  return { email, verification: "verified", via };
}

