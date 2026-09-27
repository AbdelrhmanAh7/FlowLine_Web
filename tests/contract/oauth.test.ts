import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFake, type Fake } from "./helpers";

/**
 * Exercises the fake provider server's OAuth implementation itself
 * (auto-approve authorize, PKCE S256, refresh rotation, revoke, two accounts).
 */
let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

const REDIRECT_URI = "http://localhost:1/callback";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function authorize(provider: string, challenge: string, account?: "second"): Promise<string> {
  const url = new URL(`${fake.url}/${provider}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "fake-client");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", "state-123");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (account) url.searchParams.set("fake_account", account);
  const res = await fetch(url, { redirect: "manual" });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location")!);
  expect(location.origin + location.pathname).toBe(REDIRECT_URI);
  expect(location.searchParams.get("state")).toBe("state-123");
  return location.searchParams.get("code")!;
}

async function token(provider: string, form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${fake.url}/${provider}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("fake OAuth: authorization code + PKCE", () => {
  it("issues tokens for a valid code exchange and rejects a PKCE mismatch", async () => {
    const { verifier, challenge } = pkce();
    const code = await authorize("google_sheets", challenge);

    const bad = await token("google_sheets", {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: "fake-client",
      code_verifier: "wrong-verifier",
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_grant");

    // Failed PKCE consumes nothing more than the attempt; authorize again for the good exchange.
    const code2 = await authorize("google_sheets", challenge);
    const good = await token("google_sheets", {
      grant_type: "authorization_code",
      code: code2,
      redirect_uri: REDIRECT_URI,
      client_id: "fake-client",
      code_verifier: verifier,
    });
    expect(good.status).toBe(200);
    expect(good.body.access_token).toMatch(/^fake-at-/);
    expect(good.body.refresh_token).toMatch(/^fake-rt-/);

    // Codes are single-use.
    const replay = await token("google_sheets", {
      grant_type: "authorization_code",
      code: code2,
      redirect_uri: REDIRECT_URI,
      client_id: "fake-client",
      code_verifier: verifier,
    });
    expect(replay.status).toBe(400);
  });

  it("the issued access token identifies account A, a second login identifies account B", async () => {
    const a = pkce();
    const codeA = await authorize("google_sheets", a.challenge);
    const tokA = await token("google_sheets", { grant_type: "authorization_code", code: codeA, redirect_uri: REDIRECT_URI, client_id: "c", code_verifier: a.verifier });
    const meA = await fetch(`${fake.url}/google_sheets/oauth2/v3/userinfo`, { headers: { authorization: `Bearer ${tokA.body.access_token}` } });
    expect((await meA.json()).email).toBe("alice@flowline.test");

    const b = pkce();
    const codeB = await authorize("google_sheets", b.challenge, "second");
    const tokB = await token("google_sheets", { grant_type: "authorization_code", code: codeB, redirect_uri: REDIRECT_URI, client_id: "c", code_verifier: b.verifier });
    const meB = await fetch(`${fake.url}/google_sheets/oauth2/v3/userinfo`, { headers: { authorization: `Bearer ${tokB.body.access_token}` } });
    expect((await meB.json()).email).toBe("bob@flowline.test");
  });
});

describe("fake OAuth: refresh token rotation", () => {
  it("rotates on use; a reused rotated token and a denied token are rejected", async () => {
    const { verifier, challenge } = pkce();
    const code = await authorize("slack", challenge);
    const first = await token("slack", { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: "c", code_verifier: verifier });
    expect(first.status).toBe(200);

    const rotated = await token("slack", { grant_type: "refresh_token", refresh_token: String(first.body.refresh_token) });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(first.body.refresh_token);

    // Reusing the already-rotated token must fail.
    const reused = await token("slack", { grant_type: "refresh_token", refresh_token: String(first.body.refresh_token) });
    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe("invalid_grant");

    // A denied refresh token must fail.
    const denied = await token("slack", { grant_type: "refresh_token", refresh_token: "denied-refresh-token" });
    expect(denied.status).toBe(400);
    expect(denied.body.error).toBe("invalid_grant");
  });
});

describe("fake OAuth: revoke", () => {
  it("revoked access tokens stop working", async () => {
    const { verifier, challenge } = pkce();
    const code = await authorize("github", challenge);
    const tok = await token("github", { grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: "c", code_verifier: verifier });
    expect(tok.status).toBe(200);

    const before = await fetch(`${fake.url}/github/user`, { headers: { authorization: `Bearer ${tok.body.access_token}` } });
    expect(before.status).toBe(200);

    const revoke = await fetch(`${fake.url}/github/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: String(tok.body.access_token) }).toString(),
    });
    expect(revoke.status).toBe(200);

    const after = await fetch(`${fake.url}/github/user`, { headers: { authorization: `Bearer ${tok.body.access_token}` } });
    expect(after.status).toBe(401);
  });
});
