import { beforeEach, describe, expect, it, vi } from "vitest";

const guards = vi.hoisted(() => ({ handler: vi.fn(async () => Response.json({})), requestToken: vi.fn(), preview: vi.fn(), rate: vi.fn(async () => true) }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ GET: guards.handler, POST: guards.handler }) }));
vi.mock("@/lib/auth", () => ({ auth: {}, authFor: vi.fn(async () => ({})) }));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("@/server/access", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/crypto", () => ({ sha256Hex: String }));
vi.mock("@/server/platform-secrets", () => ({ markPlatformSecretVerified: vi.fn(), resolvePlatformCredential: vi.fn(async () => null) }));
vi.mock("@/server/zitadel-config", () => ({ activeZitadelConfig: vi.fn(async () => null) }));
vi.mock("@/server/beta", () => ({ betaMode: () => "open", previewSignUp: guards.preview }));
vi.mock("@/server/rate-limit", () => ({ checkRate: guards.rate }));
vi.mock("@/server/email/flows", () => ({ consumeAccountToken: vi.fn(), issueAccountToken: vi.fn(), requestToken: guards.requestToken, sendNotice: vi.fn(), tokenState: vi.fn(), checkSharedRate: vi.fn() }));

import { dispatchAuth } from "@/server/auth-dispatch";
import { POST as email } from "@/app/api/email/route";
import { POST as beta } from "@/app/api/beta/check/route";
import { AUTH_BODY_MAX_BYTES, PUBLIC_JSON_MAX_BYTES } from "@/server/public-body";

beforeEach(() => { guards.handler.mockClear(); guards.requestToken.mockClear(); guards.preview.mockClear(); });
describe("public route caps before downstream work", () => {
  for (const [path, invoke, budget] of [
    ["/api/email", (req: Request) => email(req, undefined), PUBLIC_JSON_MAX_BYTES],
    ["/api/beta/check", (req: Request) => beta(req, undefined), PUBLIC_JSON_MAX_BYTES],
    ...["sign-in/social", "link-social", "sign-in/email", "sign-up/email", "callback/google", "callback/zitadel", "two-factor/verify-totp"].map((path) => [`/api/auth/${path}`, (req: Request) => dispatchAuth(req, "POST"), AUTH_BODY_MAX_BYTES] as const),
  ] as const) {
    for (const length of [undefined, "1", String(budget + 1)]) {
      it(`${path} returns 413 before handler/DB/provider work with declared length ${length ?? "absent"}`, async () => {
        const request = new Request(`https://flowline.example${path}`, { method: "POST", headers: { "content-type": "application/json", ...(length ? { "content-length": length } : {}) }, body: " ".repeat(budget + 1) });
        const response = await invoke(request);
        expect(response.status).toBe(413);
        expect(guards.handler).not.toHaveBeenCalled(); expect(guards.requestToken).not.toHaveBeenCalled(); expect(guards.preview).not.toHaveBeenCalled();
      });
    }
  }
  it("allows ordinary email and beta requests", async () => {
    const req = (path: string, body: unknown) => new Request(`https://flowline.example${path}`, { method: "POST", body: JSON.stringify(body) });
    expect((await email(req("/api/email", { action: "forgot", email: "synthetic@example.test" }), undefined)).status).toBe(200);
    expect(guards.requestToken).toHaveBeenCalledTimes(1);
    expect((await beta(req("/api/beta/check", { email: "synthetic@example.test" }), undefined)).status).toBe(200);
  });
});
