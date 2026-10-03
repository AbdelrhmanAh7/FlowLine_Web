import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ auth: { $context: Promise.resolve({ secret: "synthetic-confirmation-secret" }) } }));
import { assertConfirmationPost, confirmationCsrf } from "@/server/auth-confirmation";
afterEach(() => vi.unstubAllEnvs());

describe("explicit federation confirmation CSRF", () => {
  it("requires POST, exact configured origin and the same session's token", async () => {
    vi.stubEnv("FLOWLINE_PUBLIC_URL", "https://flowline.example");
    vi.stubEnv("BETTER_AUTH_URL", "https://flowline.example");
    const csrf = await confirmationCsrf("session-a");
    const request = (method: string, origin?: string, token = csrf) => new Request("https://flowline.example/api/sso/link", { method, headers: { ...(origin ? { origin } : {}), "x-flowline-csrf": token, "sec-fetch-site": "same-origin" } });
    await expect(assertConfirmationPost(request("POST", "https://flowline.example"), "session-a")).resolves.toBeUndefined();
    for (const req of [request("GET", "https://flowline.example"), request("POST"), request("POST", "null"), request("POST", "https://attacker.example"), request("POST", "https://flowline.example", "")])
      await expect(assertConfirmationPost(req, "session-a")).rejects.toMatchObject({ status: 403 });
    await expect(assertConfirmationPost(request("POST", "https://flowline.example"), "session-b")).rejects.toMatchObject({ code: "CSRF_TOKEN_INVALID" });
  });
});
