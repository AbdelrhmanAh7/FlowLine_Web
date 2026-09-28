import { describe, expect, it } from "vitest";
import { extractEmailToken, parseEnvFile, percentile } from "../../scripts/release/lib/email-token.mjs";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd"; // 42 chars, base64url like randomToken(32)

describe("release scripts: extractEmailToken", () => {
  it("reads the token from the verification email's plain text", () => {
    const text = `Confirm your email\n\nWelcome.\n\nConfirm email: http://localhost:3200/verify-email?token=${TOKEN}\n\nYou received this because…`;
    expect(extractEmailToken(text)).toBe(TOKEN);
  });

  it("keeps only the token when a callbackURL follows it", () => {
    const text = `Confirm email: https://beta.example.com/verify-email?token=${TOKEN}&callbackURL=%2Fsign-in%3Fnext%3Dinvite%3Aabc`;
    expect(extractEmailToken(text)).toBe(TOKEN);
  });

  it("reads HTML hrefs with &amp; and ignores trailing punctuation", () => {
    expect(extractEmailToken(`<a href="http://x.test/verify-email?token=${TOKEN}&amp;callbackURL=%2Fapp">Confirm</a>`)).toBe(TOKEN);
    expect(extractEmailToken(`Open http://x.test/verify-email?token=${TOKEN}.`)).toBe(TOKEN);
  });

  it("matches the purpose's path only", () => {
    const reset = `Reset: http://x.test/reset-password?token=${TOKEN}`;
    expect(extractEmailToken(reset)).toBeNull();
    expect(extractEmailToken(reset, "reset")).toBe(TOKEN);
    expect(extractEmailToken(`http://x.test/account/delete?token=${TOKEN}`)).toBeNull();
  });

  it("rejects missing, malformed or too-short tokens", () => {
    expect(extractEmailToken(null)).toBeNull();
    expect(extractEmailToken("")).toBeNull();
    expect(extractEmailToken("no link here")).toBeNull();
    expect(extractEmailToken("http://x.test/verify-email?token=short")).toBeNull();
    expect(extractEmailToken("http://x.test/verify-email")).toBeNull();
    expect(extractEmailToken(`http://x.test/verify-email?token=${TOKEN}%3Cscript`)).toBeNull();
  });

  it("takes the first valid verification link when several links are present", () => {
    const other = TOKEN.replace("AbCd", "ZZZZ");
    const text = `Home: http://x.test/app\nConfirm: http://x.test/verify-email?token=${TOKEN}\nAgain: http://x.test/verify-email?token=${other}`;
    expect(extractEmailToken(text)).toBe(TOKEN);
  });
});

describe("release scripts: parseEnvFile", () => {
  it("parses KEY=value lines, keeps '=' inside values, strips one pair of quotes, skips comments", () => {
    const env = parseEnvFile(`# comment\r\nSTAGING_DB_PASSWORD=a=b=c\nFLOWLINE_EMAIL_FROM="Flowline <no-reply@x.test>"\n\nlowercase=ignored\nEMPTY=\n`);
    expect(env).toEqual({ STAGING_DB_PASSWORD: "a=b=c", FLOWLINE_EMAIL_FROM: "Flowline <no-reply@x.test>", EMPTY: "" });
  });
});

describe("release scripts: percentile", () => {
  it("nearest-rank percentiles", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile(xs, 99)).toBe(99);
    expect(percentile([3.4], 95)).toBe(3);
    expect(percentile([], 95)).toBeNull();
  });
});
